import type { DecideResult, IntentId } from "../../types";
import { chatCompletion } from "../../llm/openrouter";
import { with429Retry, withClassifierSlot } from "./limits";
import { buildDecisionQuestions, INTENT_CRITERIA, INTENT_IDS } from "./questions";
import type { LlmMessage } from "../../llm/openrouter";

export interface LlmInput { stateForModel: unknown; message: string; model?: string; timeoutMs?: number }

function numberInRange(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function parseJson(content: string): Record<string, unknown> {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed: unknown = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("classifier returned non-object JSON");
  return parsed as Record<string, unknown>;
}

function parseOutput(content: string): DecideResult {
  const raw = parseJson(content);
  const rawIntent = raw.intent && typeof raw.intent === "object" ? raw.intent as Record<string, unknown> : {};
  const candidate = typeof rawIntent.id === "string" ? rawIntent.id : typeof raw.intent === "string" ? raw.intent : "other";
  const id = INTENT_IDS.has(candidate as IntentId) ? candidate as IntentId : "other";
  const rawProbabilities = rawIntent.probabilities && typeof rawIntent.probabilities === "object" ? rawIntent.probabilities as Record<string, unknown> : {};
  const probabilities: Partial<Record<IntentId, number>> = {};
  for (const [key, value] of Object.entries(rawProbabilities)) if (INTENT_IDS.has(key as IntentId)) probabilities[key as IntentId] = numberInRange(value, 0, 1, 0);
  probabilities[id] ??= numberInRange(rawIntent.confidence, 0, 1, 0);
  const rawRisk = raw.risk && typeof raw.risk === "object" ? raw.risk as Record<string, unknown> : {};
  const rawEmotion = rawRisk.emotion && typeof rawRisk.emotion === "object" ? rawRisk.emotion as Record<string, unknown> : {};
  return {
    provider: "llm",
    intent: { id, confidence: numberInRange(rawIntent.confidence, 0, 1, probabilities[id] ?? 0), probabilities },
    multiStep: numberInRange(raw.multiStep, 0, 1, 0),
    risk: {
      legal_threat: numberInRange(rawRisk.legal_threat, 0, 1, 0),
      health_safety: numberInRange(rawRisk.health_safety, 0, 1, 0),
      fraud_security: numberInRange(rawRisk.fraud_security, 0, 1, 0),
      abuse_extreme: numberInRange(rawRisk.abuse_extreme, 0, 1, 0),
      emotion: { score: numberInRange(rawEmotion.score, 0, 3, 0), confidence: numberInRange(rawEmotion.confidence, 0, 1, 0) },
    },
    latencyMs: 0,
    costUsd: 0,
  };
}

function stateText(stateForModel: unknown, message: string): string {
  const state = stateForModel === undefined ? "无" : JSON.stringify(stateForModel, null, 2);
  return `状态：${state}\n新消息：${message}`;
}

export async function decideWithLlm(input: LlmInput): Promise<DecideResult> {
  const questions = buildDecisionQuestions();
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      intent: { type: "object", properties: { id: { type: "string", enum: Object.keys(INTENT_CRITERIA) }, confidence: { type: "number" }, probabilities: { type: "object" } }, required: ["id", "confidence", "probabilities"] },
      multiStep: { type: "number" },
      risk: { type: "object", properties: { legal_threat: { type: "number" }, health_safety: { type: "number" }, fraud_security: { type: "number" }, abuse_extreme: { type: "number" }, emotion: { type: "object", properties: { score: { type: "number" }, confidence: { type: "number" } }, required: ["score", "confidence"] } }, required: ["legal_threat", "health_safety", "fraud_security", "abuse_extreme", "emotion"] },
    },
    required: ["intent", "multiStep", "risk"],
  };
  const messages: LlmMessage[] = [
    { role: "system", content: `你是栖木女装客服的意图与风险分类器。只输出 JSON，不要解释。意图必须互斥，只选一个；风险分数为 0 到 1，情绪 score 为 0 到 3。\n意图表：${JSON.stringify(INTENT_CRITERIA)}\n风险问题：${JSON.stringify(questions)}` },
    { role: "user", content: stateText(input.stateForModel, input.message) },
  ];
  const result = await withClassifierSlot(() => with429Retry(() => chatCompletion({ model: input.model, messages, responseFormat: { type: "json_schema", json_schema: { name: "decide_result", strict: true, schema } }, temperature: 0, maxTokens: 700, timeoutMs: input.timeoutMs })));
  const parsed = parseOutput(result.data.content);
  return { ...parsed, latencyMs: result.latencyMs, costUsd: result.costUsd };
}
