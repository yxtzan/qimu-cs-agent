import { decisions, hasApiKey } from '../../llm/openrouter';
const state = globalThis as unknown as { __qimuJevWarmup?: { timer?: ReturnType<typeof setInterval>; busy: boolean } };
export function startJevWarmup(): void {
  if (state.__qimuJevWarmup || !hasApiKey() || (process.env.CLASSIFIER_PROVIDER?.trim() || 'jev') !== 'jev') return;
  const interval = Number(process.env.JEV_KEEPALIVE_MS ?? 240000);
  if (!Number.isFinite(interval) || interval <= 0) return;
  const warmup = state.__qimuJevWarmup = { busy: false } as { timer?: ReturnType<typeof setInterval>; busy: boolean };
  const ping = async () => {
    if (warmup.busy || !hasApiKey() || (process.env.CLASSIFIER_PROVIDER?.trim() || 'jev') !== 'jev') return;
    warmup.busy = true;
    try {
      const result = await decisions({ state: '你好', questions: { warm: { type: 'choice', instructions: '是否是问候？', criteria: { greeting: '问候', other: '其他' } } }, timeoutMs: 8000 });
      console.info('[jev-warmup]', JSON.stringify({ latencyMs: result.latencyMs, costUsd: result.costUsd, estimated: result.estimated }));
    } catch (error) { console.info('[jev-warmup]', JSON.stringify({ error: error instanceof Error ? error.name : 'UnknownError' })); }
    finally { warmup.busy = false; }
  };
  void ping();
  warmup.timer = setInterval(() => { void ping(); }, interval);
  warmup.timer.unref();
}
