/**
 * 看板聚合（T17）：GET /api/analytics/routing 的实现。
 *
 * 统计口径严格按 docs/CONTRACTS.md §6「统计口径」七条（与前端 lib/mock/analytics.ts 一致）：
 *  1. 统计单位是买家消息（每条对应一条 RouteTrace）；byLayer 只含 risk_gate / L1 / L2 / L3 / human 五层；
 *     layer="action"（确认卡片动作）既不进漏斗，也不计入 totals.messages。
 *  2. handoffRate = (risk_gate + human) / messages；autoResolvedRate = 1 − handoffRate。
 *  3. share = 该层条数 / messages；costPer1kCny = 该层单条平均 totalUsd × 1000 × USD_TO_CNY；avgLatencyMs 取 latency.totalMs 平均。
 *  4. lowConfidence：只收 L2 / L3 且 confidence < L2_CONFIDENCE_THRESHOLD 的消息，最近的在前，最多 10 条，text 为买家原话。
 *  5. timeseries：today 按小时（当天 00:00 到当前小时），7d 按天（共 7 格，含今天）；没有数据的格子补 0。
 *  6. byIntent 返回全部出现过的意图（前端取 Top 8），stage 为意图所属阶段。
 *  7. latestEval 读 data/runtime/eval_latest.json（T06 产出），没有则省略。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { nowIso } from "../demo-clock";
import { usdToCny } from "../llm/cost";
import { getMessage, listTraces } from "../store/conversations";
import type { EvalReport, IntentId, Layer, RiskKey, RouteTrace, RoutingAnalytics, Stage } from "../types";
import { ALL_STAGES, STAGE_OF_INTENT } from "./intents";

const FUNNEL: Exclude<Layer, "action">[] = ["risk_gate", "L1", "L2", "L3", "human"];
const LOW_CONFIDENCE_LIMIT = 10;
const pad = (n: number) => String(n).padStart(2, "0");

/** 低置信度阈值：环境变量 L2_CONFIDENCE_THRESHOLD，默认 0.70。 */
function lowConfidenceThreshold(): number {
  const raw = Number(process.env.L2_CONFIDENCE_THRESHOLD);
  return Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : 0.7;
}

/** 任意 ISO 时间 → 东八区的 "YYYY-MM-DDTHH:mm:ss"（只用来切日期 / 小时）。 */
function cstParts(iso: string): string {
  return new Date(Date.parse(iso) + 8 * 3600 * 1000).toISOString().slice(0, 19);
}

function addDays(date: string, delta: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + delta * 86400000).toISOString().slice(0, 10);
}

/** 最近一次评测结果（T06 写入 data/runtime/eval_latest.json）；没有或读不出来就返回 undefined。 */
export function readLatestEval(): EvalReport | undefined {
  const file = join(process.cwd(), "data", "runtime", "eval_latest.json");
  if (!existsSync(file)) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as EvalReport) : undefined;
  } catch {
    return undefined;
  }
}

/** 纯聚合：给定一批 trace（已按时间范围筛过）算出看板数据。textOf 用来取买家原话。 */
export function aggregateRouting(
  range: "today" | "7d",
  includeSimulated: boolean,
  allTraces: RouteTrace[],
  nowStr: string,
  textOf: (trace: RouteTrace) => string,
  latestEval?: EvalReport,
): RoutingAnalytics {
  const today = cstParts(nowStr).slice(0, 10);
  const startDate = range === "today" ? today : addDays(today, -6);
  const startMs = Date.parse(`${startDate}T00:00:00+08:00`);
  const rows = allTraces.filter((t) => t.layer !== "action" && Date.parse(t.at) >= startMs);
  const total = rows.length;
  const rate = usdToCny(1);

  // 口径 1、3：各层
  const acc = new Map<Layer, { count: number; ms: number; usd: number }>(
    FUNNEL.map((layer) => [layer, { count: 0, ms: 0, usd: 0 }]),
  );
  for (const t of rows) {
    const a = acc.get(t.layer);
    if (!a) continue;
    a.count += 1;
    a.ms += t.latency.totalMs;
    a.usd += t.cost.totalUsd;
  }
  const byLayer: RoutingAnalytics["byLayer"] = FUNNEL.map((layer) => {
    const a = acc.get(layer)!;
    return {
      layer,
      count: a.count,
      share: total ? a.count / total : 0,
      avgLatencyMs: a.count ? Math.round(a.ms / a.count) : 0,
      costPer1kCny: a.count ? Math.round((a.usd / a.count) * 1000 * rate * 100) / 100 : 0,
    };
  });

  // 口径 2
  const handoff = (acc.get("risk_gate")?.count ?? 0) + (acc.get("human")?.count ?? 0);

  // 口径 6：阶段 / 意图 / 风险
  const stageCount = new Map<Stage, number>(ALL_STAGES.map((s) => [s, 0]));
  const intentCount = new Map<IntentId, { stage: Stage; count: number }>();
  const riskCount = new Map<RiskKey, number>();
  for (const t of rows) {
    const intent: IntentId = t.intent ?? "other";
    const stage: Stage = t.stage ?? STAGE_OF_INTENT[intent] ?? "other";
    stageCount.set(stage, (stageCount.get(stage) ?? 0) + 1);
    const cur = intentCount.get(intent) ?? { stage, count: 0 };
    cur.count += 1;
    intentCount.set(intent, cur);
    for (const key of t.riskHit ?? []) riskCount.set(key, (riskCount.get(key) ?? 0) + 1);
  }

  // 口径 4
  const threshold = lowConfidenceThreshold();
  const lowConfidence: RoutingAnalytics["lowConfidence"] = rows
    .filter((t) => (t.layer === "L2" || t.layer === "L3") && t.confidence !== undefined && t.confidence < threshold)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, LOW_CONFIDENCE_LIMIT)
    .map((t) => ({
      traceId: t.id,
      conversationId: t.conversationId,
      text: textOf(t),
      intent: t.intent,
      confidence: t.confidence,
      at: t.at,
    }));

  // 口径 5：时间序列，没数据的格子补 0
  const buckets: RoutingAnalytics["timeseries"] = [];
  const bucketIndex = new Map<string, number>();
  const makeBucket = (key: string) => {
    bucketIndex.set(key, buckets.length);
    buckets.push({ bucket: key, L1: 0, L2: 0, L3: 0, risk_gate: 0, human: 0 });
  };
  if (range === "today") {
    const curHour = Number(cstParts(nowStr).slice(11, 13));
    for (let h = 0; h <= curHour; h++) makeBucket(`${today}T${pad(h)}:00:00+08:00`);
  } else {
    for (let d = -6; d <= 0; d++) makeBucket(addDays(today, d));
  }
  for (const t of rows) {
    const local = cstParts(t.at);
    const key = range === "today" ? `${local.slice(0, 13)}:00:00+08:00` : local.slice(0, 10);
    const idx = bucketIndex.get(key);
    if (idx === undefined) continue;
    if (t.layer !== "action") buckets[idx][t.layer] += 1;
  }

  return {
    range,
    includesSimulated: includeSimulated,
    totals: {
      messages: total,
      autoResolvedRate: total ? 1 - handoff / total : 0,
      handoffRate: total ? handoff / total : 0,
      avgLatencyMs: total ? Math.round(rows.reduce((s, t) => s + t.latency.totalMs, 0) / total) : 0,
    },
    byLayer,
    byStage: ALL_STAGES.map((stage) => ({ stage, count: stageCount.get(stage) ?? 0 })),
    byIntent: [...intentCount.entries()]
      .map(([intent, v]) => ({ intent, stage: v.stage, count: v.count }))
      .sort((a, b) => b.count - a.count),
    riskHits: [...riskCount.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
    lowConfidence,
    timeseries: buckets,
    ...(latestEval ? { latestEval } : {}),
  };
}

/** 读数据层里的 trace 并聚合（API 用）。 */
export function getRoutingAnalytics(range: "today" | "7d", includeSimulated = true): RoutingAnalytics {
  return aggregateRouting(
    range,
    includeSimulated,
    listTraces({ includeSimulated }),
    nowIso(),
    (t) => getMessage(t.messageId)?.text ?? "",
    readLatestEval(),
  );
}
