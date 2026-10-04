/**
 * npm run eval — 端到端评测（T06）。
 *
 *   npm run eval                          # 跑 60 条，默认 Jev，写报告 + eval_latest.json
 *   npm run eval -- --provider llm        # 换分类器后端 jev | llm | mock
 *   npm run eval -- --only E01,E02        # 只跑指定用例（只打印，不写任何文件）
 *   npm run eval -- --compare llm         # 主跑之后再用另一个后端全量复跑做对比（默认：Jev 意图准确率 < 70% 时自动用 llm）
 *   npm run eval -- --compare none        # 不做对比
 *   npm run eval -- --skip-r007           # 不跑「R007 开 / 关」对比
 *   npm run eval -- --no-latest           # 不覆盖 eval_latest.json（看板成绩卡保持不变）
 *   npm run eval -- --report docs/reports/x.md   # 报告写到别处（同名 .json 存逐条明细）
 *   npm run eval -- --keep-data           # 跑完不重置演示数据（默认会重置，避免评测会话混进卖家端）
 */
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadLocalEnv } from "../lib/llm/env";
import { hasApiKey } from "../lib/llm/openrouter";
import { loadCases, runCases, type CaseResult } from "../lib/eval/run";
import { buildReport, classifierStats, renderMarkdown, summarize, type ReportContext } from "../lib/eval/report";
import { resetDemoData } from "../lib/store/reset";
import { updateRule } from "../lib/store/collections";

type Provider = "jev" | "llm" | "mock";

function main(): Promise<void> {
  loadLocalEnv();
  const args = process.argv.slice(2);
  const param = (name: string) => {
    const i = args.indexOf(name);
    return i < 0 ? undefined : args[i + 1];
  };
  const flag = (name: string) => args.includes(name);
  const provider = (param("--provider") ?? process.env.CLASSIFIER_PROVIDER ?? "jev") as Provider;
  if (!["jev", "llm", "mock"].includes(provider)) throw new Error("--provider 只能是 jev | llm | mock");
  const only = param("--only")?.split(",").map((s) => s.trim()).filter(Boolean);
  const compareArg = param("--compare") ?? "auto";
  const reportPath = param("--report") ?? join("docs", "reports", "T06-eval.md");
  const full = !only?.length;
  return run(provider, only, compareArg, reportPath, full, flag("--skip-r007"), flag("--no-latest"), flag("--keep-data"));
}

async function run(provider: Provider, only: string[] | undefined, compareArg: string, reportPath: string, full: boolean, skipR007: boolean, noLatest: boolean, keepData: boolean): Promise<void> {
  const log = (line: string) => console.log(line);
  const live = provider !== "mock" && hasApiKey();
  log(`评测开始：分类器后端 ${provider}${live ? "" : provider === "mock" ? "" : "（未配置 OPENROUTER_API_KEY，将降级到 mock）"}；${only?.length ? `只跑 ${only.join(",")}` : "全部用例"}`);
  const cases = loadCases();
  const first = await runCases(cases, { provider, only, log });
  const results = first.results;
  const summary = summarize(results, live);
  log(`\n通过 ${summary.passed}/${summary.total} · 意图 ${(summary.intentAccuracy * 100).toFixed(1)}% · 路由 ${(summary.layerAccuracy * 100).toFixed(1)}% · 风险召回 ${(summary.riskRecall * 100).toFixed(1)}% · 误报 ${(summary.riskFalsePositiveRate * 100).toFixed(1)}% · 平均 ${summary.avgLatencyMs}ms · 总成本 $${summary.totalCostUsd.toFixed(6)}`);
  if (first.aborted) log(`⚠️ ${first.aborted}`);

  if (!full) {
    log("\n（指定了 --only：不写报告 / eval_latest.json，也不重置数据）");
    return;
  }
  if (first.aborted) throw new Error(`评测被成本保护中止：${first.aborted}`);

  // ── 规则层做减法：R007 开 / 关各跑一次 E58 ──
  let r007: ReportContext["r007"];
  const e58 = cases.filter((c) => c.id === "E58");
  if (!skipR007 && e58.length) {
    log("\nR007 对比：E58 分别在规则开启 / 关闭下各跑一次");
    const exp = async (enabled: boolean): Promise<CaseResult> => (await runCases(e58, { provider, skipReset: true, prepare: () => void updateRule("R007", { enabled }), log })).results[0];
    const on = await exp(true);
    const off = await exp(false);
    updateRule("R007", { enabled: true });
    r007 = { on, off };
  }

  // ── 对比后端 ──
  const cls = classifierStats(results);
  const jevLow = provider === "jev" && cls.n > 0 && cls.correct / cls.n < 0.7;
  const comparePick = compareArg === "auto" ? (jevLow ? "llm" : "none") : compareArg;
  let compare: ReportContext["compare"];
  if (comparePick !== "none" && comparePick !== provider) {
    log(`\n对比复跑：CLASSIFIER_PROVIDER=${comparePick}`);
    const other = await runCases(cases, { provider: comparePick as Provider, log });
    compare = { provider: comparePick, summary: summarize(other.results, true), classifier: classifierStats(other.results) };
    process.env.CLASSIFIER_PROVIDER = provider;
  }

  // ── 重置，避免评测会话混进卖家端（eval_latest.json 在重置时会保留） ──
  if (!keepData) {
    log("\n清理评测产生的会话：重置演示数据…");
    await resetDemoData();
  }

  const note = `T06 评测：${summary.total} 条用例，分类器 ${provider}${r007 ? "，含 R007 开/关对比" : ""}`;
  const ctx: ReportContext = {
    provider,
    runAt: first.startedAt,
    resetMs: first.resetMs,
    resetEach: first.resetEach,
    checkTools: live,
    aborted: first.aborted,
    r007,
    compare,
    // L3 还是占位实现时，期望 L3 的用例全部失败；有任一条 L3 占位回复即视为 T05 未合并
    t05Pending: results.some((r) => r.got.l3Placeholder),
  };
  const report = buildReport(results, provider, first.startedAt, live, note);
  const outMd = join(process.cwd(), reportPath);
  mkdirSync(dirname(outMd), { recursive: true });
  writeFileSync(outMd, renderMarkdown(results, ctx) + "\n");
  writeFileSync(outMd.replace(/\.md$/, ".json"), JSON.stringify({ report, context: { ...ctx, r007: undefined, compare: undefined }, results, r007, compare }, null, 2) + "\n");
  log(`\n报告：${reportPath}`);

  if (!noLatest) {
    const runtime = join(process.cwd(), "data", "runtime", "eval_latest.json");
    mkdirSync(dirname(runtime), { recursive: true });
    writeFileSync(runtime, JSON.stringify(report, null, 2) + "\n");
    const seedFile = join(process.cwd(), "data", "seed", "eval_latest.json");
    copyFileSync(runtime, seedFile);
    log(`看板成绩：data/runtime/eval_latest.json（已同步 data/seed/eval_latest.json）`);
  }
}

// 显式退出：Jev 保温定时器会让进程一直挂着
main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
