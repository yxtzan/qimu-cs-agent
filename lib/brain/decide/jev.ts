import type { DecideResult, IntentId } from "../../types";
import { decisions, type DecisionAnswer } from "../../llm/openrouter";
import { buildDecisionQuestions, INTENT_IDS } from "./questions";
import { with429Retry, withClassifierSlot } from "./limits";

export interface JevInput {
  stateForModel: unknown;
  message: string;
  model?: string;
  timeoutMs?: number;
}

function modelState(stateForModel: unknown, message: string): Record<string, unknown> {
  if (stateForModel && typeof stateForModel === "object" && !Array.isArray(stateForModel)) {
    return { ...(stateForModel as Record<string, unknown>), 新消息: message };
  }
  return { 状态: stateForModel ?? "无", 新消息: message };
}

function numberInRange(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function parseChoice(answer: DecisionAnswer | undefined): DecideResult["intent"] {
  if (!answer || answer.type !== "choice") {
    return { id: "other", confidence: 0, probabilities: { other: 1 } };
  }
  const id = INTENT_IDS.has(answer.choice as IntentId) ? (answer.choice as IntentId) : "other";
  const probabilities: Partial<Record<IntentId, number>> = {};
  for (const [key, value] of Object.entries(answer.probabilities ?? {})) {
    if (INTENT_IDS.has(key as IntentId)) probabilities[key as IntentId] = numberInRange(value, 0, 1, 0);
  }
  if (!probabilities[id]) probabilities[id] = 0;
  return { id, confidence: numberInRange(answer.confidence, 0, 1, probabilities[id] ?? 0), probabilities };
}

function noul(answers: Record<string, DecisionAnswer>, key: string): number {
  const answer = answers[key];
  return answer?.type === "noul" ? numberInRange(answer.noul, 0, 1, 0) : 0;
}

function emotion(answers: Record<string, DecisionAnswer>): { score: number; confidence: number } {
  const answer = answers.emotion;
  return answer?.type === "score"
    ? { score: numberInRange(answer.score, 0, 3, 0), confidence: numberInRange(answer.confidence, 0, 1, 0) }
    : { score: 0, confidence: 0 };
}

export async function decideWithJev(input: JevInput): Promise<DecideResult> {
  const result = await withClassifierSlot(() =>
    with429Retry(() =>
      decisions({
        model: input.model,
        state: modelState(input.stateForModel, input.message),
        questions: buildDecisionQuestions(),
        timeoutMs: input.timeoutMs,
      }),
    ),
  );
  const answers = result.data.answers;
  return {
    provider: "jev",
    intent: parseChoice(answers.intent),
    multiStep: noul(answers, "multi_step"),
    risk: {
      legal_threat: noul(answers, "legal_threat"),
      health_safety: noul(answers, "health_safety"),
      fraud_security: noul(answers, "fraud_security"),
      abuse_extreme: noul(answers, "abuse_extreme"),
      emotion: emotion(answers),
    },
    latencyMs: result.latencyMs,
    costUsd: result.costUsd,
  };
}

export function jevRequestForSample(stateForModel: unknown, message: string, model?: string) {
  return {
    model: model?.trim() || process.env.JEV_MODEL?.trim() || "typesafe/jev-1.13",
    state: modelState(stateForModel, message),
    questions: buildDecisionQuestions(),
  };
}
