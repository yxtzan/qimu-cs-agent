"use client";

import { intentLabel, LAYER_META, RISK_LABEL, TOOL_LABEL } from "@/components/seller/labels";
import type { RiskKey, RouteTrace } from "@/lib/types";

/** 与聊天窗调试行同一套换算（DebugLine），避免两边数字对不上。 */
function cny(usd: number, rate = 7.1): string {
  const v = usd * rate;
  if (v === 0) return "¥0";
  if (v < 0.001) return `¥${v.toFixed(5)}`;
  if (v < 0.01) return `¥${v.toFixed(4)}`;
  if (v < 1) return `¥${v.toFixed(3)}`;
  return `¥${v.toFixed(2)}`;
}

const RISK_ORDER: RiskKey[] = ["legal_threat", "health_safety", "fraud_security", "abuse_extreme", "emotion"];

export function TraceFacts({ trace }: { trace: RouteTrace }) {
  const layer = LAYER_META[trace.layer]?.label ?? trace.layer;
  const intent = trace.intent ? `${trace.intent}（${intentLabel(trace.intent)}）` : "—";
  const confidence = trace.confidence !== undefined ? trace.confidence.toFixed(2) : "—";
  const tools =
    trace.toolCalls.length > 0
      ? trace.toolCalls.map((t) => `${TOOL_LABEL[t.name] ?? t.name}${t.ok ? "" : "（失败）"}`).join(" → ")
      : "这一轮没有调用工具";
  const scores = RISK_ORDER.filter((k) => trace.riskScores?.[k] !== undefined).map(
    (k) => `${RISK_LABEL[k]} ${Number(trace.riskScores?.[k]).toFixed(2)}`,
  );
  const hits = trace.riskHit?.map((k) => RISK_LABEL[k] ?? k) ?? [];

  const rows: { label: string; value: string }[] = [
    { label: "层级", value: layer },
    { label: "意图", value: intent },
    { label: "置信度", value: confidence },
    { label: "耗时", value: `${trace.latency.totalMs}ms` },
    { label: "花费", value: cny(trace.cost.totalUsd) },
    { label: "工具", value: tools },
  ];
  if (trace.ruleId) rows.push({ label: "规则", value: trace.ruleId });
  if (scores.length > 0) rows.push({ label: "风险分数", value: scores.join(" · ") });
  if (hits.length > 0) rows.push({ label: "命中风险", value: hits.join("、") });

  return (
    <dl data-testid="demo-trace" className="mt-2 space-y-1 rounded-lg bg-white px-2.5 py-2 text-[12px] leading-5 text-foreground">
      {rows.map((row) => (
        <div key={row.label} className="flex gap-2">
          <dt className="w-14 shrink-0 text-warm">{row.label}</dt>
          <dd className="min-w-0 break-words font-medium">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function FunnelDiagram() {
  const rows = [
    ["风险闸门", "每条消息先过一遍"],
    ["L1 规则", "固定短句，毫秒级"],
    ["L2 Jev", "便宜的判断模型"],
    ["L3 大模型", "复杂的多步问题"],
    ["人工", "拿不准就交给人"],
  ];
  return (
    <div className="mt-2 space-y-1" aria-hidden>
      {rows.map(([name, note], i) => (
        <div
          key={name}
          className="mx-auto rounded-lg bg-white px-2 py-1 text-center text-[12px] leading-5 text-foreground ring-1 ring-line"
          style={{ width: `${100 - i * 8}%` }}
        >
          <span className="font-semibold">{name}</span>
          <span className="text-warm"> · {note}</span>
        </div>
      ))}
    </div>
  );
}

export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
