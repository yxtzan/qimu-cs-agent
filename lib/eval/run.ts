/**
 * 端到端评测执行器（T06）。
 *
 * 进程内调用 `handleMessage`（和 scripts/chat-cli.ts 一样），每条用例：新会话 → setup.prior → input →
 * drainBackgroundTasks() → 读该轮买家消息对应的最终 RouteTrace → 按 cases.json 的 `_readme` 判定。
 * 这里不对任何用例做特判；失败原因由通用规则分类（见 classifyFailure）。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { drainBackgroundTasks } from "../brain/background";
import { handleMessage } from "../brain/pipeline";
import { hasApiKey } from "../llm/openrouter";
import { getConversation, listMessages, listTraces } from "../store/conversations";
import { resetDemoData } from "../store/reset";
import "../store/reset-hooks"; // 重置钩子登记（知识库索引、种子流量）
import type { ChatAction, DecideResult, IntentId, Layer, RiskKey, RouteTrace } from "../types";

// ───────────────────────── 用例与结果类型（评测内部，不进 lib/types.ts） ─────────────────────────

export interface EvalInput {
  text?: string;
  action?: ChatAction;
}
export interface EvalCase {
  id: string;
  buyerId: string;
  input: EvalInput;
  setup?: { context?: Record<string, string>; prior?: EvalInput[] };
  expect: {
    layer: Layer | Layer[];
    intent?: IntentId;
    riskHit?: RiskKey[];
    handoff?: boolean;
    tools?: string[];
  };
}

export type FailureReason = "分类错" | "槽位没补全" | "规则误吞" | "风险漏判" | "风险误报" | "转人工判断错" | "置信度不足" | "多步没识别" | "依赖 T05" | "分类器降级" | "无最终 trace" | "运行异常";

export interface CaseGot {
  layer: Layer | "none";
  escalatedFrom?: Layer;
  intent?: IntentId;
  /** 分类器自己的 top1 意图与概率（来自 trace.topIntents[0]），不受规则 / 续接逻辑影响。 */
  classifierIntent?: IntentId;
  classifierConfidence?: number;
  riskHit: RiskKey[];
  riskScores?: Partial<Record<RiskKey, number>>;
  handoff: boolean;
  tools: string[];
  ruleId?: string;
  decideProvider?: DecideResult["provider"];
  l3Placeholder: boolean;
}

export interface CaseResult {
  id: string;
  buyerId: string;
  text: string;
  expect: EvalCase["expect"];
  got: CaseGot;
  dims: { layer: boolean; intent?: boolean; risk?: boolean; handoff?: boolean; tools?: boolean };
  pass: boolean;
  reason?: FailureReason;
  /** trace.latency.totalMs（和看板同口径） */
  latencyMs: number;
  /** 买家等待 handleMessage 返回的墙钟时间 */
  responseMs: number;
  /** 这条用例所有 trace（含 prior）的 cost.totalUsd 之和 */
  costUsd: number;
  /** 第一次尝试时分类器降级（jev→llm→mock）了，重试了一次 */
  retried: boolean;
  attempts: number;
  degradedFirstAttempt: boolean;
  /** 所有尝试用完后，最终采用的结果仍然是降级后端给出的（不计入 Jev 表现统计） */
  degradedFinal: boolean;
  replyPreview: string;
  error?: string;
}

export interface RunOptions {
  provider: "jev" | "llm" | "mock";
  only?: string[];
  /** 每条用例前重置。undefined = 自动（首次重置 < 10 秒才开启）。 */
  resetEach?: boolean;
  /** 跳过开头的重置（连续实验用，调用方已经重置过）。 */
  skipReset?: boolean;
  /** 重置之后、第一条用例之前执行（例如临时关闭某条规则）。 */
  prepare?: () => void;
  /** 单条用例成本超过它就中止（美元）。 */
  maxCaseUsd?: number;
  /** 整次评测累计成本超过它就中止（美元）。 */
  maxTotalUsd?: number;
  log?: (line: string) => void;
}

export interface RunOutput {
  provider: "jev" | "llm" | "mock";
  results: CaseResult[];
  resetMs: number;
  resetEach: boolean;
  startedAt: string;
  finishedAt: string;
  aborted?: string;
}

const MAX_ATTEMPTS = 3;
const L3_PLACEHOLDER = "这个问题我需要再确认一下";

/** file：data/eval/ 下的用例文件名，默认 cases.json；留出集用 holdout.json（Claude 加，T09 审查）。 */
export function loadCases(file = "cases.json"): EvalCase[] {
  const raw = JSON.parse(readFileSync(join(process.cwd(), "data", "eval", file), "utf8")) as { cases: EvalCase[] };
  return raw.cases;
}

// ───────────────────────── 判定 ─────────────────────────

const asArray = <T>(v: T | T[]): T[] => (Array.isArray(v) ? v : [v]);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function describeExpect(c: EvalCase["expect"], checkTools: boolean): string {
  const parts = [`layer=${asArray(c.layer).join("|")}`];
  if (c.intent) parts.push(`intent=${c.intent}`);
  if (c.riskHit) parts.push(`riskHit=[${c.riskHit.join(",")}]`);
  if (c.handoff !== undefined) parts.push(`handoff=${c.handoff}`);
  if (checkTools && c.tools?.length) parts.push(`tools⊇[${c.tools.join(",")}]`);
  return parts.join(" ");
}

export function describeGot(g: CaseGot, checkTools: boolean): string {
  const layer = g.escalatedFrom ? `${g.layer}(来自${g.escalatedFrom})` : g.layer;
  const parts = [`layer=${layer}`];
  if (g.intent) parts.push(`intent=${g.intent}`);
  parts.push(`riskHit=[${g.riskHit.join(",")}]`, `handoff=${g.handoff}`);
  if (checkTools) parts.push(`tools=[${g.tools.join(",")}]`);
  if (g.ruleId) parts.push(`rule=${g.ruleId}`);
  return parts.join(" ");
}

function judge(c: EvalCase, got: CaseGot, checkTools: boolean): CaseResult["dims"] {
  const wantLayers = asArray(c.expect.layer);
  // 层级：最终 trace 的 layer 命中即可。例外：期望转人工，且 trace 是"某层接住后转人工"（layer=human，escalatedFrom=期望层）。
  const layer =
    wantLayers.includes(got.layer as Layer) ||
    (c.expect.handoff === true && got.layer === "human" && got.escalatedFrom !== undefined && wantLayers.includes(got.escalatedFrom));
  const dims: CaseResult["dims"] = { layer };
  if (c.expect.intent) dims.intent = got.intent === c.expect.intent;
  if (c.expect.riskHit) dims.risk = c.expect.riskHit.every((k) => got.riskHit.includes(k)) && (c.expect.riskHit.length > 0 || got.riskHit.length === 0);
  if (c.expect.handoff !== undefined) dims.handoff = got.handoff === c.expect.handoff;
  if (checkTools && c.expect.tools?.length) dims.tools = c.expect.tools.every((t) => got.tools.includes(t));
  return dims;
}

/** 通用的原因分类（不含任何针对单条用例的判断）。 */
function classifyFailure(c: EvalCase, got: CaseGot, dims: CaseResult["dims"], degradedFinal: boolean): FailureReason {
  if (got.layer === "none") return "无最终 trace";
  // 重试 3 次 Jev 仍超时 / 失败，最终由 llm 或 mock 回答：不是 Jev 的中文能力问题，单独标出来
  if (degradedFinal) return "分类器降级";
  const wantLayers = asArray(c.expect.layer);
  const wantsRisk = (c.expect.riskHit?.length ?? 0) > 0;
  // 期望 L3、而 L3 还是占位实现 → 依赖 T05
  if (wantLayers.length === 1 && wantLayers[0] === "L3" && got.l3Placeholder) return "依赖 T05";
  if (wantsRisk && dims.risk === false) return "风险漏判";
  if (!wantsRisk && got.layer === "risk_gate" && !wantLayers.includes("risk_gate")) return "风险误报";
  if (got.layer === "L1" && !wantLayers.includes("L1")) return "规则误吞";
  if (got.ruleId && dims.intent === false) return "规则误吞";
  if (dims.handoff === false && dims.layer && dims.intent !== false) return "转人工判断错";
  // 分类器自己的意图就不对 → 分类错
  if (c.expect.intent && got.classifierIntent && got.classifierIntent !== c.expect.intent) return "分类错";
  if (dims.intent === false) return "分类错";
  // 意图对了，但层级 / 工具不对：
  if (got.layer === "human" && !wantLayers.includes("human")) return "转人工判断错"; // handler 自己决定转人工，用例没有期望
  if (wantLayers.length === 1 && wantLayers[0] === "L3" && got.layer === "L2") return "多步没识别"; // 复合诉求被当成单意图
  if (got.layer === "L3" && wantLayers.includes("L2") && !wantLayers.includes("L3")) return "置信度不足"; // 意图对但低于阈值，落到 L3
  if (dims.layer === false || dims.tools === false) return "槽位没补全";
  return "分类错";
}

// ───────────────────────── 执行 ─────────────────────────

interface RawOutcome {
  conversationId: string;
  trace?: RouteTrace;
  responseMs: number;
  reply: string;
  l3Placeholder: boolean;
  costUsd: number;
}

async function send(c: EvalCase, conversationId: string | undefined, input: EvalInput): Promise<{ conversationId: string; buyerMessageId: string; ms: number }> {
  const started = Date.now();
  const result = await handleMessage({
    buyerId: c.buyerId,
    ...(conversationId ? { conversationId } : {}),
    ...(input.action ? { action: input.action } : { text: input.text }),
    context: c.setup?.context ?? {},
    debug: true,
  });
  const ms = Date.now() - started;
  await drainBackgroundTasks();
  return { conversationId: result.conversation.id, buyerMessageId: result.messages[0].id, ms };
}

async function runOnce(c: EvalCase): Promise<RawOutcome> {
  let conversationId: string | undefined;
  for (const prior of c.setup?.prior ?? []) conversationId = (await send(c, conversationId, prior)).conversationId;
  const last = await send(c, conversationId, c.input);
  const traces = listTraces({ conversationId: last.conversationId });
  const trace = traces.filter((t) => t.messageId === last.buyerMessageId).at(-1);
  const aiAfter = listMessages(last.conversationId, { after: last.buyerMessageId }).filter((m) => m.role !== "buyer");
  return {
    conversationId: last.conversationId,
    trace,
    responseMs: last.ms,
    reply: aiAfter.map((m) => m.text).join(" / "),
    l3Placeholder: aiAfter.some((m) => m.text.includes(L3_PLACEHOLDER)),
    costUsd: traces.reduce((sum, t) => sum + (t.cost?.totalUsd ?? 0), 0),
  };
}

export function buildGot(raw: RawOutcome): CaseGot {
  const t = raw.trace;
  const conv = getConversation(raw.conversationId);
  const top = t?.topIntents?.[0];
  return {
    layer: t?.layer ?? "none",
    escalatedFrom: t?.escalatedFrom,
    intent: t?.intent,
    classifierIntent: top?.id,
    classifierConfidence: top?.p,
    riskHit: t?.riskHit ?? [],
    riskScores: t?.riskScores,
    handoff: conv ? conv.mode === "human" || conv.status === "waiting_human" : false,
    tools: [...new Set((t?.toolCalls ?? []).map((x) => x.name))],
    ruleId: t?.ruleId,
    decideProvider: t?.decideProvider,
    l3Placeholder: raw.l3Placeholder && t?.layer === "L3",
  };
}

export async function runCases(cases: EvalCase[], opts: RunOptions): Promise<RunOutput> {
  const log = opts.log ?? (() => {});
  const startedAt = new Date().toISOString();
  process.env.CLASSIFIER_PROVIDER = opts.provider;
  const live = opts.provider !== "mock" && hasApiKey();
  const checkTools = live;
  const maxCase = opts.maxCaseUsd ?? 0.02;
  const maxTotal = opts.maxTotalUsd ?? 0.5;

  const t0 = Date.now();
  if (!opts.skipReset) await resetDemoData();
  const resetMs = opts.skipReset ? 0 : Date.now() - t0;
  const resetEach = opts.skipReset ? false : (opts.resetEach ?? resetMs < 10_000);
  if (!opts.skipReset) log(`重置演示数据耗时 ${(resetMs / 1000).toFixed(1)} 秒 → ${resetEach ? "每条用例前都重置" : "只在开始时重置一次（单次重置 ≥ 10 秒）"}`);
  opts.prepare?.();

  const selected = opts.only?.length ? cases.filter((c) => opts.only!.includes(c.id)) : cases;
  const results: CaseResult[] = [];
  let totalUsd = 0;
  let aborted: string | undefined;

  for (const [i, c] of selected.entries()) {
    if (resetEach && i > 0) {
      await resetDemoData();
      opts.prepare?.();
    }
    let raw: RawOutcome | undefined;
    let error: string | undefined;
    let retried = false;
    let attempts = 0;
    let degradedFirstAttempt = false;
    let degradedFinal = false;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      attempts = attempt + 1;
      try {
        raw = await runOnce(c);
        error = undefined;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        raw = undefined;
      }
      // 分类器被降级（429 / 超时 / 解析失败）→ 退避 3 秒、6 秒后最多重试 2 次，保证测的是模型而不是网络抖动；第一次降级会记录在报告里。
      const degraded = live && raw?.trace?.decideProvider !== undefined && raw.trace.decideProvider !== opts.provider;
      if (attempt === 0) degradedFirstAttempt = Boolean(degraded) || Boolean(error);
      degradedFinal = Boolean(degraded);
      if (!degraded && !error) break;
      if (attempt < MAX_ATTEMPTS - 1) {
        retried = true;
        await sleep(3000 * (attempt + 1));
      }
    }
    const caseText = c.input.text ?? (c.input.action ? `［动作 ${JSON.stringify(c.input.action)}］` : "");
    let result: CaseResult;
    if (!raw) {
      const got: CaseGot = { layer: "none", riskHit: [], handoff: false, tools: [], l3Placeholder: false };
      result = { id: c.id, buyerId: c.buyerId, text: caseText, expect: c.expect, got, dims: { layer: false }, pass: false, reason: "运行异常", latencyMs: 0, responseMs: 0, costUsd: 0, retried, attempts, degradedFirstAttempt, degradedFinal, replyPreview: "", error };
    } else {
      const got = buildGot(raw);
      const dims = judge(c, got, checkTools);
      const pass = Object.values(dims).every((v) => v !== false);
      result = {
        id: c.id, buyerId: c.buyerId, text: caseText, expect: c.expect, got, dims, pass,
        reason: pass ? undefined : classifyFailure(c, got, dims, degradedFinal),
        latencyMs: raw.trace?.latency.totalMs ?? raw.responseMs,
        responseMs: raw.responseMs,
        costUsd: raw.costUsd,
        retried, attempts, degradedFirstAttempt, degradedFinal,
        replyPreview: raw.reply.replace(/\s+/g, " ").slice(0, 120),
      };
    }
    results.push(result);
    totalUsd += result.costUsd;
    log(`${result.pass ? "✅" : "❌"} ${c.id} ${caseText.slice(0, 22).padEnd(22)} ${describeGot(result.got, false)} ${result.latencyMs}ms $${result.costUsd.toFixed(6)}${result.reason ? ` ← ${result.reason}` : ""}${retried ? `（尝试${attempts}次${degradedFinal ? "，仍降级" : ""}）` : ""}`);
    if (result.costUsd > maxCase) { aborted = `${c.id} 单条成本 $${result.costUsd.toFixed(4)} 超过 $${maxCase}，已中止，请先确认是否正常`; break; }
    if (totalUsd > maxTotal) { aborted = `累计成本 $${totalUsd.toFixed(4)} 超过 $${maxTotal}，已中止`; break; }
  }
  return { provider: opts.provider, results, resetMs, resetEach, startedAt, finishedAt: new Date().toISOString(), aborted };
}
