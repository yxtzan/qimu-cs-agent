"use client";

import type { RouteTrace } from "@/lib/types";
import { intentLabel, RISK_LABEL, TOOL_LABEL } from "@/components/seller/labels";
import { LayerBadge } from "@/components/seller/ui";

/** ¥ 金额：成本很小，保留足够的小数位（例：¥0.00014）。 */
function cny(usd: number, rate = 7.1): string {
  const v = usd * rate;
  if (v === 0) return "¥0";
  if (v < 0.001) return `¥${v.toFixed(5)}`;
  if (v < 0.01) return `¥${v.toFixed(4)}`;
  if (v < 1) return `¥${v.toFixed(3)}`;
  return `¥${v.toFixed(2)}`;
}

/**
 * 调试信息行（PRD §4.2）：每条 AI 回复下方一行小字
 *   `L2 上下文层 · refund_progress · 0.91 · 186ms · ¥0.00002`
 * 层级徽标配色见 PRD §7（风险闸门=橙、L1=灰蓝、L2=墨绿、L3=紫、人工=红）。
 */
export function DebugLine({ trace }: { trace: RouteTrace }) {
  const parts: string[] = [];
  if (trace.intent) parts.push(trace.intent);
  if (trace.ruleId) parts.push(`规则 ${trace.ruleId}`);
  if (trace.confidence !== undefined) parts.push(trace.confidence.toFixed(2));
  parts.push(`${trace.latency.totalMs}ms`);
  parts.push(cny(trace.cost.totalUsd));

  const extras: string[] = [];
  if (trace.riskHit && trace.riskHit.length > 0) extras.push(`命中风险：${trace.riskHit.map((k) => RISK_LABEL[k] ?? k).join("、")}`);
  if (trace.toolCalls.length > 0) {
    extras.push(`工具：${trace.toolCalls.map((t) => `${TOOL_LABEL[t.name] ?? t.name}${t.ok ? "" : "✗"} ${t.ms}ms`).join(" → ")}`);
  }
  if (trace.escalatedFrom) extras.push(`由 ${trace.escalatedFrom} 升级转人工`);

  return (
    <div
      className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-lg border border-dashed border-line bg-white/60 px-2 py-1 text-[11px] leading-4 text-warm"
      data-testid="debug-line"
      title={trace.intent ? `意图：${intentLabel(trace.intent)}` : undefined}
    >
      <LayerBadge layer={trace.layer} />
      <span className="font-mono tracking-tight">{parts.join(" · ")}</span>
      {extras.map((x) => (
        <span key={x} className="basis-full text-[11px] text-warm/90">
          {x}
        </span>
      ))}
    </div>
  );
}
