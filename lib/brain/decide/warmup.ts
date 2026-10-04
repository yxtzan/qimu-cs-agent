import { decisions, hasApiKey } from '../../llm/openrouter';
import { buildDecisionQuestions } from './questions';

// Measured on the server (2026-10-04): the 7-question set takes >15s the first time it is asked
// after a quiet spell, ~1s right after; a 1-question ping does NOT warm the 7-question path, and a
// 2-minute keepalive was too sparse (every keepalive was cold). So we:
//   - ping with the real question set, allowing up to 20s for a cold ping to finish,
//   - every JEV_KEEPALIVE_MS (default 60000), but only while someone used the site in the last
//     JEV_ACTIVE_WINDOW_MS (default 30 min) — no traffic, no pings, no cost,
//   - immediately when a visitor shows up after the warm path may have gone cold (noteJevActivity),
//   - once right after "reset demo data" finishes (warmJevNow, registered by warmup-hook.ts).
const DEFAULT_KEEPALIVE_MS = 60000;
const DEFAULT_ACTIVE_WINDOW_MS = 30 * 60 * 1000;
const PING_TIMEOUT_MS = 20000;
interface WarmupState { timer?: ReturnType<typeof setInterval>; busy: boolean; started: boolean; lastActivity: number; lastPingOk: number }
const globals = globalThis as unknown as { __qimuJevWarmup?: WarmupState };
const warmup = (): WarmupState => (globals.__qimuJevWarmup ??= { busy: false, started: false, lastActivity: 0, lastPingOk: 0 });

const jevActive = () => hasApiKey() && (process.env.CLASSIFIER_PROVIDER?.trim() || 'jev') === 'jev';
function envMs(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}
const keepaliveMs = () => envMs('JEV_KEEPALIVE_MS', DEFAULT_KEEPALIVE_MS);
const activeWindowMs = () => envMs('JEV_ACTIVE_WINDOW_MS', DEFAULT_ACTIVE_WINDOW_MS);

async function ping(reason: 'startup' | 'keepalive' | 'reset' | 'activity'): Promise<void> {
  const state = warmup();
  if (state.busy || !jevActive()) return;
  state.busy = true;
  try {
    const result = await decisions({ state: '买家：你好', questions: buildDecisionQuestions(), timeoutMs: PING_TIMEOUT_MS });
    state.lastPingOk = Date.now();
    console.info('[jev-warmup]', JSON.stringify({ reason, latencyMs: result.latencyMs, costUsd: result.costUsd, estimated: result.estimated }));
  } catch (error) {
    const kind = (error as { kind?: string } | null)?.kind;
    console.info('[jev-warmup]', JSON.stringify({ reason, error: error instanceof Error ? error.name : 'UnknownError', ...(kind ? { kind } : {}) }));
  } finally { state.busy = false; }
}

export function startJevWarmup(): void {
  const state = warmup();
  const interval = keepaliveMs();
  if (state.started || !jevActive() || interval <= 0) return;
  state.started = true;
  if (!state.lastActivity) state.lastActivity = Date.now();
  void ping('startup');
  state.timer = setInterval(() => {
    if (Date.now() - warmup().lastActivity > activeWindowMs()) return; // nobody around: let it go cold
    void ping('keepalive');
  }, interval);
  state.timer.unref();
}

/**
 * Call on any visitor activity (page load, chat message). Starts the keepalive if needed and, when
 * the last successful ping is older than one keepalive interval, warms Jev right away so the warm
 * path is ready by the time the visitor sends a message.
 */
export function noteJevActivity(): void {
  const state = warmup();
  state.lastActivity = Date.now();
  if (!state.started) { startJevWarmup(); return; }
  const interval = keepaliveMs();
  if (interval > 0 && Date.now() - state.lastPingOk > interval) void ping('activity');
}

/**
 * Warm Jev once, now. Does nothing without an API key, when the classifier is not Jev,
 * or when JEV_KEEPALIVE_MS=0 (warming switched off, e.g. in offline test scripts).
 */
export async function warmJevNow(): Promise<void> {
  if (!jevActive() || keepaliveMs() <= 0) return;
  warmup().lastActivity = Date.now();
  await ping('reset');
}
