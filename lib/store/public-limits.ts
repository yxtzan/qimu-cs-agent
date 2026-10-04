import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RouteTrace } from '../types';
import { verifiedPeer } from './public-peer';
import { currentVisitor, publicDemo, sharedDirectory, visitorIsCurrent, visitorNamespace } from './visitor-context';

export const BUDGET_NOTICE = '演示额度今日已用完，以下为简化模式';
const DAY = 86400_000;
export const beijingDay = (now = Date.now()) => new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
interface Counter { day: string; count: number; recent?: number[] }
interface Ledger { day: string; tracesUsd: number; transportUsd: number; traces: Record<string, number>; visitors: Record<string, Counter>; ips: Record<string, Counter> }
const globals = globalThis as unknown as { __qimuPublicLedgers?: Map<string, Ledger>; __qimuPublicFetch?: typeof fetch };
const ledgers = globals.__qimuPublicLedgers ??= new Map();
function ledger(now: number): Ledger {
  const directory = sharedDirectory(), day = beijingDay(now);
  let value = ledgers.get(directory);
  if (!value) {
    const file = join(directory, 'public-demo-limits.json');
    if (existsSync(file)) value = JSON.parse(readFileSync(file, 'utf8')) as Ledger;
  }
  if (!value || value.day !== day) {
    const previous = value;
    const visitors: Record<string, Counter> = {};
    for (const [sid, counter] of Object.entries<Counter>(previous?.visitors ?? {})) {
      const recent = (counter.recent ?? []).filter(at => now - at < 3600_000 && at <= now);
      if (recent.length) visitors[sid] = { day, count: 0, recent };
    }
    // Keep per-trace high water marks: rewriting yesterday's collection must not charge yesterday twice.
    value = { day, tracesUsd: 0, transportUsd: 0, traces: previous?.traces ?? {}, visitors, ips: {} };
  }
  ledgers.set(directory, value);
  return value;
}
function save(value: Ledger): void {
  const directory = sharedDirectory();
  mkdirSync(directory, { recursive: true });
  const file = join(directory, 'public-demo-limits.json');
  writeFileSync(`${file}.tmp`, JSON.stringify(value));
  renameSync(`${file}.tmp`, file);
}
export function publicBudget(now = Date.now()) {
  const n = Number(process.env.DAILY_BUDGET_USD ?? '1');
  const limitUsd = Number.isFinite(n) && n >= 0 ? n : 1;
  if (!publicDemo()) return { exhausted: false, spentUsd: 0, limitUsd };
  const value = ledger(now), spentUsd = Math.max(value.tracesUsd, value.transportUsd);
  return { exhausted: spentUsd >= limitUsd, spentUsd, limitUsd };
}
export function consumeChat(sid: string, ip: string, now = Date.now()): string | undefined {
  if (!publicDemo()) return;
  const value = ledger(now);
  // Rolling hour window; day resets at Beijing midnight. Reset never clears the IP bucket.
  const visitor = value.visitors[sid] ?? { day: value.day, count: 0, recent: [] };
  visitor.recent = (visitor.recent ?? []).filter(at => now - at < 3600_000);
  const key = createHash('sha256').update(ip).digest('hex');
  const address = value.ips[key] ?? { day: value.day, count: 0 };
  if (visitor.recent.length >= 40) return '体验太频繁啦，每小时最多发送 40 条消息，请稍后再试。';
  if (visitor.count >= 150) return '今天已体验 150 条消息，请明天再来。';
  if (address.count >= 400) return '这个网络今天已达到 400 条演示消息，请明天再来。';
  visitor.count++; visitor.recent.push(now); address.count++;
  value.visitors[sid] = visitor; value.ips[key] = address; save(value);
}
export function recordTraceCosts(traces: RouteTrace[], now = Date.now()): void {
  if (!publicDemo() || !currentVisitor() || !visitorIsCurrent()) return;
  const value = ledger(now), namespace = visitorNamespace();
  for (const trace of traces) {
    if (trace.isSimulated) continue;
    const cost = trace.cost.totalUsd;
    if (!Number.isFinite(cost) || cost < 0) continue;
    const key = `${namespace}:${trace.id}`, before = value.traces[key] ?? 0;
    if (cost > before) { value.tracesUsd += cost - before; value.traces[key] = cost; }
  }
  save(value);
}
export function recordTransportCost(cost: number, now = Date.now()): void {
  if (!publicDemo() || !Number.isFinite(cost) || cost <= 0) return;
  const value = ledger(now); value.transportUsd += cost; save(value);
}
export function clientAddress(headers: Headers): string {
  const peer = verifiedPeer(headers);
  if (peer) return peer;
  // Development/raw next start has no socket access: fail conservatively unless behind a trusted proxy.
  if (process.env.PUBLIC_DEMO_TRUST_PROXY !== '1') return 'direct';
  return headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || 'direct';
}
/** Protect every model path without changing business code or process.env. */
export function installPublicModelGuard(): void {
  if (!publicDemo() || globals.__qimuPublicFetch) return;
  const original = globalThis.fetch;
  globals.__qimuPublicFetch = original;
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const base = (process.env.OPENROUTER_API_BASE?.trim() || 'https://openrouter.ai/api').replace(/\/+$/, '');
    if (!publicDemo() || !url.startsWith(`${base}/`)) return original(input, init);
    if (!visitorIsCurrent() || publicBudget().exhausted) throw new Error(BUDGET_NOTICE);
    const response = await original(input, init);
    // Charge immediately, before a late trace/summary finishes; account for warmup and standalone RAG too.
    let usage: { cost?: number; prompt_tokens?: number; total_tokens?: number; completion_tokens?: number } | undefined;
    try { usage = (await response.clone().json()).usage; }
    catch { /* A non-JSON upstream response is handled by the existing model client. */ }
    if (usage) {
      const estimate = url.endsWith('/embeddings') ? (usage.prompt_tokens ?? usage.total_tokens ?? 0) * 0.02 / 1e6
        : ((usage.prompt_tokens ?? 0) * 0.3 + (usage.completion_tokens ?? 0)) / 1e6;
      recordTransportCost(typeof usage.cost === 'number' ? usage.cost : estimate);
    }
    return response;
  };
}
export const nextBudgetReset = (now = Date.now()) => new Date(Math.floor((now + 8 * 3600_000) / DAY) * DAY + DAY - 8 * 3600_000).toISOString();
