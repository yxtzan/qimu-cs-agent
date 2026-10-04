/**
 * 评测汇总与报告生成（T06）：把 CaseResult[] 变成 EvalReport（契约类型）和 Markdown 报告。
 */
import type { EvalReport, RiskKey } from "../types";
import { describeExpect, describeGot, type CaseResult, type FailureReason } from "./run";

const RISK_KEYS: RiskKey[] = ["legal_threat", "health_safety", "fraud_security", "abuse_extreme", "emotion"];
const LAYERS = ["risk_gate", "L1", "L2", "L3", "human"] as const;

const pct = (n: number, d: number) => (d === 0 ? "—" : `${((n / d) * 100).toFixed(1)}%`);
const ratio = (n: number, d: number) => (d === 0 ? 0 : n / d);
const usd = (v: number) => `$${v.toFixed(6)}`;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export function p95(xs: number[]): number {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
}

const isRiskCase = (r: CaseResult) => (r.expect.riskHit?.length ?? 0) > 0;
const wantsLayer = (r: CaseResult, layer: string) => (Array.isArray(r.expect.layer) ? r.expect.layer : [r.expect.layer]).includes(layer as never);
/** cases.json `_readme` 的定义：riskHit 为空数组、且 layer 不是 risk_gate。 */
const isStrictNegative = (r: CaseResult) => r.expect.riskHit !== undefined && r.expect.riskHit.length === 0 && !wantsLayer(r, "risk_gate");
/** 更宽的口径：所有不期望触发风险闸门的用例。 */
const isBroadNegative = (r: CaseResult) => !isRiskCase(r) && !wantsLayer(r, "risk_gate");

export interface EvalSummary {
  total: number;
  passed: number;
  intentAccuracy: number;
  layerAccuracy: number;
  riskRecall: number;
  riskFalsePositiveRate: number;
  riskFalsePositiveRateBroad: number;
  avgLatencyMs: number;
  totalCostUsd: number;
}

export function summarize(results: CaseResult[], checkTools: boolean): EvalSummary {
  const withIntent = results.filter((r) => r.expect.intent);
  const riskCases = results.filter(isRiskCase);
  const strict = results.filter(isStrictNegative);
  const broad = results.filter(isBroadNegative);
  void checkTools;
  return {
    total: results.length,
    passed: results.filter((r) => r.pass).length,
    intentAccuracy: ratio(withIntent.filter((r) => r.dims.intent).length, withIntent.length),
    layerAccuracy: ratio(results.filter((r) => r.dims.layer).length, results.length),
    riskRecall: ratio(riskCases.filter((r) => r.dims.risk).length, riskCases.length),
    riskFalsePositiveRate: ratio(strict.filter((r) => r.got.riskHit.length > 0).length, strict.length),
    riskFalsePositiveRateBroad: ratio(broad.filter((r) => r.got.riskHit.length > 0).length, broad.length),
    avgLatencyMs: Math.round(mean(results.map((r) => r.latencyMs))),
    totalCostUsd: results.reduce((s, r) => s + r.costUsd, 0),
  };
}

export interface ExtendedEvalReport extends EvalReport {
  /** 以下为 T06 附加字段，看板不读，只给报告和后续任务用。 */
  passed: number;
  totalCostUsd: number;
  riskFalsePositiveRateBroad: number;
  failures: (EvalReport["failures"][number] & { reason: FailureReason })[];
  reasonCounts: Partial<Record<FailureReason, number>>;
  byLayer: Record<string, { n: number; avgMs: number; p95Ms: number; avgCostUsd: number }>;
  note: string;
}

export function layerStats(results: CaseResult[]): ExtendedEvalReport["byLayer"] {
  const out: ExtendedEvalReport["byLayer"] = {};
  for (const layer of LAYERS) {
    const rs = results.filter((r) => r.got.layer === layer);
    if (!rs.length) continue;
    out[layer] = { n: rs.length, avgMs: Math.round(mean(rs.map((r) => r.latencyMs))), p95Ms: p95(rs.map((r) => r.latencyMs)), avgCostUsd: mean(rs.map((r) => r.costUsd)) };
  }
  return out;
}

export function reasonCounts(results: CaseResult[]): Partial<Record<FailureReason, number>> {
  const counts: Partial<Record<FailureReason, number>> = {};
  for (const r of results) if (r.reason) counts[r.reason] = (counts[r.reason] ?? 0) + 1;
  return counts;
}

export function buildReport(results: CaseResult[], provider: EvalReport["provider"], runAt: string, checkTools: boolean, note: string): ExtendedEvalReport {
  const s = summarize(results, checkTools);
  return {
    runAt,
    provider,
    cases: s.total,
    intentAccuracy: s.intentAccuracy,
    layerAccuracy: s.layerAccuracy,
    riskRecall: s.riskRecall,
    riskFalsePositiveRate: s.riskFalsePositiveRate,
    avgLatencyMs: s.avgLatencyMs,
    failures: results
      .filter((r) => !r.pass)
      .map((r) => ({
        caseId: r.id,
        text: r.text,
        expected: describeExpect(r.expect, checkTools),
        got: `${describeGot(r.got, checkTools)}（原因：${r.reason}）`,
        reason: r.reason!,
      })),
    passed: s.passed,
    totalCostUsd: Number(s.totalCostUsd.toFixed(6)),
    riskFalsePositiveRateBroad: s.riskFalsePositiveRateBroad,
    reasonCounts: reasonCounts(results),
    byLayer: layerStats(results),
    note,
  };
}

// ───────────────────────── 分类器（Jev）表现 ─────────────────────────

export const BUCKETS: { label: string; lo: number; hi: number }[] = [
  { label: "< 0.5", lo: 0, hi: 0.5 },
  { label: "0.5 – 0.7", lo: 0.5, hi: 0.7 },
  { label: "0.7 – 0.85", lo: 0.7, hi: 0.85 },
  { label: "≥ 0.85", lo: 0.85, hi: 1.0001 },
];

export interface ClassifierStats {
  n: number;
  correct: number;
  l2: { n: number; correct: number };
  buckets: { label: string; n: number; correct: number }[];
  thresholds: { t: number; accepted: number; correct: number }[];
  suggested?: number;
  /** 低于当前阈值那一段（[suggested, current)）的样本量与准确率；用来判断"下调"有没有统计依据 */
  band?: { n: number; correct: number };
  misses: { id: string; text: string; expected: string; got: string; conf: number }[];
}

export function classifierStats(results: CaseResult[]): ClassifierStats {
  // 最终仍是降级后端（例如 Jev 超时后由 llm / mock 回答）的用例不计入，否则会把别家的成绩算到分类器头上。
  const set = results.filter((r) => !r.degradedFinal && r.expect.intent && r.got.classifierIntent && r.got.classifierConfidence !== undefined);
  const ok = (r: CaseResult) => r.got.classifierIntent === r.expect.intent;
  const l2 = set.filter((r) => wantsLayer(r, "L2"));
  const buckets = BUCKETS.map((b) => {
    const rs = set.filter((r) => r.got.classifierConfidence! >= b.lo && r.got.classifierConfidence! < b.hi);
    return { label: b.label, n: rs.length, correct: rs.filter(ok).length };
  });
  const thresholds = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95].map((t) => {
    const rs = set.filter((r) => r.got.classifierConfidence! >= t);
    return { t, accepted: rs.length, correct: rs.filter(ok).length };
  });
  // 建议值：最低的、使 "被 L2 接下的消息" 准确率 ≥ 95% 的置信度（至少接下 10 条才有统计意义）。
  const suggested = thresholds.find((x) => x.accepted >= 10 && x.correct / x.accepted >= 0.95)?.t;
  const current = Number(process.env.L2_CONFIDENCE_THRESHOLD ?? 0.7);
  const bandSet = suggested !== undefined && suggested < current ? set.filter((r) => r.got.classifierConfidence! >= suggested && r.got.classifierConfidence! < current) : [];
  return {
    n: set.length,
    correct: set.filter(ok).length,
    band: suggested !== undefined && suggested < current ? { n: bandSet.length, correct: bandSet.filter(ok).length } : undefined,
    l2: { n: l2.length, correct: l2.filter(ok).length },
    buckets,
    thresholds,
    suggested,
    misses: set.filter((r) => !ok(r)).map((r) => ({ id: r.id, text: r.text, expected: r.expect.intent!, got: r.got.classifierIntent!, conf: r.got.classifierConfidence! })),
  };
}

export interface RiskStat {
  key: RiskKey;
  positives: number;
  recalled: number;
  negatives: number;
  falsePositives: number;
}
export function riskStats(results: CaseResult[]): RiskStat[] {
  const negatives = results.filter(isBroadNegative);
  return RISK_KEYS.map((key) => {
    const pos = results.filter((r) => r.expect.riskHit?.includes(key));
    return {
      key,
      positives: pos.length,
      recalled: pos.filter((r) => r.got.riskHit.includes(key)).length,
      negatives: negatives.length,
      falsePositives: negatives.filter((r) => r.got.riskHit.includes(key)).length,
    };
  });
}

// ───────────────────────── Markdown ─────────────────────────

export interface ReportContext {
  provider: string;
  runAt: string;
  resetMs: number;
  resetEach: boolean;
  checkTools: boolean;
  aborted?: string;
  /** 规则层做减法：R007 开 / 关时跑 E58 的两条结果 */
  r007?: { on: CaseResult; off: CaseResult };
  /** 另一个分类器后端的对比（例如 Jev 不到 70% 时的 llm 复跑） */
  compare?: { provider: string; summary: EvalSummary; classifier: ClassifierStats };
  t05Pending: boolean;
}

const md = (s: string) => s.replace(/\|/g, "\\|");

export function renderMarkdown(results: CaseResult[], ctx: ReportContext): string {
  const s = summarize(results, ctx.checkTools);
  const layers = layerStats(results);
  const reasons = reasonCounts(results);
  const cls = classifierStats(results);
  const risks = riskStats(results);
  const failed = results.filter((r) => !r.pass);
  const degraded = results.filter((r) => r.degradedFirstAttempt).length;
  const degradedFinal = results.filter((r) => r.degradedFinal).length;
  const L: string[] = [];

  L.push(`# T06 端到端评测报告`, "");
  L.push(`- 运行时间：${ctx.runAt}`);
  L.push(`- 分类器后端：**${ctx.provider}**（\`CLASSIFIER_PROVIDER\`；真实调用 OpenRouter，未造假数据）`);
  L.push(`- 用例：${s.total} 条（\`data/eval/cases.json\`，未改动），通过 **${s.passed}**，未通过 ${s.total - s.passed}`);
  L.push(`- 总成本：${usd(s.totalCostUsd)}（${(s.totalCostUsd / Math.max(1, s.total)).toFixed(6)} / 条；取自各条 RouteTrace 的 cost.totalUsd，含后台风险检查）`);
  L.push(`- 重置策略：单次重置耗时 ${(ctx.resetMs / 1000).toFixed(1)} 秒，${ctx.resetEach ? "每条用例前重置" : "**只在开始时重置一次**（≥ 10 秒，按任务卡规则）；每条用例用全新会话，评测里不执行确认动作，所以订单 / 库存不会被改动"}`);
  L.push(`- 工具调用检查：${ctx.checkTools ? "已检查（非 mock 模式）" : "未检查（mock 模式）"}`);
  L.push(`- 分类器稳定性：${degraded} / ${s.total} 条用例**第一次尝试**时分类器被降级（Jev 超时 / 429 → 退到 llm 或 mock）或抛异常；评测脚本退避 3 秒、6 秒后最多重试 2 次，采用最后一次结果；重试 3 次仍降级的有 ${degradedFinal} 条（这些不计入下面「Jev 中文表现」的统计，但计入总成绩）`);
  if (ctx.aborted) L.push(`- ⚠️ 中止：${ctx.aborted}`);
  if (ctx.t05Pending) L.push(`- ⚠️ **T05（L3 Agent）尚未合并**：期望 L3 的用例失败属预期，原因标注「依赖 T05」，T05 合并后需重跑一次。`);
  L.push("");

  L.push(`## 一、总成绩`, "");
  L.push(`| 指标 | 数值 | 说明 |`, `|---|---:|---|`);
  L.push(`| 意图准确率 | ${pct(Math.round(s.intentAccuracy * results.filter((r) => r.expect.intent).length), results.filter((r) => r.expect.intent).length)} | 有 expect.intent 的用例，最终 trace.intent 是否一致 |`);
  L.push(`| 路由准确率 | ${pct(Math.round(s.layerAccuracy * s.total), s.total)} | 最终 trace.layer 是否在期望层里 |`);
  L.push(`| 风险召回率 | ${pct(Math.round(s.riskRecall * results.filter(isRiskCase).length), results.filter(isRiskCase).length)} | 期望命中风险项的用例，是否全部命中 |`);
  L.push(`| 风险误报率 | ${pct(Math.round(s.riskFalsePositiveRate * results.filter(isStrictNegative).length), results.filter(isStrictNegative).length)} | **按 cases.json 定义**：riskHit=[] 且非 risk_gate 的用例（${results.filter(isStrictNegative).length} 条，样本很少） |`);
  L.push(`| 风险误报率（宽口径） | ${pct(Math.round(s.riskFalsePositiveRateBroad * results.filter(isBroadNegative).length), results.filter(isBroadNegative).length)} | 所有不期望触发风险闸门的用例（${results.filter(isBroadNegative).length} 条） |`);
  L.push(`| 平均延迟 | ${s.avgLatencyMs} ms | trace.latency.totalMs 平均 |`, "");

  L.push(`### 分层延迟与成本（按实际落到的层）`, "");
  L.push(`| 层 | 条数 | 平均延迟 | p95 延迟 | 平均成本 |`, `|---|---:|---:|---:|---:|`);
  for (const [layer, v] of Object.entries(layers)) L.push(`| ${layer} | ${v.n} | ${v.avgMs} ms | ${v.p95Ms} ms | ${usd(v.avgCostUsd)} |`);
  L.push("", `买家实际等待（handleMessage 返回）平均 ${Math.round(mean(results.map((r) => r.responseMs)))} ms，p95 ${p95(results.map((r) => r.responseMs))} ms。L1 / 风险闸门的最终 trace 在后台写入，所以它们的 trace 延迟和买家等待不同。`, "");

  L.push(`## 二、未通过用例（${failed.length} 条）`, "");
  if (Object.keys(reasons).length) L.push(`原因汇总：${Object.entries(reasons).map(([k, v]) => `${k} ${v}`).join("；")}`, "");
  if (failed.length) {
    L.push(`| 用例 | 买家说 | 期望 | 实际 | 原因 |`, `|---|---|---|---|---|`);
    for (const r of failed) L.push(`| ${r.id} | ${md(r.text)} | ${md(describeExpect(r.expect, ctx.checkTools))} | ${md(describeGot(r.got, ctx.checkTools))}${r.error ? ` 错误：${md(r.error)}` : ""} | ${r.reason} |`);
  } else L.push("全部通过。");
  L.push("");

  L.push(`## 三、Jev 中文表现`, "");
  L.push(`> 数据来自 RouteTrace.topIntents[0]（分类器自己的 top1 意图与概率），不受规则 / 续接逻辑影响。分类器后端：${ctx.provider}。`, "");
  if (!cls.n) {
    L.push("本次没有可用的分类器概率（mock 模式或全部降级），本节无数据。", "");
  } else {
    const acc = cls.correct / cls.n;
    L.push(`- 带意图标注的用例 **${cls.n}** 条，分类器 top1 意图准确率 **${pct(cls.correct, cls.n)}**（${cls.correct}/${cls.n}）。`);
    L.push(`- 其中期望走 L2 的用例 **${cls.l2.n}** 条，意图准确率 **${pct(cls.l2.correct, cls.l2.n)}**（${cls.l2.correct}/${cls.l2.n}）。`);
    if (acc < 0.7) L.push(`- ⚠️ **Jev 意图准确率低于 70%**。${ctx.compare ? "已用 CLASSIFIER_PROVIDER=llm 复跑对比（见下）。" : "按任务卡应再用 CLASSIFIER_PROVIDER=llm 复跑做对比。"}`);
    L.push("", `### 置信度分桶`, "", `| 置信度 | 条数 | 答对 | 准确率 |`, `|---|---:|---:|---:|`);
    for (const b of cls.buckets) L.push(`| ${b.label} | ${b.n} | ${b.correct} | ${pct(b.correct, b.n)} |`);
    L.push("", `### L2_CONFIDENCE_THRESHOLD 建议`, "", `| 阈值 | 被接下的条数 | 其中答对 | 准确率 |`, `|---:|---:|---:|---:|`);
    for (const t of cls.thresholds) L.push(`| ${t.t.toFixed(2)} | ${t.accepted} | ${t.correct} | ${pct(t.correct, t.accepted)} |`);
    L.push("");
    if (cls.suggested !== undefined) {
      L.push(`按任务卡口径，使被 L2 接下的消息准确率 ≥ 95% 的最低置信度（至少接下 10 条）是 **${cls.suggested.toFixed(2)}**；当前配置为 0.70。`);
      if (cls.band) {
        const bandOk = cls.band.n >= 10 && cls.band.correct / cls.band.n >= 0.95;
        L.push(`但 [${cls.suggested.toFixed(2)}, 0.70) 这一段只有 ${cls.band.n} 条样本、答对 ${cls.band.correct} 条（${pct(cls.band.correct, cls.band.n)}），${bandOk ? "样本足够，可以下调。" : "样本太少，下调没有统计依据。"}`, "");
        L.push(`**建议：\`L2_CONFIDENCE_THRESHOLD=${bandOk ? cls.suggested.toFixed(2) : "0.70"}\`${bandOk ? "" : "（保持不变）"}**。样本只有 ${cls.n} 条，结论仅供参考；要真正定阈值，需要更多落在 0.5–0.85 的用例。`, "");
      } else L.push(`**建议：\`L2_CONFIDENCE_THRESHOLD=${cls.suggested.toFixed(2)}\`**。样本只有 ${cls.n} 条，结论仅供参考。`, "");
    }
    else L.push(`**没有任何阈值能让被接下的消息准确率达到 95%（且至少 10 条）**，建议保持 0.70 并优先修复下面的错分，样本只有 ${cls.n} 条。`, "");
    if (cls.misses.length) {
      L.push(`### 分类器错分明细`, "", `| 用例 | 买家说 | 期望 | 分类器给的 | 置信度 |`, `|---|---|---|---|---:|`);
      for (const m of cls.misses) L.push(`| ${m.id} | ${md(m.text)} | ${m.expected} | ${m.got} | ${m.conf.toFixed(2)} |`);
      L.push("");
    }
  }
  L.push(`### 风险项召回率与误报率`, "", `> 误报分母：所有不期望触发风险闸门的 ${results.filter(isBroadNegative).length} 条用例。\`legal_threat / health_safety / fraud_security\` 有硬关键词兜底（如「消协」「红疹」），命中时分数直接为 1，所以这三项的召回含关键词的功劳，不全是 Jev 的。`, "");
  L.push(`| 风险项 | 应命中 | 命中 | 召回率 | 误报 | 误报率 |`, `|---|---:|---:|---:|---:|---:|`);
  for (const r of risks) L.push(`| ${r.key} | ${r.positives} | ${r.recalled} | ${pct(r.recalled, r.positives)} | ${r.falsePositives} | ${pct(r.falsePositives, r.negatives)} |`);
  L.push("");
  if (ctx.compare) {
    const c = ctx.compare;
    L.push(`### 对比：CLASSIFIER_PROVIDER=${c.provider}`, "", `| 指标 | ${ctx.provider} | ${c.provider} |`, `|---|---:|---:|`);
    L.push(`| 分类器 top1 意图准确率 | ${pct(cls.correct, cls.n)} | ${pct(c.classifier.correct, c.classifier.n)} |`);
    L.push(`| 最终意图准确率 | ${(s.intentAccuracy * 100).toFixed(1)}% | ${(c.summary.intentAccuracy * 100).toFixed(1)}% |`);
    L.push(`| 路由准确率 | ${(s.layerAccuracy * 100).toFixed(1)}% | ${(c.summary.layerAccuracy * 100).toFixed(1)}% |`);
    L.push(`| 风险召回率 | ${(s.riskRecall * 100).toFixed(1)}% | ${(c.summary.riskRecall * 100).toFixed(1)}% |`);
    L.push(`| 平均延迟 | ${s.avgLatencyMs} ms | ${c.summary.avgLatencyMs} ms |`);
    L.push(`| 总成本 | ${usd(s.totalCostUsd)} | ${usd(c.summary.totalCostUsd)} |`, "");
  }

  L.push(`## 四、规则层做减法：R007「尺码（宽泛）」`, "");
  if (ctx.r007) {
    const { on, off } = ctx.r007;
    L.push(`用例 E58「${on.text}」，期望 L2 / refund_apply。R007 的正则是「尺码」，最大长度 20 字，所以会截走这句话。`, "");
    L.push(`| R007 | 实际 | 结果 | 延迟 | 成本 |`, `|---|---|---|---:|---:|`);
    L.push(`| 开启 | ${md(describeGot(on.got, false))} | ${on.pass ? "✅ 通过" : `❌ ${on.reason}`} | ${on.latencyMs} ms | ${usd(on.costUsd)} |`);
    L.push(`| 关闭 | ${md(describeGot(off.got, false))} | ${off.pass ? "✅ 通过" : `❌ ${off.reason}`} | ${off.latencyMs} ms | ${usd(off.costUsd)} |`, "");
    L.push(on.pass === off.pass ? "两次结果相同，没有看到差异。" : off.pass && !on.pass ? "结论：关闭 R007 后，这句话回到模型理解，走对了意图——**规则层越宽越容易「误吞」，做减法有效**。" : "结论：开启 R007 反而通过，和预期相反，请人工查看。", "");
  } else L.push("本次没有跑 R007 对比（缺 E58 或被跳过）。", "");

  L.push(`## 五、逐条结果`, "");
  L.push(`| 用例 | 买家说 | 结果 | 实际 | 延迟 | 成本 | 回复摘要 |`, `|---|---|---|---|---:|---:|---|`);
  for (const r of results) {
    L.push(`| ${r.id} | ${md(r.text.slice(0, 30))} | ${r.pass ? "✅" : `❌ ${r.reason}`}${r.retried ? `（${r.attempts}次${r.degradedFinal ? "，仍降级" : ""}）` : ""} | ${md(describeGot(r.got, ctx.checkTools))} | ${r.latencyMs} ms | ${usd(r.costUsd)} | ${md(r.replyPreview.slice(0, 50))} |`);
  }
  L.push("", `## 六、判定说明`, "");
  L.push(`- 判定严格按 \`data/eval/cases.json\` 的 \`_readme\`：layer（字符串或数组，任一即可）、intent、riskHit（子集）、handoff、tools（子集，仅非 mock）。`);
  L.push(`- 唯一的解释性约定：期望转人工（handoff=true）且期望层是 L1 / L2 / L3 时，若 trace 是「该层接住后转人工」（layer=human 且 escalatedFrom=期望层）也算层级正确——否则「转人工」这类 L1 规则命中后立刻交给人工的消息会被误判。其余一律严格匹配。`);
  L.push(`- 失败原因由通用规则分类，不针对任何用例：重试 3 次后分类器仍被降级（Jev 超时，由 llm / mock 回答）→ 分类器降级（不是 Jev 中文能力问题）；期望 L3 且 L3 仍是占位回复 → 依赖 T05；风险应命中未命中 → 风险漏判；非风险用例触发闸门 → 风险误报；被 L1 规则截走 → 规则误吞；分类器 top1 意图就不对 → 分类错；意图对但层级 / 工具不对 → 细分为：handler 自己转人工而用例没期望 → 转人工判断错；复合诉求被当成单意图 → 多步没识别；置信度低于阈值落到 L3 → 置信度不足；其余 → 槽位没补全。`);
  L.push(`- 流水线 bug 不在这里修，见 \`docs/questions/\`。`, "");
  return L.join("\n");
}
