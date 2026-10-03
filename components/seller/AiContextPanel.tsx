"use client";

import type { ChatMessage, Conversation, PendingAction, RouteTrace, Slots } from "@/lib/types";
import {
  ACTION_TYPE_META,
  formatSlotValue,
  intentLabel,
  PENDING_STATUS_LABEL,
  RISK_LABEL,
  SLOT_LABEL,
  TASK_STATUS_LABEL,
} from "./labels";
import { RouteTraceList } from "./RouteTraceList";
import { bubbleTime } from "./time";
import { RiskChip } from "./ui";

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <h3 className="mb-1.5 flex items-baseline gap-2 text-xs font-semibold text-foreground">
      {children}
      {hint ? <span className="text-[11px] font-normal text-warm">{hint}</span> : null}
    </h3>
  );
}

interface Props {
  conversation: Conversation;
  messages: ChatMessage[];
  traces: RouteTrace[];
  pendingActions: PendingAction[];
  open: boolean;
  onToggle: () => void;
}

export function AiContextPanel({ conversation: c, messages, traces, pendingActions, open, onToggle }: Props) {
  const { state } = c;
  const task = state.currentTask;
  const slotEntries = (Object.keys(state.slots) as (keyof Slots)[]).filter((k) => {
    const v = state.slots[k];
    return v !== undefined && v !== null && v !== "";
  });
  const hasHandoff = Boolean(c.handoffReason || c.handoffSummary);

  const collapsedSummary = [
    task ? `${intentLabel(task.intent)} · ${TASK_STATUS_LABEL[task.status]}` : "暂无进行中的任务",
    c.riskFlags.length ? c.riskFlags.map((r) => RISK_LABEL[r]).join("、") : null,
  ]
    .filter(Boolean)
    .join(" ｜ ");

  return (
    <section aria-label="AI 上下文" className="shrink-0 border-b border-line bg-white">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-[48px] w-full items-center gap-2.5 px-4 py-2 text-left active:bg-brand-soft/50"
      >
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-purple-100 text-[10px] font-bold text-purple-700">
          AI
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-foreground">AI 上下文</span>
          {!open ? <span className="block truncate text-xs text-warm">{collapsedSummary}</span> : null}
        </span>
        {!open && hasHandoff ? (
          <span className="shrink-0 rounded-md bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700">含转人工原因</span>
        ) : null}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          aria-hidden
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 text-warm transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div className="max-h-[50dvh] space-y-4 overflow-y-auto overscroll-contain border-t border-line bg-cream/60 px-4 pb-4 pt-3">
          {/* 1. 转人工原因：接管前最先要看的 */}
          {hasHandoff ? (
            <div className="rounded-card border border-orange-200 bg-orange-50/70 p-3">
              <SectionTitle>
                <span className="text-risk">为什么转到人工</span>
              </SectionTitle>
              {c.handoffReason ? <p className="text-[13px] font-medium leading-5 text-risk">{c.handoffReason}</p> : null}
              {c.handoffSummary ? (
                <div className="mt-2 border-t border-orange-200/70 pt-2">
                  <p className="mb-0.5 text-[11px] font-medium text-warm">AI 生成的摘要</p>
                  <p className="text-[13px] leading-5 text-foreground">{c.handoffSummary}</p>
                </div>
              ) : null}
              {c.riskFlags.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.riskFlags.map((r) => (
                    <RiskChip key={r} risk={r} />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* 2. 路由轨迹：每条买家消息是哪一层接住的、为什么 */}
          <div>
            <SectionTitle hint="点击一行看风险分数和工具调用">路由轨迹</SectionTitle>
            <RouteTraceList traces={traces} messages={messages} />
          </div>

          {/* 3. 当前任务 */}
          <div>
            <SectionTitle>当前任务</SectionTitle>
            {task ? (
              <div className="rounded-card bg-white p-3 shadow-card">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{intentLabel(task.intent)}</p>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                      task.status === "awaiting_confirm"
                        ? "bg-amber-50 text-amber-700"
                        : task.status === "done"
                          ? "bg-green-50 text-success"
                          : "bg-brand-soft text-brand"
                    }`}
                  >
                    {TASK_STATUS_LABEL[task.status]}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-warm">
                  <code className="font-mono">{task.intent}</code> · 开始于 {bubbleTime(task.startedAt)}
                </p>
                {pendingActions.map((p) => (
                  <div key={p.id} className="mt-2 rounded-lg bg-amber-50/70 p-2 text-xs leading-5 ring-1 ring-amber-200">
                    <p className="font-medium text-amber-800">{PENDING_STATUS_LABEL[p.status]}</p>
                    <p className="text-foreground">{p.summary}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-card bg-white px-3 py-2.5 text-sm text-warm shadow-card">暂无进行中的任务</p>
            )}
          </div>

          {/* 4. 槽位 */}
          <div>
            <SectionTitle hint="AI 已经从对话里记住的信息">已填槽位</SectionTitle>
            {slotEntries.length ? (
              <dl className="grid grid-cols-2 gap-2">
                {slotEntries.map((k) => (
                  <div key={k} className={`rounded-lg bg-white px-2.5 py-2 shadow-card ${k === "address" || k === "reason" ? "col-span-2" : ""}`}>
                    <dt className="text-[11px] text-warm">{SLOT_LABEL[k]}</dt>
                    <dd className="mt-0.5 break-words text-[13px] font-medium text-foreground">
                      {formatSlotValue(k, state.slots[k])}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="rounded-card bg-white px-3 py-2.5 text-sm text-warm shadow-card">暂无已记住的信息</p>
            )}
          </div>

          {/* 5. 最近动作 */}
          <div>
            <SectionTitle hint={`最近 ${state.history.length} 步，时间从早到晚`}>最近动作</SectionTitle>
            {state.history.length ? (
              <ol className="relative space-y-2.5 pl-4 before:absolute before:bottom-1 before:left-[5px] before:top-1 before:w-px before:bg-line">
                {state.history.map((h, i) => {
                  const meta = ACTION_TYPE_META[h.type];
                  const isLast = i === state.history.length - 1;
                  return (
                    <li key={`${h.at}-${i}`} className="relative">
                      <span
                        className={`absolute -left-4 top-1.5 h-[11px] w-[11px] rounded-full border-2 border-cream ${
                          isLast ? "bg-brand" : "bg-stone-300"
                        }`}
                      />
                      <div className="flex items-center gap-1.5">
                        <span className={`rounded px-1.5 py-px text-[11px] font-medium ${meta.className}`}>{meta.label}</span>
                        <code className="truncate font-mono text-[11px] text-warm">{h.name}</code>
                        <span className="ml-auto shrink-0 text-[11px] text-warm">{bubbleTime(h.at)}</span>
                      </div>
                      <p className="mt-0.5 text-[13px] leading-5 text-foreground">{h.summary}</p>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="rounded-card bg-white px-3 py-2.5 text-sm text-warm shadow-card">还没有动作记录</p>
            )}
          </div>

          {/* 6. 统计 */}
          <div className="grid grid-cols-3 gap-2">
            <Stat label="对话轮次" value={String(state.turnCount)} />
            <Stat label="未解决轮次" value={String(state.unresolvedTurns)} warn={state.unresolvedTurns >= 2} />
            <Stat label="上一个意图" value={state.lastIntent ? intentLabel(state.lastIntent) : "—"} small />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Stat({ label, value, warn, small }: { label: string; value: string; warn?: boolean; small?: boolean }) {
  return (
    <div className="rounded-lg bg-white px-2.5 py-2 text-center shadow-card">
      <p className={`font-semibold tabular-nums ${small ? "text-[13px] leading-6" : "text-lg leading-6"} ${warn ? "text-risk" : "text-foreground"}`}>
        {value}
      </p>
      <p className="text-[11px] text-warm">{label}</p>
    </div>
  );
}
