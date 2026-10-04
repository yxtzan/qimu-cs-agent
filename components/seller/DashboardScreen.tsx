"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { getRoutingAnalytics } from "@/lib/api-client";
import { relativeTime } from "@/components/shop/format";
import type { EvalReport, Layer, RiskKey, RoutingAnalytics, Stage } from "@/lib/types";
import { intentLabel, LAYER_META, RISK_LABEL, STAGE_LABEL } from "./labels";
import { friendlyError } from "@/components/shop/states";
import { ErrorCard, PageHeader } from "./ui";

type Range = "today" | "7d";
type FunnelLayer = Exclude<Layer, "action">;

/** 漏斗顺序（PRD §5.1）：风险闸门 → L1 → L2 → L3 → 人工。 */
const FUNNEL: FunnelLayer[] = ["risk_gate", "L1", "L2", "L3", "human"];
/** 柱状图堆叠顺序（自下而上）：量大的 L1 / L2 打底，L3 和人工在上面一眼能看出"很少"。 */
const STACK: FunnelLayer[] = ["L1", "L2", "L3", "human", "risk_gate"];
const SHORT: Record<FunnelLayer, string> = { risk_gate: "风险", L1: "L1", L2: "L2", L3: "L3", human: "人工" };

const STAGE_BG: Record<Stage, string> = {
  presale: "bg-sky-400",
  insale: "bg-amber-400",
  aftersale: "bg-pink-400",
  other: "bg-stone-300",
};
const STAGES: Stage[] = ["presale", "insale", "aftersale", "other"];

const RANGE_LABEL: Record<Range, string> = { today: "今天", "7d": "近 7 天" };
const POLL_MS = 8000;

// ───────────────────────── 格式化 ─────────────────────────

const pct = (n: number) => `${Math.round(n * 100)}%`;
const cny = (n: number) => `¥${n.toFixed(2)}`;
function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}
/** 对比句里的等待时间：满 1 秒一位小数，不到 1 秒两位，和看板上的毫秒数对得上。 */
function fmtWait(ms: number): string {
  const sec = ms / 1000;
  if (sec >= 10) return `${Math.round(sec)} 秒`;
  if (sec >= 1) return `${sec.toFixed(1)} 秒`;
  return `${sec.toFixed(2)} 秒`;
}
/** 倍数保留一位小数；正好是整数时不带 .0，避免把 3.4 四舍五入成 3 再被追问。 */
function formatTimes(ratio: number): string {
  const tenths = Math.round(ratio * 10) / 10;
  return Number.isInteger(tenths) ? String(tenths) : tenths.toFixed(1);
}
const PROVIDER_LABEL: Record<EvalReport["provider"], string> = { jev: "Jev 分类器", llm: "LLM 分类器", mock: "关键词 mock" };

function bucketHour(bucket: string): string | null {
  const m = bucket.match(/(?:T|\s)(\d{2}):/);
  return m ? String(Number(m[1])) : null;
}
function bucketLabel(bucket: string, range: Range): string {
  if (range === "today") return bucketHour(bucket) ?? bucket;
  const m = bucket.match(/(\d{2})-(\d{2})(?:$|T|\s)/);
  return m ? `${m[1]}/${m[2]}` : bucket;
}
function bucketTitle(bucket: string, range: Range): string {
  if (range === "today") {
    const h = bucketHour(bucket);
    return h === null ? bucket : `${h.padStart(2, "0")}:00 – ${String((Number(h) + 1) % 24).padStart(2, "0")}:00`;
  }
  return bucketLabel(bucket, range).replace("/", " 月 ") + " 日";
}

// ───────────────────────── 通用小件 ─────────────────────────

function Card({ title, subtitle, children, right }: { title: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-card bg-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-6 text-foreground">{title}</h2>
          {subtitle ? <p className="text-xs leading-5 text-warm">{subtitle}</p> : null}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function RangeToggle({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div role="group" aria-label="时间范围" className="flex rounded-full bg-stone-200/70 p-0.5">
      {(["today", "7d"] as const).map((r) => (
        <button
          key={r}
          type="button"
          aria-pressed={value === r}
          onClick={() => onChange(r)}
          className={`min-h-9 rounded-full px-3.5 text-[13px] font-semibold transition-colors ${
            value === r ? "bg-white text-brand shadow-sm" : "text-warm active:text-brand"
          }`}
        >
          {RANGE_LABEL[r]}
        </button>
      ))}
    </div>
  );
}

function StackedBar({ parts }: { parts: { key: string; value: number; className: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div className="flex h-4 w-full gap-px overflow-hidden rounded-full bg-stone-100" aria-hidden>
      {total > 0
        ? parts
            .filter((p) => p.value > 0)
            .map((p) => <div key={p.key} className={p.className} style={{ width: `${(p.value / total) * 100}%`, minWidth: 4 }} />)
        : null}
    </div>
  );
}

// ───────────────────────── 1. 主结论：大部分在 L1/L2 解决；L3 更慢，单条也更贵 ─────────────────────────

function Hero({ d }: { d: RoutingAnalytics }) {
  const layers = new Map(d.byLayer.map((l) => [l.layer, l]));
  const get = (l: FunnelLayer) => layers.get(l) ?? { layer: l, count: 0, share: 0, avgLatencyMs: 0, costPer1kCny: 0 };
  const l1 = get("L1");
  const l2 = get("L2");
  const l3 = get("L3");
  const cheapShare = l1.share + l2.share;
  // 主结论是"L1+L2"的占比，指标卡"自动解决率"还包含大模型自动解决的部分：这里补上中间那一段，两个数字就能对上
  const bridge = Math.max(0, d.totals.autoResolvedRate - cheapShare);
  // 倍数用看板上已经四舍五入的每千条成本和平均延迟来除，观众拿卡片上的数字验算能对上。不足 1.5 倍的那半句不说。
  const costRatio = l2.costPer1kCny > 0 ? l3.costPer1kCny / l2.costPer1kCny : 0;
  const latencyRatio = l2.avgLatencyMs > 0 ? l3.avgLatencyMs / l2.avgLatencyMs : 0;
  const comparisons = [
    costRatio >= 1.5 ? `单条成本是 L2 的 ${formatTimes(costRatio)} 倍` : null,
    latencyRatio >= 1.5 ? `平均要等 ${fmtWait(l3.avgLatencyMs)}（L2 ${fmtWait(l2.avgLatencyMs)}）` : null,
  ].filter((part): part is string => part !== null);

  return (
    <section className="rounded-card bg-white p-4 shadow-card">
      <p className="text-xs text-warm">
        {RANGE_LABEL[d.range]}共处理 <b className="font-semibold text-foreground">{d.totals.messages}</b> 条消息，其中
      </p>
      <div className="mt-1 flex items-end gap-3">
        <span className="font-bold leading-none tracking-tight text-brand tabular-nums">
          <span className="text-[64px]">{Math.round(cheapShare * 100)}</span>
          <span className="text-[32px]">%</span>
        </span>
        <p className="pb-1.5 text-sm font-medium leading-5 text-foreground">
          在 L1 / L2 就解决了
          <br />
          <span className="text-xs font-normal text-warm">不调用大模型，又快又省</span>
        </p>
      </div>
      {bridge > 0.005 ? (
        <p className="mt-2 text-xs leading-5 text-warm">
          （其余 <b className="font-semibold text-purple-700">{pct(bridge)}</b> 由大模型 L3 自动解决，合计自动解决率{" "}
          <b className="font-semibold text-success">{pct(d.totals.autoResolvedRate)}</b>，剩下的转人工）
        </p>
      ) : null}

      <div className="mt-4">
        <StackedBar parts={FUNNEL.map((k) => ({ key: k, value: get(k).count, className: LAYER_META[k].dot }))} />
        <ul className="mt-2 grid grid-cols-5 gap-1 text-center">
          {FUNNEL.map((k) => (
            <li key={k}>
              <div className="flex items-center justify-center gap-1 text-[11px] text-warm">
                <span className={`h-2 w-2 rounded-full ${LAYER_META[k].dot}`} />
                {SHORT[k]}
              </div>
              <div className="text-sm font-semibold tabular-nums text-foreground">{pct(get(k).share)}</div>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-brand-soft p-3">
          <p className="text-xs font-medium text-brand">L2 上下文层</p>
          <p className="mt-0.5 text-[22px] font-bold leading-7 tabular-nums text-brand">{cny(l2.costPer1kCny)}</p>
          <p className="text-[11px] text-brand/80">每千条 · 平均 {fmtMs(l2.avgLatencyMs)}</p>
        </div>
        <div className="rounded-xl bg-purple-50 p-3">
          <p className="text-xs font-medium text-purple-700">L3 大模型</p>
          <p className="mt-0.5 text-[22px] font-bold leading-7 tabular-nums text-purple-700">{cny(l3.costPer1kCny)}</p>
          <p className="text-[11px] text-purple-700/80">每千条 · 平均 {fmtMs(l3.avgLatencyMs)}</p>
        </div>
      </div>

      {l3.count > 0 ? (
        <p data-testid="layer-compare" className="mt-3 rounded-xl bg-cream px-3 py-2.5 text-[13px] leading-5 text-foreground">
          L3 只处理了 <b className="text-purple-700">{pct(l3.share)}</b> 的消息
          {comparisons.length > 0 ? (
            <>
              ，
              {comparisons.map((part, i) => (
                <span key={part}>
                  {i > 0 ? "，" : null}
                  {part.includes("成本") ? <b className="text-purple-700">{part}</b> : part}
                </span>
              ))}
            </>
          ) : null}
          。所以要尽量把消息挡在前面几层，又快又省。
        </p>
      ) : null}
    </section>
  );
}

// ───────────────────────── 2. 四个指标 ─────────────────────────

function Metrics({ d }: { d: RoutingAnalytics }) {
  const get = (l: FunnelLayer) => d.byLayer.find((x) => x.layer === l);
  const riskN = get("risk_gate")?.count ?? 0;
  const humanN = get("human")?.count ?? 0;
  const cards = [
    { label: "总消息数", value: String(d.totals.messages), unit: "条", sub: `${RANGE_LABEL[d.range]}所有买家消息`, tone: "text-foreground" },
    { label: "自动解决率", value: String(Math.round(d.totals.autoResolvedRate * 100)), unit: "%", sub: "L1/L2 + 大模型，无需人工", tone: "text-success" },
    { label: "转人工率", value: String(Math.round(d.totals.handoffRate * 100)), unit: "%", sub: `风险闸门 ${riskN} + 人工 ${humanN} 条`, tone: "text-red-700" },
    {
      label: "平均响应时间",
      value: d.totals.avgLatencyMs < 1000 ? String(Math.round(d.totals.avgLatencyMs)) : (d.totals.avgLatencyMs / 1000).toFixed(1),
      unit: d.totals.avgLatencyMs < 1000 ? "ms" : "s",
      sub: `L2 ${fmtMs(get("L2")?.avgLatencyMs ?? 0)} · L3 ${fmtMs(get("L3")?.avgLatencyMs ?? 0)}`,
      tone: "text-foreground",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((c) => (
        <div key={c.label} data-testid="metric-card" data-label={c.label} className="min-w-0 rounded-card bg-white p-3.5 shadow-card">
          <p className="text-xs font-medium text-warm">{c.label}</p>
          <p className={`mt-1 truncate font-bold leading-none tabular-nums ${c.tone}`}>
            <span data-testid="metric-value" className="text-[34px]">{c.value}</span>
            <span className="ml-0.5 text-base">{c.unit}</span>
          </p>
          <p className="mt-1.5 truncate text-[11px] text-warm">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────── 3. 漏斗 ─────────────────────────

function Funnel({ d }: { d: RoutingAnalytics }) {
  const rows = FUNNEL.map((k) => d.byLayer.find((l) => l.layer === k) ?? { layer: k, count: 0, share: 0, avgLatencyMs: 0, costPer1kCny: 0 });
  const maxShare = Math.max(...rows.map((r) => r.share), 0.0001);
  const maxCost = Math.max(...rows.map((r) => r.costPer1kCny), 0);
  const maxLatency = Math.max(...rows.map((r) => r.avgLatencyMs), 0);

  return (
    <Card title="路由漏斗" subtitle="风险闸门 → L1 规则 → L2 上下文 → L3 大模型 → 人工">
      <ol className="mt-3 space-y-4">
        {rows.map((r) => {
          const meta = LAYER_META[r.layer as FunnelLayer];
          const width = r.count > 0 ? Math.max(3, (r.share / maxShare) * 100) : 0;
          const priciest = maxCost > 0 && r.costPer1kCny === maxCost;
          const slowest = maxLatency > 0 && r.avgLatencyMs === maxLatency;
          return (
            <li key={r.layer}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
                  <span className="truncate text-sm font-semibold text-foreground">{meta.label}</span>
                </span>
                <span className="flex shrink-0 items-baseline gap-1.5">
                  <span className="text-[28px] font-bold leading-none tabular-nums text-foreground">{r.count}</span>
                  <span className="w-10 text-right text-sm font-semibold tabular-nums text-warm">{pct(r.share)}</span>
                </span>
              </div>
              <div className="mt-1.5 h-5 overflow-hidden rounded-md bg-stone-100" aria-hidden>
                <div className={`h-full rounded-md ${meta.dot}`} style={{ width: `${width}%` }} />
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-cream px-2.5 py-1.5">
                  <p className="text-[11px] text-warm">
                    平均延迟{slowest && r.avgLatencyMs >= 1000 ? <b className="ml-1 text-purple-700">最慢</b> : null}
                  </p>
                  <p className="text-[15px] font-semibold tabular-nums text-foreground">{r.count ? fmtMs(r.avgLatencyMs) : "—"}</p>
                </div>
                <div className={`rounded-lg px-2.5 py-1.5 ${priciest && r.costPer1kCny >= 1 ? "bg-purple-50" : "bg-cream"}`}>
                  <p className="text-[11px] text-warm">
                    每千条成本{priciest && r.costPer1kCny >= 1 ? <b className="ml-1 text-purple-700">最贵</b> : null}
                  </p>
                  <p className={`text-[15px] font-semibold tabular-nums ${priciest && r.costPer1kCny >= 1 ? "text-purple-700" : "text-foreground"}`}>
                    {r.count ? cny(r.costPer1kCny) : "—"}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

// ───────────────────────── 4. 时间分布 ─────────────────────────

function Timeline({ d }: { d: RoutingAnalytics }) {
  const [sel, setSel] = useState<{ range: Range; idx: number } | null>(null);
  const series = d.timeseries;
  const totals = series.map((b) => b.L1 + b.L2 + b.L3 + b.risk_gate + b.human);
  const max = Math.max(...totals, 1);
  const lastIdx = Math.max(series.length - 1, 0);
  const peakIdx = totals.indexOf(Math.max(...totals)); // 没有点选时默认展示最忙的那一格
  const idx = sel && sel.range === d.range && sel.idx < series.length ? sel.idx : Math.max(peakIdx, 0);
  const picked = series[idx];
  const step = series.length > 14 ? 3 : series.length > 8 ? 2 : 1;

  return (
    <Card
      title="时间分布"
      subtitle={d.range === "today" ? "今天每小时的消息量，按层着色" : "近 7 天每天的消息量，按层着色"}
      right={<span className="shrink-0 text-xs tabular-nums text-warm">峰值 {Math.max(0, ...totals)} 条</span>}
    >
      {series.length === 0 ? (
        <p className="py-8 text-center text-sm text-warm">暂无时间序列数据</p>
      ) : (
        <>
          <div className="relative mt-3 h-36">
            <div className="absolute inset-0 flex flex-col justify-between" aria-hidden>
              {[0, 1, 2].map((i) => (
                <div key={i} className="border-t border-dashed border-line" />
              ))}
            </div>
            <div className="relative flex h-full items-end gap-1">
              {series.map((b, i) => {
                const total = totals[i];
                return (
                  <button
                    key={b.bucket}
                    type="button"
                    onClick={() => setSel({ range: d.range, idx: i })}
                    aria-label={`${bucketTitle(b.bucket, d.range)}：${total} 条`}
                    aria-pressed={i === idx}
                    className={`flex h-full min-w-0 flex-1 flex-col justify-end rounded-t-md ${i === idx ? "bg-brand/10" : ""}`}
                  >
                    {total > 0 ? (
                      <div className="flex w-full flex-col-reverse overflow-hidden rounded-t-[4px]" style={{ height: `${(total / max) * 100}%` }}>
                        {STACK.map((k) =>
                          b[k] > 0 ? <div key={k} className={LAYER_META[k].dot} style={{ height: `${(b[k] / total) * 100}%` }} /> : null,
                        )}
                      </div>
                    ) : (
                      <div className="h-0.5 w-full rounded-full bg-stone-200" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-1 flex gap-1" aria-hidden>
            {series.map((b, i) => (
              <span key={b.bucket} className="min-w-0 flex-1 text-center text-[10px] tabular-nums text-warm">
                {i % step === 0 || i === lastIdx ? bucketLabel(b.bucket, d.range) : ""}
              </span>
            ))}
          </div>
          <p className="mt-0.5 text-center text-[10px] text-warm">{d.range === "today" ? "小时（点按柱子看明细）" : "日期（点按柱子看明细）"}</p>

          {picked ? (
            <div className="mt-2.5 rounded-xl bg-cream px-3 py-2.5">
              <p className="text-xs text-warm">
                {bucketTitle(picked.bucket, d.range)} · 共 <b className="text-sm font-semibold text-foreground">{totals[idx]}</b> 条
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                {STACK.map((k) => (
                  <li key={k} className="flex items-center gap-1 text-xs text-foreground">
                    <span className={`h-2 w-2 rounded-full ${LAYER_META[k].dot}`} />
                    {SHORT[k]} <b className="tabular-nums">{picked[k]}</b>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

// ───────────────────────── 5. 阶段 / 意图 / 风险 ─────────────────────────

function StageCard({ d }: { d: RoutingAnalytics }) {
  const map = new Map(d.byStage.map((s) => [s.stage, s.count]));
  const total = STAGES.reduce((s, k) => s + (map.get(k) ?? 0), 0);
  return (
    <Card title="阶段分布" subtitle="买家问的是售前、售中、售后，还是别的">
      <div className="mt-3">
        <StackedBar parts={STAGES.map((k) => ({ key: k, value: map.get(k) ?? 0, className: STAGE_BG[k] }))} />
      </div>
      <ul className="mt-3 grid grid-cols-4 gap-1.5">
        {STAGES.map((k) => {
          const n = map.get(k) ?? 0;
          return (
            <li key={k} className="rounded-lg bg-cream px-1 py-2 text-center">
              <div className="flex items-center justify-center gap-1 text-[11px] text-warm">
                <span className={`h-2 w-2 rounded-full ${STAGE_BG[k]}`} />
                {STAGE_LABEL[k]}
              </div>
              <div className="text-xl font-bold leading-6 tabular-nums text-foreground">{n}</div>
              <div className="text-[11px] tabular-nums text-warm">{total ? pct(n / total) : "0%"}</div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function IntentCard({ d }: { d: RoutingAnalytics }) {
  const top = [...d.byIntent].sort((a, b) => b.count - a.count).slice(0, 8);
  const max = Math.max(...top.map((t) => t.count), 1);
  return (
    <Card title="意图 Top 8" subtitle="买家最常问什么（颜色 = 所属阶段）">
      {top.length === 0 ? (
        <p className="py-6 text-center text-sm text-warm">暂无数据</p>
      ) : (
        <ol className="mt-3 space-y-2.5">
          {top.map((t, i) => (
            <li key={t.intent} className="flex items-center gap-2.5">
              <span className="w-4 shrink-0 text-center text-xs font-semibold tabular-nums text-warm">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{intentLabel(t.intent)}</span>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">{t.count}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-100" aria-hidden>
                  <div className={`h-full rounded-full ${STAGE_BG[t.stage]}`} style={{ width: `${Math.max(3, (t.count / max) * 100)}%` }} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-2.5">
        {STAGES.map((k) => (
          <li key={k} className="flex items-center gap-1 text-[11px] text-warm">
            <span className={`h-2 w-2 rounded-full ${STAGE_BG[k]}`} />
            {STAGE_LABEL[k]}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RiskCard({ hits }: { hits: { key: RiskKey; count: number }[] }) {
  if (hits.length === 0) return null;
  return (
    <Card title="风险闸门拦截" subtitle="这些消息没经过 AI 自由发挥，直接转人工">
      <ul className="mt-3 flex flex-wrap gap-2">
        {[...hits]
          .sort((a, b) => b.count - a.count)
          .map((h) => (
            <li key={h.key} className="flex items-center gap-1.5 rounded-lg bg-orange-50 px-2.5 py-1.5 ring-1 ring-orange-200">
              <span className="text-[13px] font-medium text-orange-700">{RISK_LABEL[h.key] ?? h.key}</span>
              <span className="text-base font-bold tabular-nums text-risk">{h.count}</span>
            </li>
          ))}
      </ul>
    </Card>
  );
}

// ───────────────────────── 6. 低置信度样本 ─────────────────────────

function LowConfidenceCard({ items }: { items: RoutingAnalytics["lowConfidence"] }) {
  return (
    <Card title="低置信度样本" subtitle="模型拿不准的消息，需要人看一眼（点开查看会话）" right={<span className="shrink-0 text-xs tabular-nums text-warm">{items.length} 条</span>}>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-warm">这个时间段没有低置信度的消息 👍</p>
      ) : (
        <ul className="mt-1 divide-y divide-line">
          {items.map((it) => (
            <li key={it.traceId}>
              <Link
                href={`/seller/c/${encodeURIComponent(it.conversationId)}`}
                className="-mx-2 flex min-h-14 items-center gap-3 rounded-lg px-2 py-2.5 active:bg-cream"
              >
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm leading-5 text-foreground">{it.text ? `“${it.text}”` : "（原文不可用）"}</p>
                  <p className="mt-1 truncate text-xs text-warm">
                    判断为 {intentLabel(it.intent)} · {relativeTime(it.at)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xl font-bold leading-6 tabular-nums text-risk">
                    {it.confidence !== undefined ? it.confidence.toFixed(2) : "—"}
                  </p>
                  <p className="text-[10px] text-warm">置信度</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden className="shrink-0 text-stone-300" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ───────────────────────── 7. 评测成绩 ─────────────────────────

function scoreTone(v: number, good: number, ok: number): string {
  if (v >= good) return "text-success";
  if (v >= ok) return "text-amber-600";
  return "text-risk";
}
function errTone(v: number): string {
  if (v <= 0.05) return "text-success";
  if (v <= 0.1) return "text-amber-600";
  return "text-risk";
}

function EvalCard({ ev }: { ev: EvalReport | undefined }) {
  if (!ev) {
    return (
      <Card title="评测成绩" subtitle="最近一次 npm run eval">
        <div className="mt-3 rounded-xl bg-cream px-3 py-6 text-center">
          <p className="text-sm font-medium text-foreground">还没有评测记录</p>
          <p className="mt-1 text-xs leading-5 text-warm">
            在电脑终端运行 <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-foreground">npm run eval</code> 后刷新
          </p>
        </div>
      </Card>
    );
  }
  const tiles = [
    { label: "意图准确率", value: ev.intentAccuracy, tone: scoreTone(ev.intentAccuracy, 0.85, 0.7), hint: "分对意图的比例" },
    { label: "路由准确率", value: ev.layerAccuracy, tone: scoreTone(ev.layerAccuracy, 0.85, 0.7), hint: "走对层级的比例" },
    { label: "风险召回率", value: ev.riskRecall, tone: scoreTone(ev.riskRecall, 0.95, 0.85), hint: "该拦的都拦住了" },
    { label: "风险误报率", value: ev.riskFalsePositiveRate, tone: errTone(ev.riskFalsePositiveRate), hint: "越低越好" },
  ];
  return (
    <Card title="评测成绩" subtitle={`${ev.runAt.slice(0, 10)} ${ev.runAt.slice(11, 16)} · ${ev.cases} 条用例 · ${PROVIDER_LABEL[ev.provider] ?? ev.provider}`}>
      <ul className="mt-3 grid grid-cols-2 gap-2">
        {tiles.map((t) => (
          <li key={t.label} className="min-w-0 rounded-xl bg-cream px-3 py-2.5">
            <p className="text-xs font-medium text-warm">{t.label}</p>
            <p className={`mt-0.5 font-bold leading-none tabular-nums ${t.tone}`}>
              <span className="text-[30px]">{(t.value * 100).toFixed(1)}</span>
              <span className="text-sm">%</span>
            </p>
            <p className="mt-1 text-[11px] text-warm">{t.hint}</p>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-xs text-warm">
        平均耗时 {fmtMs(ev.avgLatencyMs)} · 未通过 {ev.failures.length} 条
      </p>
    </Card>
  );
}

// ───────────────────────── 状态：加载 / 空 / 出错 ─────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-busy aria-label="加载中">
      <div className="h-72 rounded-card bg-white/70" />
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-card bg-white/70" />
        ))}
      </div>
      <div className="h-96 rounded-card bg-white/70" />
    </div>
  );
}

function EmptyState({ range }: { range: Range }) {
  return (
    <section className="rounded-card bg-white px-5 py-10 text-center shadow-card">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand">
        <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </svg>
      </span>
      <p className="mt-3 text-base font-semibold text-foreground">{RANGE_LABEL[range]}还没有消息</p>
      <p className="mt-1 text-sm leading-6 text-warm">
        到买家端和客服聊几句，
        <br />
        回到这里刷新就能看到消息怎么被路由。
      </p>
      <a href="/" target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-sm font-semibold text-white active:bg-brand-dark">
        打开买家端
      </a>
    </section>
  );
}

// ───────────────────────── 页面 ─────────────────────────

export function DashboardScreen() {
  const [range, setRange] = useState<Range>("today");
  const [data, setData] = useState<RoutingAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const reqId = useRef(0);
  const load = useCallback((r: Range): Promise<void> => {
    const id = ++reqId.current;
    return getRoutingAnalytics(r, true)
      .then((next) => {
        if (id !== reqId.current) return; // 已有更新的请求，丢弃这次结果
        setData(next);
        setError(null);
      })
      .catch((e: unknown) => {
        if (id !== reqId.current) return;
        setError(friendlyError(e, "看板数据暂时没加载出来"));
      });
  }, []);

  const refreshNow = useCallback(() => {
    setRefreshing(true);
    void load(range).finally(() => setRefreshing(false));
  }, [load, range]);

  // 切换范围 / 首次进入时加载；之后每 8 秒静默刷新，回到页面时也刷新
  useEffect(() => {
    void load(range);
    const timer = window.setInterval(() => void load(range), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load(range);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [range, load]);

  const switching = data !== null && data.range !== range;
  const firstLoad = data === null && error === null;

  return (
    <>
      <PageHeader
        title="看板"
        subtitle="消息怎么被路由，花了多少钱"
        right={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refreshNow}
              aria-label="刷新数据"
              className="flex h-10 w-10 items-center justify-center rounded-full text-warm active:bg-stone-200"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden className={refreshing ? "animate-spin" : ""} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
              </svg>
            </button>
            <RangeToggle value={range} onChange={setRange} />
          </div>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-3">
        {error && !data ? (
          <ErrorCard title="看板暂时没加载出来" message={error} onRetry={refreshNow} />
        ) : null}

        {error && data ? (
          <div role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-card bg-orange-50 px-3.5 py-3 text-sm text-orange-800 ring-1 ring-orange-200">
            <span className="min-w-0">{error}</span>
            <button type="button" onClick={refreshNow} className="min-h-9 shrink-0 rounded-full bg-white px-3.5 text-[13px] font-semibold text-risk ring-1 ring-orange-200">
              重试
            </button>
          </div>
        ) : null}

        {firstLoad ? <Skeleton /> : null}

        {data ? (
          <div className={`space-y-3 transition-opacity ${switching ? "opacity-50" : ""}`}>
            {data.totals.messages === 0 ? (
              <EmptyState range={data.range} />
            ) : (
              <>
                <Hero d={data} />
                <Metrics d={data} />
                <Funnel d={data} />
                <Timeline key={data.range} d={data} />
                <StageCard d={data} />
                <IntentCard d={data} />
                <RiskCard hits={data.riskHits} />
                <LowConfidenceCard items={data.lowConfidence} />
              </>
            )}
            <EvalCard ev={data.latestEval} />
            <p className="pt-1 text-center text-[11px] leading-5 text-warm">
              {data.includesSimulated ? "含模拟历史数据" : "仅含真实对话数据"}
            </p>
          </div>
        ) : null}
      </div>
    </>
  );
}
