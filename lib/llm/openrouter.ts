/**
 * Thin OpenRouter client used by the whole backend.
 *
 * Three entry points: chatCompletion(), embed(), decisions().
 * All of them:
 *   - read the key from env OPENROUTER_API_KEY (never hard-coded, never logged)
 *   - time out after 8s by default (override with `timeoutMs`)
 *   - return `{ data, latencyMs, costUsd, estimated }`
 *   - throw NoApiKeyError when no key is configured (callers fall back to mock)
 */

export const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_API_BASE = "https://openrouter.ai/api";

// ───────────────────────── errors & result type ─────────────────────────

/** Thrown when OPENROUTER_API_KEY is missing. Callers should degrade to mock mode. */
export class NoApiKeyError extends Error {
  constructor() {
    super("OPENROUTER_API_KEY is not set");
    this.name = "NoApiKeyError";
  }
}

/** Thrown on timeout, network failure or non-2xx response. */
export class OpenRouterError extends Error {
  constructor(
    message: string,
    public readonly kind: "timeout" | "network" | "http" | "parse",
    public readonly status?: number,
  ) {
    super(message);
    this.name = "OpenRouterError";
  }
}

export interface LlmResult<T> {
  data: T;
  latencyMs: number;
  /** Cost in USD. Uses OpenRouter `usage.cost`; falls back to a token-based estimate. */
  costUsd: number;
  /** true when costUsd is our own estimate rather than the value OpenRouter reported. */
  estimated: boolean;
}

export function hasApiKey(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

function requireKey(): string {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new NoApiKeyError();
  return key;
}

function apiBase(): string {
  return (process.env.OPENROUTER_API_BASE?.trim() || DEFAULT_API_BASE).replace(/\/+$/, "");
}

function requireModel(explicit: string | undefined, envName: string): string {
  const model = explicit?.trim() || process.env[envName]?.trim();
  if (!model) throw new Error(`No model configured: pass \`model\` or set ${envName}`);
  return model;
}

async function postJson(
  path: string,
  body: unknown,
  timeoutMs: number,
): Promise<{ json: unknown; latencyMs: number }> {
  const key = requireKey();
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiBase()}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "X-Title": "QIMU CS Agent",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      throw new OpenRouterError(
        `OpenRouter ${path} returned HTTP ${res.status}: ${text.slice(0, 300)}`,
        "http",
        res.status,
      );
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new OpenRouterError(`OpenRouter ${path} returned non-JSON body`, "parse", res.status);
    }
    return { json, latencyMs };
  } catch (err) {
    if (err instanceof OpenRouterError) throw err;
    if (controller.signal.aborted) {
      throw new OpenRouterError(`OpenRouter ${path} timed out after ${timeoutMs}ms`, "timeout");
    }
    throw new OpenRouterError(
      `OpenRouter ${path} request failed: ${err instanceof Error ? err.message : String(err)}`,
      "network",
    );
  } finally {
    clearTimeout(timer);
  }
}

// Rough fallback prices (USD per 1M tokens) used only when the API omits usage.cost.
const FALLBACK_PRICE = { promptPerM: 0.3, completionPerM: 1.0, embeddingPerM: 0.02 };

// ───────────────────────── chatCompletion ─────────────────────────

export interface LlmToolCall {
  id: string;
  name: string;
  /** Raw JSON string produced by the model. */
  arguments: string;
}

export interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  reasoning?: unknown;
  reasoning_details?: unknown;
  tool_call_id?: string;
  name?: string;
}

export interface LlmTool {
  type: "function";
  function: {
    name: string;
    description: string;
    /** JSON Schema object. */
    parameters: Record<string, unknown>;
  };
}

export type ResponseFormat =
  | { type: "json_object" }
  | {
      type: "json_schema";
      json_schema: { name: string; strict?: boolean; schema: Record<string, unknown> };
    };

export interface ChatCompletionParams {
  /** Defaults to env GENERATION_MODEL. */
  model?: string;
  messages: LlmMessage[];
  tools?: LlmTool[];
  toolChoice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } };
  responseFormat?: ResponseFormat;
  temperature?: number;
  maxTokens?: number;
  /** Passed through as OpenRouter `reasoning` (e.g. `{ enabled: false }` to skip thinking). */
  reasoning?: Record<string, unknown>;
  /** Optional OpenRouter provider routing preferences (e.g. { sort: "latency" }). */
  provider?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface ChatCompletionData {
  /** Assistant text (empty string if the model only produced tool calls). */
  content: string;
  toolCalls: LlmToolCall[];
  finishReason: string | null;
  model: string;
  /** The assistant message, ready to append to `messages` for the next tool-calling round. */
  message: LlmMessage;
  usage: { promptTokens: number; completionTokens: number };
  /** Raw reasoning fields when a provider returns them; absent when reasoning is disabled. */
  reasoning?: unknown;
  reasoningDetails?: unknown;
}

interface RawUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  cost?: number;
}

function defaultReasoning(): Record<string, unknown> | undefined {
  const setting = process.env.LLM_REASONING?.trim().toLowerCase();
  return setting === "on" ? { enabled: true } : { enabled: false };
}

export async function chatCompletion(
  params: ChatCompletionParams,
): Promise<LlmResult<ChatCompletionData>> {
  requireKey(); // fail fast, before building anything
  const model = requireModel(params.model, "GENERATION_MODEL");

  const body: Record<string, unknown> = {
    model,
    messages: params.messages,
    usage: { include: true },
  };
  if (params.tools?.length) body.tools = params.tools;
  if (params.toolChoice) body.tool_choice = params.toolChoice;
  if (params.responseFormat) body.response_format = params.responseFormat;
  if (params.temperature !== undefined) body.temperature = params.temperature;
  if (params.maxTokens !== undefined) body.max_tokens = params.maxTokens;
  const reasoning = params.reasoning ?? defaultReasoning();
  if (reasoning) body.reasoning = reasoning;
  if (params.provider) body.provider = params.provider;

  const { json, latencyMs } = await postJson(
    "/v1/chat/completions",
    body,
    params.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  const res = json as {
    model?: string;
    choices?: {
      finish_reason?: string | null;
      message?: {
        content?: string | null;
        tool_calls?: { id: string; function: { name: string; arguments: string } }[];
        reasoning?: unknown;
        reasoning_details?: unknown;
      };
    }[];
    usage?: RawUsage;
    error?: { message?: string };
  };
  const choice = res.choices?.[0];
  if (!choice?.message) {
    throw new OpenRouterError(
      `OpenRouter chat/completions returned no choices${res.error?.message ? `: ${res.error.message}` : ""}`,
      "parse",
    );
  }

  const toolCalls: LlmToolCall[] = (choice.message.tool_calls ?? []).map((c) => ({
    id: c.id,
    name: c.function.name,
    arguments: c.function.arguments,
  }));
  const content = choice.message.content ?? "";
  const promptTokens = res.usage?.prompt_tokens ?? 0;
  const completionTokens = res.usage?.completion_tokens ?? 0;

  const reported = res.usage?.cost;
  const estimated = typeof reported !== "number";
  const costUsd = estimated
    ? (promptTokens * FALLBACK_PRICE.promptPerM + completionTokens * FALLBACK_PRICE.completionPerM) /
      1e6
    : reported;

  return {
    data: {
      content,
      toolCalls,
      finishReason: choice.finish_reason ?? null,
      model: res.model ?? model,
      message: {
        role: "assistant",
        content: choice.message.content ?? null,
        ...(choice.message.tool_calls?.length
          ? {
              tool_calls: choice.message.tool_calls.map((c) => ({
                id: c.id,
                type: "function" as const,
                function: c.function,
              })),
            }
          : {}),
      },
      usage: { promptTokens, completionTokens },
      reasoning: choice.message.reasoning,
      reasoningDetails: choice.message.reasoning_details,
    },
    latencyMs,
    costUsd,
    estimated,
  };
}

// ───────────────────────── embed ─────────────────────────

export interface EmbedParams {
  /** Defaults to env EMBEDDING_MODEL. */
  model?: string;
  input: string[];
  timeoutMs?: number;
}

export async function embed(params: EmbedParams): Promise<LlmResult<number[][]>> {
  requireKey();
  const model = requireModel(params.model, "EMBEDDING_MODEL");
  const { json, latencyMs } = await postJson(
    "/v1/embeddings",
    { model, input: params.input, usage: { include: true } },
    params.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  const res = json as {
    data?: { index: number; embedding: number[] }[];
    usage?: RawUsage & { total_tokens?: number };
  };
  if (!res.data?.length) {
    throw new OpenRouterError("OpenRouter embeddings returned no data", "parse");
  }
  const vectors = [...res.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
  const reported = res.usage?.cost;
  const estimated = typeof reported !== "number";
  const tokens = res.usage?.prompt_tokens ?? res.usage?.total_tokens ?? 0;
  const costUsd = estimated ? (tokens * FALLBACK_PRICE.embeddingPerM) / 1e6 : reported;
  return { data: vectors, latencyMs, costUsd, estimated };
}

// ───────────────────────── decisions (Jev) ─────────────────────────

export type DecisionQuestion =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "noul"; instructions: string; criteria?: { true: string; false: string } }
  | { type: "score"; instructions: string; criteria: string[] };

export type DecisionAnswer =
  | {
      type: "choice";
      choice: string;
      confidence: number;
      probabilities: Record<string, number>;
    }
  | { type: "noul"; noul: number }
  | {
      type: "score";
      score: number;
      confidence: number;
      probabilities: Record<string, number>;
      legend?: Record<string, string>;
    };

export interface DecisionsParams {
  /** Defaults to env JEV_MODEL, then `typesafe/jev-1.13`. */
  model?: string;
  /** The content to evaluate: a string, or a JSON object/array of related context. */
  state: string | Record<string, unknown> | unknown[];
  questions: Record<string, DecisionQuestion>;
  timeoutMs?: number;
}

export interface DecisionsData {
  answers: Record<string, DecisionAnswer>;
  model: string;
  id?: string;
  usage: { inputTokens: number; outputTokens: number };
}

export const DEFAULT_JEV_MODEL = "typesafe/jev-1.13";

export async function decisions(params: DecisionsParams): Promise<LlmResult<DecisionsData>> {
  requireKey();
  const model = params.model?.trim() || process.env.JEV_MODEL?.trim() || DEFAULT_JEV_MODEL;
  const { json, latencyMs } = await postJson(
    "/alpha/decisions",
    { model, state: params.state, questions: params.questions },
    params.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  const res = json as {
    id?: string;
    model?: string;
    answers?: Record<string, DecisionAnswer>;
    usage?: { input_tokens?: number; output_tokens?: number; cost?: number };
  };
  if (!res.answers) {
    throw new OpenRouterError("OpenRouter decisions returned no answers", "parse");
  }
  const reported = res.usage?.cost;
  const estimated = typeof reported !== "number";
  // Jev bills input tokens only; no reliable list price is exposed, so mark estimate as ~0.
  const costUsd = estimated ? 0 : reported;
  return {
    data: {
      answers: res.answers,
      model: res.model ?? model,
      id: res.id,
      usage: {
        inputTokens: res.usage?.input_tokens ?? 0,
        outputTokens: res.usage?.output_tokens ?? 0,
      },
    },
    latencyMs,
    costUsd,
    estimated,
  };
}
