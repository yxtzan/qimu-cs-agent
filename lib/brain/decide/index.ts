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

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

export async function decide(stateForModel: unknown, message: string, opts: DecideOptions = {}): Promise<DecideResult> {
  const requested = opts.provider ?? (process.env.CLASSIFIER_PROVIDER?.trim() as DecideOptions["provider"]) ?? "jev";
  if (requested === "mock") return decideWithMock(message);
  const errors: string[] = [];
  if (!hasApiKey()) {
    errors.push("OPENROUTER_API_KEY is not set");
  } else {
    if (requested === "jev") {
      try {
        const result = await decideWithJev({ stateForModel, message, model: opts.jevModel, timeoutMs: opts.timeoutMs });
        return result;
      } catch (error) { errors.push(`jev failed: ${errorText(error)}`); }
    }
    try {
      const result = await decideWithLlm({ stateForModel, message, model: opts.llmModel, timeoutMs: opts.timeoutMs });
      return { ...result, error: errors.length ? errors.join("; ") : undefined };
    } catch (error) { errors.push(`llm failed: ${errorText(error)}`); }
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
