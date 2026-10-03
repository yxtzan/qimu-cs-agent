"use client";

import { useState } from "react";
import { formatCny } from "@/lib/llm/cost";
import { markTraceMisfire } from "@/lib/api-client";
import type { ChatMessage, Layer, RiskKey, RouteTrace } from "@/lib/types";
import { intentLabel, LAYER_META, RISK_LABEL, TOOL_LABEL } from "./labels";
import { bubbleTime } from "./time";
import { LayerBadge } from "./ui";

/** 与 .env.example 的 L2_CONFIDENCE_THRESHOLD 默认值一致，仅用于给人解释"为什么没走 L2"。 */
const L2_THRESHOLD = 0.7;

const RISK_KEYS: RiskKey[] = ["health_safety", "legal_threat", "fraud_security", "abuse_extreme", "emotion"];

/** 消息要依次经过的几层；"action"（确认 / 取消卡片）不走这条流水线，单独显示。 */
const PIPELINE: Layer[] = ["risk_gate", "L1", "L2", "L3", "human"];

const PIPELINE_SHORT: Record<Layer, string> = {
  risk_gate: "闸门",
  L1: "L1",
  L2: "L2",
  L3: "L3",
  human: "人工",
  action: "动作",
};

/** 一句话说明"这条消息为什么由这一层接住"。 */
export function traceReason(t: RouteTrace): string {
  const conf = t.confidence !== undefined ? t.confidence.toFixed(2) : undefined;
  switch (t.layer) {
    case "risk_gate": {
      const hits = (t.riskHit ?? []).map((k) => `${RISK_LABEL[k]} ${(t.riskScores?.[k] ?? 0).toFixed(2)}`);
      return hits.length ? `风险闸门拦截：${hits.join("、")}，直接转人工` : "风险闸门拦截，直接转人工";
    }
    case "L1":
      return t.ruleId ? `规则 ${t.ruleId} 命中，不调用大模型，毫秒级回复` : "快捷按钮 / 规则命中，毫秒级回复";
    case "L2":
      return conf
        ? `Jev 判断为「${intentLabel(t.intent)}」，置信度 ${conf} ≥ ${L2_THRESHOLD.toFixed(2)}，走确定性流程`
        : `判断为「${intentLabel(t.intent)}」，走确定性流程`;
    case "L3":
      if (t.intent === "multi_step_complex") return "多步复杂请求，交给大模型 Agent 调用多个工具";
      return conf
        ? `置信度 ${conf} < ${L2_THRESHOLD.toFixed(2)}，L2 拿不准，交给大模型 Agent`
        : "L2 拿不准，交给大模型 Agent";
    case "human":
      return t.handoffReason ?? "转交人工客服";
    case "action":
      return "买家点击了确认 / 取消卡片，直接执行，无需理解";
  }
}

function RiskBars({ trace }: { trace: RouteTrace }) {
  const scores = trace.riskScores ?? {};
  const hit = new Set(trace.riskHit ?? []);
  return (
    <ul className="space-y-1">
      {RISK_KEYS.map((k) => {
        const v = scores[k] ?? 0;
        const isHit = hit.has(k);
        return (
          <li key={k} className="flex items-center gap-2 text-[11px]">
            <span className={`w-12 shrink-0 ${isHit ? "font-semibold text-risk" : "text-warm"}`}>{RISK_LABEL[k]}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-200/80">
              <span className={`block h-full rounded-full ${isHit ? "bg-risk" : "bg-stone-400"}`} style={{ width: `${Math.round(v * 100)}%` }} />
            </span>
            <span className={`w-8 shrink-0 text-right tabular-nums ${isHit ? "font-semibold text-risk" : "text-warm"}`}>{v.toFixed(2)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** 五层流水线：被接住的那层高亮，前面的灰色（"没拦住 / 没命中 / 没把握"），后面的淡色（"没轮到"）。 */
function Pipeline({ trace }: { trace: RouteTrace }) {
  if (trace.layer === "action") {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-warm">
        <LayerBadge layer="action" />
        <span>不经过理解层</span>
      </div>
    );
  }
  const handled = PIPELINE.indexOf(trace.layer);
  const from = trace.escalatedFrom ? PIPELINE.indexOf(trace.escalatedFrom) : -1;
  return (
    <ol className="flex items-center gap-1" aria-label="路由流水线">
      {PIPELINE.map((layer, i) => {
        const meta = LAYER_META[layer];
        const isHandled = i === handled;
        const isPassed = i < handled;
        const isFrom = i === from;
        return (
          <li key={layer} className="flex flex-1 items-center gap-1">
            <span
              className={`flex h-6 flex-1 items-center justify-center rounded-md text-[10px] font-semibold ring-1 ${
                isHandled
                  ? meta.className
                  : isFrom
                    ? "bg-white text-stone-500 ring-stone-300 line-through decoration-stone-400"
                    : isPassed
                      ? "bg-stone-100 text-stone-400 ring-stone-200"
                      : "bg-transparent text-stone-300 ring-stone-200/70"
              }`}
            >
              {isHandled ? "✓ " : ""}
              {PIPELINE_SHORT[layer]}
            </span>
            {i < PIPELINE.length - 1 ? <span className="text-[9px] text-stone-300">›</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

function Row({ trace, text, open, onToggle }: { trace: RouteTrace; text?: string; open: boolean; onToggle: () => void }) {
  const meta = LAYER_META[trace.layer];
  const [marked, setMarked] = useState<"idle" | "busy" | "done" | "error">("idle");
  const canMisfire = trace.layer === "L1" && Boolean(trace.ruleId);
  const lat = trace.latency;

  const misfire = async () => {
    setMarked("busy");
    try {
      await markTraceMisfire(trace.id);
      setMarked("done");
    } catch {
      setMarked("error");
    }
  };

  return (
    <li className="relative">
      <span className={`absolute -left-[22px] top-3 h-[11px] w-[11px] rounded-full border-2 border-cream ${meta.dot}`} />
      <div className="overflow-hidden rounded-card bg-white shadow-card">
        <button type="button" onClick={onToggle} aria-expanded={open} className="block w-full px-3 py-2.5 text-left active:bg-brand-soft/40">
          <span className="flex items-center gap-2 text-[11px] text-warm">
            <span className="tabular-nums">{bubbleTime(trace.at)}</span>
            <span className="min-w-0 flex-1 truncate text-foreground">{text ? `「${text}」` : "（买家消息）"}</span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <LayerBadge layer={trace.layer} />
            {trace.escalatedFrom ? (
              <span className="text-[11px] text-warm">
                由 <b className="font-semibold">{PIPELINE_SHORT[trace.escalatedFrom]}</b> 升级
              </span>
            ) : null}
            <span className="text-[13px] font-medium text-foreground">{intentLabel(trace.intent)}</span>
            {trace.confidence !== undefined ? (
              <span className="text-[11px] tabular-nums text-warm">置信度 {trace.confidence.toFixed(2)}</span>
            ) : null}
            <span className="ml-auto text-[11px] tabular-nums text-warm">{lat.totalMs} ms</span>
          </span>
          <span className="mt-1 block text-xs leading-[18px] text-warm">{traceReason(trace)}</span>
        </button>

        {open ? (
          <div className="space-y-3 border-t border-line bg-cream/50 px-3 py-3">
            <div>
              <p className="mb-1.5 text-[11px] font-medium text-warm">这条消息经过的层级</p>
              <Pipeline trace={trace} />
            </div>

            {trace.riskScores ? (
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-warm">
                  风险分数
                  {trace.riskHit?.length ? <span className="ml-1.5 font-semibold text-risk">命中 {trace.riskHit.map((k) => RISK_LABEL[k]).join("、")}</span> : null}
                </p>
                <RiskBars trace={trace} />
              </div>
            ) : null}

            {trace.topIntents?.length ? (
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-warm">
                  意图候选{trace.decideProvider ? `（${trace.decideProvider}）` : ""}
                </p>
                <ul className="space-y-1">
                  {trace.topIntents.map((it, i) => (
                    <li key={it.id} className="flex items-center gap-2 text-[11px]">
                      <span className={`w-20 shrink-0 truncate ${i === 0 ? "font-semibold text-foreground" : "text-warm"}`}>{intentLabel(it.id)}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-200/80">
                        <span className={`block h-full rounded-full ${i === 0 ? "bg-brand" : "bg-stone-400"}`} style={{ width: `${Math.round(it.p * 100)}%` }} />
                      </span>
                      <span className="w-8 shrink-0 text-right tabular-nums text-warm">{it.p.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {trace.ruleId ? (
              <p className="text-[11px] text-warm">
                命中规则 <code className="rounded bg-white px-1 font-mono text-foreground ring-1 ring-line">{trace.ruleId}</code>
              </p>
            ) : null}

            <div>
              <p className="mb-1.5 text-[11px] font-medium text-warm">工具调用</p>
              {trace.toolCalls.length ? (
                <ul className="space-y-1">
                  {trace.toolCalls.map((tc, i) => (
                    <li key={`${tc.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-[11px] ring-1 ring-line">
                      <span className={`font-semibold ${tc.ok ? "text-success" : "text-risk"}`}>{tc.ok ? "✓" : "✕"}</span>
                      <span className="text-foreground">{TOOL_LABEL[tc.name] ?? tc.name}</span>
                      <code className="font-mono text-warm">{tc.name}</code>
                      <span className="ml-auto tabular-nums text-warm">{tc.ms} ms</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-warm">没有调用工具</p>
              )}
            </div>

            <dl className="grid grid-cols-3 gap-1.5 text-center">
              <Metric label="总耗时" value={`${lat.totalMs}ms`} />
              <Metric label="理解" value={lat.decideMs !== undefined ? `${lat.decideMs}ms` : "—"} />
              <Metric label={lat.agentMs !== undefined ? "Agent" : "执行"} value={`${lat.agentMs ?? lat.handlerMs ?? 0}ms`} />
            </dl>
            <p className="text-[11px] text-warm">
              费用 {formatCny(trace.cost.totalUsd)}
              {trace.cost.estimated ? "（估算）" : ""} · 理解 {formatCny(trace.cost.decideUsd)}
              {trace.cost.generationUsd ? ` · 生成 ${formatCny(trace.cost.generationUsd)}` : ""}
              {trace.cost.agentUsd ? ` · Agent ${formatCny(trace.cost.agentUsd)}` : ""}
              {trace.usedGeneration ? " · 用了大模型生成" : ""}
              {trace.ragHits ? ` · 检索到 ${trace.ragHits} 段资料` : ""}
            </p>

            {trace.handoffReason ? (
              <p className="rounded-lg bg-orange-50 px-2.5 py-2 text-xs leading-5 text-risk ring-1 ring-orange-200">转人工原因：{trace.handoffReason}</p>
            ) : null}

            {canMisfire ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={misfire}
                  disabled={marked === "busy" || marked === "done"}
                  className="inline-flex min-h-[36px] items-center rounded-full border border-orange-300 bg-white px-3 text-xs font-medium text-risk active:bg-orange-50 disabled:opacity-60"
                >
                  {marked === "done" ? "已标记误判" : "标记为误判"}
                </button>
                <span className="text-[11px] text-warm">
                  {marked === "error" ? "标记失败，请稍后再试" : `规则 ${trace.ruleId} 的误判次数会 +1`}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white px-1.5 py-1.5 ring-1 ring-line">
      <dd className="text-[13px] font-semibold tabular-nums text-foreground">{value}</dd>
      <dt className="text-[10px] text-warm">{label}</dt>
    </div>
  );
}

/** 路由轨迹：每条买家消息一行（层级徽标 + 意图 + 置信度 + 耗时），点击展开风险分数 / 意图候选 / 工具调用。 */
export function RouteTraceList({ traces, messages }: { traces: RouteTrace[]; messages: ChatMessage[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const textById = new Map(messages.map((m) => [m.id, m.text]));
  const sorted = [...traces].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  if (sorted.length === 0) {
    return <p className="rounded-card bg-white px-3 py-2.5 text-sm text-warm shadow-card">还没有路由记录</p>;
  }
  // 默认展开最近一条，演示时一眼就能看到"这条消息是哪一层接住的、为什么"
  const effectiveOpen = openId ?? sorted[sorted.length - 1].id;
  return (
    <ol className="relative space-y-2 pl-[22px] before:absolute before:bottom-3 before:left-[5px] before:top-3 before:w-px before:bg-line">
      {sorted.map((t) => (
        <Row
          key={t.id}
          trace={t}
          text={textById.get(t.messageId)}
          open={effectiveOpen === t.id}
          onToggle={() => setOpenId(effectiveOpen === t.id ? "" : t.id)}
        />
      ))}
    </ol>
  );
}
