import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const SID_COOKIE = 'qimu_sid';
export const validSid = (value: string | undefined): value is string => Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
export const publicDemo = () => process.env.PUBLIC_DEMO === '1';
export interface VisitorContext { sid: string; directory: string; generation: string }
interface State {
  storage: AsyncLocalStorage<VisitorContext | undefined>;
  initializing: Map<string, Promise<void>>;
  active: Map<string, number>;
  eviction: Set<(directory: string) => void>;
  roots: Set<string>;
  timer?: ReturnType<typeof setInterval>;
}
const globals = globalThis as unknown as { __qimuVisitors?: State };
const state: State = globals.__qimuVisitors ??= { storage: new AsyncLocalStorage(), initializing: new Map(), active: new Map(), eviction: new Set(), roots: new Set() };
export const sharedDirectory = () => join(process.cwd(), 'data', 'runtime');
export const visitorRoot = () => join(sharedDirectory(), 'visitors');
export const currentVisitor = () => publicDemo() ? state.storage.getStore() : undefined;
export const visitorNamespace = () => { const c = currentVisitor(); return c ? `${c.directory}:${c.generation}` : process.cwd(); };
export const withSharedStore = <T>(fn: () => T): T => state.storage.run(undefined, fn);
export const onVisitorEvicted = (fn: (directory: string) => void) => { state.eviction.add(fn); };
export function visitorIsCurrent(context = currentVisitor()): boolean {
  if (!context) return true;
  try { return readFileSync(join(context.directory, '.generation'), 'utf8') === context.generation; }
  catch { return false; }
}
export function newVisitorGeneration(directory: string): string {
  const generation = randomUUID();
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, '.generation'), generation);
  const current = currentVisitor();
  // Reset updates only the live request; already captured callbacks retain the old generation.
  if (current?.directory === directory) state.storage.enterWith({ ...current, generation });
  return generation;
}
function touch(directory: string, now: number): void {
  const file = join(directory, '.last-seen');
  if (!existsSync(file)) writeFileSync(file, '');
  utimesSync(file, now / 1000, now / 1000);
}
export function cleanupVisitors(now = Date.now(), root = visitorRoot()): number {
  if (!publicDemo() || !existsSync(root)) return 0;
  const entries = readdirSync(root).filter(validSid).flatMap(sid => {
    const directory = join(root, sid);
    if (!statSync(directory).isDirectory()) return [];
    const seen = join(directory, '.last-seen');
    return [{ directory, at: statSync(existsSync(seen) ? seen : directory).mtimeMs }];
  }).sort((a, b) => a.at - b.at);
  let count = entries.length, removed = 0;
  for (const entry of entries) {
    if ((state.active.get(entry.directory) ?? 0) > 0) continue;
    if (now - entry.at <= 24 * 3600_000 && count <= 500) continue;
    rmSync(entry.directory, { recursive: true, force: true });
    for (const evict of state.eviction) evict(entry.directory);
    count--; removed++;
  }
  return removed;
}
function startCleanup(): void {
  const root = visitorRoot();
  if (!state.roots.has(root)) { state.roots.add(root); cleanupVisitors(Date.now(), root); }
  if (!state.timer) {
    state.timer = setInterval(() => { for (const directory of state.roots) cleanupVisitors(Date.now(), directory); }, 3600_000);
    state.timer.unref();
  }
}
function retain(directory: string): () => void {
  state.active.set(directory, (state.active.get(directory) ?? 0) + 1);
  return () => { const n = (state.active.get(directory) ?? 1) - 1; if (n) state.active.set(directory, n); else state.active.delete(directory); };
}
/** Bind before enqueuing, not after the previous visitor's promise resolves. */
export function bindVisitor<T>(fn: () => Promise<T>): () => Promise<T | undefined> {
  const captured = currentVisitor();
  if (!captured) return fn;
  const release = retain(captured.directory);
  return async () => {
    try { return await state.storage.run(captured, () => visitorIsCurrent(captured) ? fn() : undefined); }
    finally { release(); }
  };
}
export async function runVisitor<T>(sid: string, initialize: () => Promise<void>, fn: () => Promise<T>): Promise<T> {
  if (!publicDemo()) return fn();
  if (!validSid(sid)) throw new Error('Invalid visitor identifier');
  startCleanup();
  const directory = join(visitorRoot(), sid);
  const release = retain(directory);
  try {
    let pending = state.initializing.get(directory);
    if (!existsSync(join(directory, '.generation')) && !pending) {
      const context = { sid, directory, generation: newVisitorGeneration(directory) };
      pending = state.storage.run(context, initialize);
      state.initializing.set(directory, pending);
      void pending.catch(() => { rmSync(directory, { recursive: true, force: true }); }).finally(() => state.initializing.delete(directory));
    }
    if (pending) await pending;
    const context = { sid, directory, generation: readFileSync(join(directory, '.generation'), 'utf8') };
    touch(directory, Date.now());
    cleanupVisitors();
    return await state.storage.run(context, fn);
  } finally { release(); }
}

if (publicDemo()) startCleanup();
