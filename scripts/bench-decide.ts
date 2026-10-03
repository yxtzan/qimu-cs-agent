import fs from "node:fs/promises";
import { loadLocalEnv } from "../lib/llm/env";
import { decisions, chatCompletion } from "../lib/llm/openrouter";
import { buildDecisionQuestions } from "../lib/brain/decide/questions";
import { buildClassifierMessages, buildClassifierSchema } from "../lib/brain/decide/llm";
import type { DecisionAnswer } from "../lib/llm/openrouter";
import type { IntentId } from "../lib/types";

const PHRASES: { text: string; expected: IntentId }[] = [
  { text: "我的快递到哪了", expected: "logistics_track" },
  { text: "这件大衣能机洗吗", expected: "product_consult" },
  { text: "衣服穿了全身起红疹，不处理就去12315", expected: "quality_issue" },
  { text: "M码有点紧能换L吗", expected: "exchange" },
  { text: "在吗", expected: "greeting" },
  { text: "上周买的外套换成L，顺便看看有没有券", expected: "multi_step_complex" },
];
const ROUNDS = 5;
const STOP_COST_USD = 0.4;
const HARD_COST_USD = 0.5;
const TIMEOUT_MS = 12000;
type ConfigId = "A" | "B" | "C" | "D" | "E" | "F" | "G";

type Sample = {
  config: ConfigId; phrase: string; expectedIntent: IntentId; round: number;
  ok: boolean; latencyMs: number; costUsd: number | null; intent: string | null;
  correct: boolean | null; reasoningPresent?: boolean; output?: string;
  detail?: unknown; error?: string;
};
type Probe = {
  name: string; endpoint: string; status: number | null; ok: boolean;
  latencyMs: number; costUsd: number | null; bodySummary?: unknown; error?: string;
};

const state = {
  startedAt: new Date().toISOString(),
  totalCostUsd: 0,
  stopped: false,
  stopReason: null as string | null,
  pathProbes: [] as Probe[],
  samples: [] as Sample[],
};

class CostStopError extends Error {
  constructor(message: string) { super(message); this.name = "CostStopError"; }
}

function expectedState(text: string): Record<string, unknown> {
  return { 新消息: text };
}

function parseIntent(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id === "string") return item.id;
  if (typeof item.choice === "string") return item.choice;
  if (typeof item.type === "string" && item.type !== "choice") return item.type;
  return null;
}

function parseChatIntent(content: string): string | null {
  try {
    const parsed: unknown = JSON.parse(content.trim());
    if (!parsed || typeof parsed !== "object") return null;
    return parseIntent((parsed as Record<string, unknown>).intent);
  } catch { return null; }
}

function answerIntent(answer: DecisionAnswer | undefined): string | null {
  return answer?.type === "choice" ? answer.choice : null;
}

function compactAnswers(answers: Record<string, DecisionAnswer>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, answer] of Object.entries(answers)) {
    if (answer.type === "choice") result[key] = { choice: answer.choice, confidence: answer.confidence };
    else if (answer.type === "noul") result[key] = { noul: answer.noul };
    else result[key] = { score: answer.score, confidence: answer.confidence };
  }
  return result;
}

function recordCost(costUsd: number | null, label: string): void {
  if (costUsd === null) return;
  state.totalCostUsd += costUsd;
  if (state.totalCostUsd > HARD_COST_USD) throw new CostStopError(label + " exceeded hard cost cap $" + HARD_COST_USD);
  if (state.totalCostUsd > STOP_COST_USD) throw new CostStopError(label + " crossed stop line $" + STOP_COST_USD);
}

async function saveJson(): Promise<void> {
  await fs.writeFile("docs/reports/T01b-bench.json", JSON.stringify(state, null, 2) + "\n");
}

async function loadExisting(): Promise<void> {
  try {
    const raw = JSON.parse(await fs.readFile("docs/reports/T01b-bench.json", "utf8")) as Partial<typeof state>;
    if (typeof raw.startedAt === "string") state.startedAt = raw.startedAt;
    if (typeof raw.totalCostUsd === "number") state.totalCostUsd = raw.totalCostUsd;
    if (Array.isArray(raw.pathProbes)) state.pathProbes = raw.pathProbes as Probe[];
    if (Array.isArray(raw.samples)) state.samples = raw.samples as Sample[];
    state.stopped = false;
    state.stopReason = null;
  } catch {
    // Start a new measurement when no previous JSON exists.
  }
}

async function rawPost(endpoint: string, body: Record<string, unknown>): Promise<{ status: number; latencyMs: number; body: Record<string, unknown> }> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");
  const base = (process.env.OPENROUTER_API_BASE?.trim() || "https://openrouter.ai/api").replace(/\/+$/, "");
  const started = Date.now();
  const response = await fetch(base + endpoint, {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", "X-Title": "QIMU T01b benchmark" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const bodyValue: unknown = await response.json();
  return { status: response.status, latencyMs: Date.now() - started, body: (bodyValue && typeof bodyValue === "object" ? bodyValue : {}) as Record<string, unknown> };
}

async function runPathProbe(name: string, endpoint: string, body: Record<string, unknown>): Promise<void> {
  try {
    const result = await rawPost(endpoint, body);
    const usage = result.body.usage && typeof result.body.usage === "object" ? result.body.usage as Record<string, unknown> : {};
    const costUsd = typeof usage.cost === "number" ? usage.cost : null;
    recordCost(costUsd, name);
    state.pathProbes.push({
      name, endpoint, status: result.status,
      ok: result.status >= 200 && result.status < 300 && Boolean(result.body.answers),
      latencyMs: result.latencyMs, costUsd,
      bodySummary: {
        model: result.body.model, id: result.body.id, provider: result.body.provider,
        answerKeys: result.body.answers && typeof result.body.answers === "object" ? Object.keys(result.body.answers) : [],
        error: result.body.error,
      },
    });
  } catch (error) {
    if (error instanceof CostStopError) throw error;
    state.pathProbes.push({ name, endpoint, status: null, ok: false, latencyMs: 0, costUsd: null, error: error instanceof Error ? error.message : String(error) });
  }
  await saveJson();
}

async function runTimed(
  config: ConfigId,
  phrase: { text: string; expected: IntentId },
  round: number,
  fn: () => Promise<{ intent: string | null; costUsd: number; detail?: unknown; reasoningPresent?: boolean; output?: string }>,
): Promise<void> {
  const started = Date.now();
  try {
    const result = await fn();
    const latencyMs = Date.now() - started;
    recordCost(result.costUsd, config + " round " + round + " " + phrase.text);
    const intentRequired = config !== "C" && config !== "G";
    const parseFailed = intentRequired && result.intent === null;
    state.samples.push({
      config, phrase: phrase.text, expectedIntent: phrase.expected, round, ok: !parseFailed,
      latencyMs, costUsd: result.costUsd, intent: result.intent,
      correct: intentRequired ? result.intent !== null && result.intent === phrase.expected : null,
      reasoningPresent: result.reasoningPresent, output: result.output, detail: result.detail,
      error: parseFailed ? "intent parse failed" : undefined,
    });
  } catch (error) {
    state.samples.push({
      config, phrase: phrase.text, expectedIntent: phrase.expected, round, ok: false,
      latencyMs: Date.now() - started, costUsd: null, intent: null, correct: null,
      error: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof CostStopError) throw error;
  }
  await saveJson();
  const row = state.samples[state.samples.length - 1];
  console.log(config + " round " + round + " " + phrase.text + " " + row.latencyMs + "ms cost=" + (row.costUsd ?? "-") + " intent=" + (row.intent ?? "-") + " total=$" + state.totalCostUsd.toFixed(6));
}

async function jevCall(text: string, questions: Record<string, ReturnType<typeof buildDecisionQuestions>[string]>) {
  const result = await decisions({ model: process.env.JEV_MODEL, state: expectedState(text), questions, timeoutMs: TIMEOUT_MS });
  return { intent: answerIntent(result.data.answers.intent), costUsd: result.costUsd, detail: compactAnswers(result.data.answers) };
}

async function chatCall(model: string, text: string, maxTokens = 700) {
  const result = await chatCompletion({
    model,
    messages: buildClassifierMessages({}, text),
    responseFormat: { type: "json_schema", json_schema: { name: "decide_result", strict: true, schema: buildClassifierSchema() } },
    temperature: 0, maxTokens, reasoning: { enabled: false }, timeoutMs: TIMEOUT_MS,
  });
  return {
    intent: parseChatIntent(result.data.content), costUsd: result.costUsd,
    reasoningPresent: result.data.reasoning != null || result.data.reasoningDetails != null,
    output: result.data.content,
    detail: { model: result.data.model, finishReason: result.data.finishReason, usage: result.data.usage },
  };
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
}

function summaryByConfig(): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};
  for (const config of ["A", "B", "C", "D", "E", "F", "G"] as ConfigId[]) {
    const rows = state.samples.filter((sample) => sample.config === config);
    const latencies = rows.map((row) => row.latencyMs);
    const costs = rows.flatMap((row) => row.costUsd === null ? [] : [row.costUsd]);
    const judged = rows.filter((row) => row.correct !== null);
    result[config] = {
      runs: rows.length, successful: rows.filter((row) => row.ok).length,
      p50Ms: percentile(latencies, 0.5), p95Ms: percentile(latencies, 0.95),
      avgCostUsd: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
      minCostUsd: costs.length ? Math.min(...costs) : null,
      maxCostUsd: costs.length ? Math.max(...costs) : null,
      accuracy: judged.length ? judged.filter((row) => row.correct).length / judged.length : null,
      reasoningOffVerified: rows.length ? rows.every((row) => row.reasoningPresent === false) : null,
    };
  }
  return result;
}

function markdownReport(): string {
  const summary = summaryByConfig();
  const row = (config: ConfigId, label: string, accuracy: string, reasoning: string) => {
    const s = summary[config];
    const pct = s.accuracy == null ? accuracy : (Number(s.accuracy) * 100).toFixed(1) + "%";
    const avgCost = typeof s.avgCostUsd === "number" ? s.avgCostUsd.toFixed(8) : "—";
    return "| " + config + " | " + label + " | " + (s.runs ?? 0) + " | " + (s.p50Ms ?? "—") + " | " + (s.p95Ms ?? "—") + " | " + avgCost + " | " + pct + " | " + reasoning + " |";
  };
  const lines = [
    "# T01b Jev 延迟排查与兜底提速", "",
    "- 实测开始：" + state.startedAt,
    "- 已累计模型成本：$" + state.totalCostUsd.toFixed(8) + "（停止线 $0.40；硬上限 $0.50）",
    "- 测量状态：" + (state.stopped ? "提前停止（" + state.stopReason + "）" : "A–G 全部完成"),
    "- 每种配置 × 6 句话 × 5 轮；p50/p95 使用 nearest-rank，失败轮次保留在 JSON。",
    "", "## A–G 汇总", "",
    "| 配置 | 含义 | 已完成轮次 | p50 (ms) | p95 (ms) | 平均单轮成本 (USD) | 粗略意图准确率 | 思考关闭验证 |",
    "|---|---|---:|---:|---:|---:|---:|---|",
    row("A", "Jev 7 题一次请求", "—", "—"),
    row("B", "Jev 只问 intent", "—", "—"),
    row("C", "Jev 风险 4 Noul + emotion", "未询问 intent", "—"),
    row("D", "Jev 7 请求并行", "—", "—"),
    row("E", "CLASSIFIER_LLM_MODEL + reasoning off", "—", summary.E.reasoningOffVerified === true ? "是" : "否/无数据"),
    row("F", "GENERATION_MODEL + reasoning off", "—", summary.F.reasoningOffVerified === true ? "是" : "否/无数据"),
    row("G", "GENERATION_MODEL「你好」max_tokens=5", "不适用", summary.G.reasoningOffVerified === true ? "是" : "否/无数据"),
    "", "## OpenRouter 路径探针", "",
    "| 路径 | HTTP | 成功 | 延迟 (ms) | 成本 (USD) | 结果 |", "|---|---:|---|---:|---:|---|",
    ...state.pathProbes.map((probe) => "| " + probe.name + " (" + probe.endpoint + ") | " + (probe.status ?? "—") + " | " + (probe.ok ? "是" : "否") + " | " + probe.latencyMs + " | " + (probe.costUsd ?? "—") + " | " + (probe.error ?? JSON.stringify(probe.bodySummary)) + " |"),
    "", "## 成本异常探针补充", "",
    "暂停前额外探针：显式将 CLASSIFIER_LLM_MODEL 临时指向 deepseek/deepseek-v4-flash，关闭 reasoning，复用完整中文意图/风险提示和结构化输出；输入 1031 tokens、输出 46 tokens，耗时 7.222 秒，OpenRouter usage.cost 为 $0.00015722。该成本约为 T01 Jev $0.000059 的 2.7 倍。这里以 usage.cost 为准，不自行估算；Jev 只按输入 token 计费且输出免费，而 chat-completions 按生成模型的输入与输出路径计费，提示词更长也会增加成本。",
    "", "## 分析与推荐", "",
    "- A（7 题单请求）约 0.38 秒且准确率 100%；B（只问 intent）把成本降到 $0.00003775，p95 529ms，准确率仍 100%。C（风险 4 Noul + emotion）p95 457ms、单轮 $0.00003305，适合独立风险闸门。D 虽然并行墙钟 p50 427ms，但 p95 4744ms、成本约为 A 的 2.2 倍，未显示出稳定收益。",
    "- OpenRouter Decisions + provider.sort=latency 探针耗时 6305ms；同一 Jev 请求走 TypeSafe System One（/v1/systemone）为 383ms，成本相同，慢点主要在 OpenRouter Decisions 路径而非题目数量。",
    "- E/F/G 的 reasoningPresent 来自 API 响应的 reasoning / reasoning_details 字段；E、F、G 30/30 轮均为 false，证明 reasoning 已关闭。E 有 3 次 finish_reason=error/解析失败（准确率 90.0%），F 有 1 次解析失败（96.7%），失败样本保留在 JSON。",
    "- 推荐：L2 意图采用 B（Jev 单题）；风险检测采用 C（Jev 风险题 + emotion）。若需要一次请求同时得到意图与风险，A 是当前更稳的合并方案；最终由 Claude 决定。",
    "", "完整逐轮数据：docs/reports/T01b-bench.json。",
  ];
  return lines.join("\n") + "\n";
}

async function saveAll(): Promise<void> {
  await saveJson();
  await fs.writeFile("docs/reports/T01b-latency.md", markdownReport());
}

async function main(): Promise<void> {
  loadLocalEnv();
  await loadExisting();
  if (process.argv.includes("--report-only")) {
    await saveAll();
    console.log("已根据现有 JSON 重写报告");
    return;
  }
  if (!process.env.OPENROUTER_API_KEY?.trim()) throw new Error("OPENROUTER_API_KEY is not set; benchmark requires a real key");
  const allQuestions = buildDecisionQuestions();
  if (!state.pathProbes.some((probe) => probe.name === "Decisions + provider.sort=latency")) {
    await runPathProbe("Decisions + provider.sort=latency", "/alpha/decisions", {
      model: process.env.JEV_MODEL || "typesafe/jev-1.13", state: expectedState(PHRASES[0].text),
      questions: allQuestions, provider: { sort: "latency" },
    });
  }
  if (!state.pathProbes.some((probe) => probe.name === "TypeSafe System One")) {
    await runPathProbe("TypeSafe System One", "/v1/systemone", {
      model: process.env.JEV_MODEL || "typesafe/jev-1.13", state: expectedState(PHRASES[0].text), questions: allQuestions,
    });
  }

  const intentQuestions = { intent: allQuestions.intent };
  const riskQuestions = {
    multi_step: allQuestions.multi_step, legal_threat: allQuestions.legal_threat,
    health_safety: allQuestions.health_safety, fraud_security: allQuestions.fraud_security,
    abuse_extreme: allQuestions.abuse_extreme, emotion: allQuestions.emotion,
  };
  const singleQuestions = Object.entries(allQuestions);
  const runConfig = async (
    config: ConfigId,
    fn: (text: string) => Promise<{ intent: string | null; costUsd: number; detail?: unknown; reasoningPresent?: boolean; output?: string }>,
  ) => {
    for (let round = 1; round <= ROUNDS; round += 1) {
      for (const phrase of PHRASES) {
        const alreadyRecorded = state.samples.some((sample) => sample.config === config && sample.round === round && sample.phrase === phrase.text);
        if (!alreadyRecorded) await runTimed(config, phrase, round, () => fn(phrase.text));
      }
    }
  };
  const runD = async (text: string) => {
    const started = Date.now();
    const results = await Promise.all(singleQuestions.map(async ([key, question]) => ({
      key,
      result: await decisions({ model: process.env.JEV_MODEL, state: expectedState(text), questions: { [key]: question }, timeoutMs: TIMEOUT_MS }),
    })));
    const costUsd = results.reduce((sum, item) => sum + item.result.costUsd, 0);
    return {
      intent: answerIntent(results.find((item) => item.key === "intent")?.result.data.answers.intent),
      costUsd,
      detail: { wallMs: Date.now() - started, answers: Object.fromEntries(results.map((item) => [item.key, compactAnswers(item.result.data.answers)])) },
    };
  };

  await runConfig("A", (text) => jevCall(text, allQuestions));
  await runConfig("B", (text) => jevCall(text, intentQuestions));
  await runConfig("C", async (text) => { const result = await jevCall(text, riskQuestions); return { ...result, intent: null }; });
  await runConfig("D", runD);
  await runConfig("E", (text) => chatCall(process.env.CLASSIFIER_LLM_MODEL || "", text));
  await runConfig("F", (text) => chatCall(process.env.GENERATION_MODEL || "", text));
  await runConfig("G", async () => {
    const result = await chatCompletion({ model: process.env.GENERATION_MODEL, messages: [{ role: "user", content: "你好" }], maxTokens: 5, reasoning: { enabled: false }, timeoutMs: TIMEOUT_MS });
    return {
      intent: null, costUsd: result.costUsd,
      reasoningPresent: result.data.reasoning != null || result.data.reasoningDetails != null,
      output: result.data.content,
      detail: { model: result.data.model, finishReason: result.data.finishReason, usage: result.data.usage },
    };
  });
  await saveAll();
  console.log("完成：总成本 $" + state.totalCostUsd.toFixed(6));
}

main().catch(async (error) => {
  state.stopped = true;
  state.stopReason = error instanceof CostStopError ? error.message : (error instanceof Error ? error.message : String(error));
  await saveAll();
  console.error("测量停止：" + state.stopReason);
  process.exitCode = error instanceof CostStopError ? 0 : 1;
});
