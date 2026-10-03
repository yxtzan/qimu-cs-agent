import type { DecideResult } from "../../types";
import { hasApiKey, NoApiKeyError } from "../../llm/openrouter";
import { decideWithJev } from "./jev";
import { decideWithLlm } from "./llm";
import { decideWithMock } from "./mock";

export interface DecideOptions {
  provider?: "jev" | "llm" | "mock";
  jevModel?: string;
  llmModel?: string;
  timeoutMs?: number;
}

const DEFAULT_DECIDE_BUDGET_MS = 9000;
const BUDGET_SAFETY_MARGIN_MS = 25;

function decideBudgetMs(): number {
  const value = Number(process.env.DECIDE_BUDGET_MS ?? DEFAULT_DECIDE_BUDGET_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_DECIDE_BUDGET_MS;
}

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

export async function decide(stateForModel: unknown, message: string, opts: DecideOptions = {}): Promise<DecideResult> {
  const requested = opts.provider ?? (process.env.CLASSIFIER_PROVIDER?.trim() as DecideOptions["provider"]) ?? "jev";
  if (requested === "mock") return decideWithMock(message);
  const errors: string[] = [];
  const deadlineMs = Date.now() + decideBudgetMs();
  const remainingTimeoutMs = (): number => Math.max(0, deadlineMs - Date.now() - BUDGET_SAFETY_MARGIN_MS);
  if (!hasApiKey()) {
    errors.push("OPENROUTER_API_KEY is not set");
  } else {
    if (requested === "jev" && remainingTimeoutMs() > 0) {
      try {
        const result = await decideWithJev({ stateForModel, message, model: opts.jevModel, timeoutMs: opts.timeoutMs, deadlineMs });
        return result;
      } catch (error) { errors.push(`jev failed: ${errorText(error)}`); }
    } else if (requested === "jev") {
      errors.push("jev skipped: classifier decision budget exceeded");
    }
    if (remainingTimeoutMs() > 0) {
      try {
        const result = await decideWithLlm({ stateForModel, message, model: opts.llmModel, timeoutMs: opts.timeoutMs, deadlineMs });
        return { ...result, error: errors.length ? errors.join("; ") : undefined };
      } catch (error) { errors.push(`llm failed: ${errorText(error)}`); }
    } else {
      errors.push("llm skipped: classifier decision budget exceeded");
    }
  }
  const result = decideWithMock(message);
  return { ...result, error: errors.length ? errors.join("; ") : undefined };
}

export { decideWithJev } from "./jev";
export { decideWithLlm } from "./llm";
export { decideWithMock } from "./mock";
export { INTENTS, INTENT_CRITERIA, RISK_QUESTIONS, EMOTION_QUESTION, buildDecisionQuestions } from "./questions";
export type { DecideResult } from "../../types";
export { NoApiKeyError };
