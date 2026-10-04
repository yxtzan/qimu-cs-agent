import { decisions, hasApiKey } from '../../llm/openrouter';

// Jev answers in ~0.4s when warm but ~6s when cold (T01b), so we ping it:
//   - every JEV_KEEPALIVE_MS (default 120000) while the server runs (startJevWarmup),
//   - once right after "reset demo data" finishes (warmJevNow, registered by warmup-hook.ts).
const DEFAULT_KEEPALIVE_MS = 120000;
interface WarmupState { timer?: ReturnType<typeof setInterval>; busy: boolean; started: boolean }
const globals = globalThis as unknown as { __qimuJevWarmup?: WarmupState };
const warmup = (): WarmupState => (globals.__qimuJevWarmup ??= { busy: false, started: false });

const jevActive = () => hasApiKey() && (process.env.CLASSIFIER_PROVIDER?.trim() || 'jev') === 'jev';
function keepaliveMs(): number {
  const interval = Number(process.env.JEV_KEEPALIVE_MS ?? DEFAULT_KEEPALIVE_MS);
  return Number.isFinite(interval) ? interval : DEFAULT_KEEPALIVE_MS;
}

async function ping(reason: 'startup' | 'keepalive' | 'reset'): Promise<void> {
  const state = warmup();
  if (state.busy || !jevActive()) return;
  state.busy = true;
  try {
    const result = await decisions({ state: '你好', questions: { warm: { type: 'choice', instructions: '是否是问候？', criteria: { greeting: '问候', other: '其他' } } }, timeoutMs: 8000 });
    console.info('[jev-warmup]', JSON.stringify({ reason, latencyMs: result.latencyMs, costUsd: result.costUsd, estimated: result.estimated }));
  } catch (error) { console.info('[jev-warmup]', JSON.stringify({ reason, error: error instanceof Error ? error.name : 'UnknownError' })); }
  finally { state.busy = false; }
}

export function startJevWarmup(): void {
  const state = warmup();
  const interval = keepaliveMs();
  if (state.started || !jevActive() || interval <= 0) return;
  state.started = true;
  void ping('startup');
  state.timer = setInterval(() => { void ping('keepalive'); }, interval);
  state.timer.unref();
}

/**
 * Warm Jev once, now. Does nothing without an API key, when the classifier is not Jev,
 * or when JEV_KEEPALIVE_MS=0 (warming switched off, e.g. in offline test scripts).
 */
export async function warmJevNow(): Promise<void> {
  if (!jevActive() || keepaliveMs() <= 0) return;
  await ping('reset');
}
