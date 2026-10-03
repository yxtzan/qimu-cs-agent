/**
 * 看板 / 评测 mock（CONTRACTS §6）。形状严格符合 lib/types.ts 的 RoutingAnalytics / EvalReport。
 *
 * 数据 = 种子流量（lib/mock/traffic.ts，虚构的约 295 条历史消息）+ 本次演示里买家端真实产生的 RouteTrace
 * （和卖家端会话共用 lib/mock/seller.ts 的内存数据，所以在买家端发一条消息，刷新看板数字就会变）。
 */
import { nowIso } from "@/lib/demo-clock";
import type { EvalReport, IntentId, Layer, RiskKey, RouteTrace, RoutingAnalytics, Stage } from "@/lib/types";
import { mockSellerStore } from "./seller";
import { simulatedTraffic, STAGE_OF_INTENT } from "./traffic";

/** 低置信度阈值（与后端 L2_CONFIDENCE_THRESHOLD 默认值一致）。 */
const LOW_CONFIDENCE = 0.7;
const USD_TO_CNY = 7.1;
const FUNNEL: Exclude<Layer, "action">[] = ["risk_gate", "L1", "L2", "L3", "human"];
const STAGES: Stage[] = ["presale", "insale", "aftersale", "other"];

const delay = (ms = 140) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const pad = (n: number) => String(n).padStart(2, "0");

export const MOCK_EVAL: EvalReport = {
  runAt: "2026-10-04T23:40:00+08:00",
  provider: "jev",
  cases: 60,
  intentAccuracy: 0.883,
  layerAccuracy: 0.917,
  riskRecall: 0.95,
  riskFalsePositiveRate: 0.025,
  avgLatencyMs: 412,
  failures: [
    { caseId: "E012", text: "这件裙子腰有点紧，能退吗", expected: "L2 / refund_apply", got: "L1 / R007（规则误吞）" },
    { caseId: "E027", text: "我想把那个换一下", expected: "L3 / multi_step_complex", got: "L2 / exchange（槽位没补全）" },
    { caseId: "E031", text: "穿了以后皮肤有点痒", expected: "risk_gate / health_safety", got: "L2 / quality_issue（风险漏判）" },
    { caseId: "E044", text: "发票能开成公司抬头吗", expected: "L2 / invoice", got: "L2 / return_policy（分类错）" },
    { caseId: "E052", text: "多久能到，不行我就退了", expected: "L2 / logistics_track", got: "L2 / refund_apply（分类错）" },
  ],
};

interface Row {
  trace: RouteTrace;
  text: string;
}

function liveRows(): Row[] {
  const rows: Row[] = [];
  for (const seed of mockSellerStore()) {
    if (seed.conversation.isSimulated) continue; // 模拟会话的 trace 由 simulatedTraffic() 提供，避免重复计数
    for (const trace of seed.traces) {
      const msg = seed.messages.find((m) => m.id === trace.messageId);
      rows.push({ trace, text: msg?.text ?? "" });
    }
  }
  return rows;
}

function addDays(date: string, delta: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + delta * 86400000).toISOString().slice(0, 10);
}

export async function mockGetRoutingAnalytics(range: "today" | "7d", includeSimulated = true): Promise<RoutingAnalytics> {
  await delay();
  const nowStr = nowIso();
  const today = nowStr.slice(0, 10);
  const startDate = range === "today" ? today : addDays(today, -6);
  const startMs = Date.parse(`${startDate}T00:00:00+08:00`);

  const all: Row[] = [...liveRows(), ...(includeSimulated ? simulatedTraffic() : [])];
  const rows = all.filter(
    (r) => r.trace.layer !== "action" && Date.parse(r.trace.at) >= startMs,
  );

  // 各层
  const byLayerRaw = new Map<Layer, { count: number; ms: number; usd: number }>();
  for (const layer of FUNNEL) byLayerRaw.set(layer, { count: 0, ms: 0, usd: 0 });
  for (const { trace } of rows) {
    const acc = byLayerRaw.get(trace.layer);
    if (!acc) continue;
    acc.count += 1;
    acc.ms += trace.latency.totalMs;
    acc.usd += trace.cost.totalUsd;
  }
  const total = rows.length;
  const byLayer: RoutingAnalytics["byLayer"] = FUNNEL.map((layer) => {
    const a = byLayerRaw.get(layer)!;
    return {
      layer,
      count: a.count,
      share: total ? a.count / total : 0,
      avgLatencyMs: a.count ? Math.round(a.ms / a.count) : 0,
      costPer1kCny: a.count ? Math.round((a.usd / a.count) * 1000 * USD_TO_CNY * 100) / 100 : 0,
    };
  });
  const handoff = (byLayerRaw.get("risk_gate")?.count ?? 0) + (byLayerRaw.get("human")?.count ?? 0);

  // 阶段 / 意图 / 风险
  const stageCount = new Map<Stage, number>(STAGES.map((s) => [s, 0]));
  const intentCount = new Map<IntentId, { stage: Stage; count: number }>();
  const riskCount = new Map<RiskKey, number>();
  for (const { trace } of rows) {
    const intent = trace.intent ?? "other";
    const stage = trace.stage ?? STAGE_OF_INTENT[intent] ?? "other";
    stageCount.set(stage, (stageCount.get(stage) ?? 0) + 1);
    const cur = intentCount.get(intent) ?? { stage, count: 0 };
    cur.count += 1;
    intentCount.set(intent, cur);
    for (const key of trace.riskHit ?? []) riskCount.set(key, (riskCount.get(key) ?? 0) + 1);
  }

  // 低置信度样本（最近的在前）
  const lowConfidence: RoutingAnalytics["lowConfidence"] = rows
    .filter((r) => (r.trace.layer === "L2" || r.trace.layer === "L3") && r.trace.confidence !== undefined && r.trace.confidence < LOW_CONFIDENCE)
    .sort((a, b) => Date.parse(b.trace.at) - Date.parse(a.trace.at))
    .slice(0, 10)
    .map((r) => ({
      traceId: r.trace.id,
      conversationId: r.trace.conversationId,
      text: r.text,
      intent: r.trace.intent,
      confidence: r.trace.confidence,
      at: r.trace.at,
    }));

  // 时间序列：今天按小时，近 7 天按天
  const buckets: RoutingAnalytics["timeseries"] = [];
  const bucketIndex = new Map<string, number>();
  const makeBucket = (key: string) => {
    bucketIndex.set(key, buckets.length);
    buckets.push({ bucket: key, L1: 0, L2: 0, L3: 0, risk_gate: 0, human: 0 });
  };
  if (range === "today") {
    const curHour = Number(nowStr.slice(11, 13));
    for (let h = 0; h <= curHour; h++) makeBucket(`${today}T${pad(h)}:00:00+08:00`);
  } else {
    for (let d = -6; d <= 0; d++) makeBucket(addDays(today, d));
  }
  for (const { trace } of rows) {
    const key = range === "today" ? `${trace.at.slice(0, 13)}:00:00+08:00` : trace.at.slice(0, 10);
    const idx = bucketIndex.get(key);
    if (idx === undefined) continue;
    const b = buckets[idx];
    if (trace.layer === "L1" || trace.layer === "L2" || trace.layer === "L3" || trace.layer === "risk_gate" || trace.layer === "human") {
      b[trace.layer] += 1;
    }
  }

  return {
    range,
    includesSimulated: includeSimulated,
    totals: {
      messages: total,
      autoResolvedRate: total ? 1 - handoff / total : 0,
      handoffRate: total ? handoff / total : 0,
      avgLatencyMs: total ? Math.round(rows.reduce((s, r) => s + r.trace.latency.totalMs, 0) / total) : 0,
    },
    byLayer,
    byStage: STAGES.map((stage) => ({ stage, count: stageCount.get(stage) ?? 0 })),
    byIntent: [...intentCount.entries()]
      .map(([intent, v]) => ({ intent, stage: v.stage, count: v.count }))
      .sort((a, b) => b.count - a.count),
    riskHits: [...riskCount.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
    lowConfidence,
    timeseries: buckets,
    latestEval: MOCK_EVAL,
  };
}

export async function mockGetLatestEval(): Promise<EvalReport | null> {
  await delay(60);
  return MOCK_EVAL;
}
