/**
 * Generic JSON store.
 *
 *   data/seed/<name>.json     committed seed data (read-only at runtime)
 *   data/runtime/<name>.json  working copy, gitignored; created from seed on first read
 *
 * Reads are served from an in-process cache; writes update the cache and
 * are flushed to disk immediately (atomic rename). `npm run seed` resets runtime data.
 * Typed accessors for concrete collections (orders, products, …) are added in T02.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import type { RouteTrace } from '../types';
import { currentVisitor, onVisitorEvicted, publicDemo, sharedDirectory, visitorIsCurrent } from './visitor-context';
import { recordTraceCosts } from './public-limits';

export const SHARED_COLLECTIONS = new Set(['kb_index', 'embedding_cache', 'eval_latest', 'simulated_conversations', 'simulated_messages', 'simulated_traces']);

export class StoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreError";
  }
}

const NAME_RE = /^[a-z0-9][a-z0-9_-]*$/i;

function dataDir(): string {
  return join(process.cwd(), "data");
}
function seedFile(name: string): string {
  return join(dataDir(), "seed", `${name}.json`);
}
function runtimeFile(name: string): string {
  const visitor = currentVisitor();
  return join(visitor && !SHARED_COLLECTIONS.has(name) ? visitor.directory : sharedDirectory(), `${name}.json`);
}

// Keep the cache on globalThis so Next.js dev-mode module reloads don't lose writes.
const g = globalThis as unknown as { __qimuStoreCache?: Map<string, unknown>; __qimuStoreVersions?: Map<string, string> };
const cache: Map<string, unknown> = (g.__qimuStoreCache ??= new Map());
const versions = (g.__qimuStoreVersions ??= new Map<string, string>());

function fileVersion(file: string): string {
  if (!existsSync(file)) return '';
  const stat = statSync(file);
  return `${stat.ino}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
}

function assertName(name: string): void {
  if (!NAME_RE.test(name)) throw new StoreError(`Invalid collection name: "${name}"`);
}

/** Read a whole collection. Copies seed → runtime on first use. */
export function readCollection<T>(name: string): T[] {
  assertName(name);
  const rt = runtimeFile(name);
  const cached = cache.get(rt);
  // A CLI reset happens in another process; refresh cached collections after disk changes.
  if (cached && versions.get(rt) === fileVersion(rt)) return withSimulated(name, cached as T[]);

  if (!existsSync(rt)) {
    const seed = seedFile(name);
    if (!existsSync(seed)) {
      if (currentVisitor() && ['conversations', 'messages', 'traces'].includes(name)) return withSimulated(name, []);
      throw new StoreError(
        `Collection "${name}" not found: neither data/runtime/${name}.json nor data/seed/${name}.json exists. Run \`npm run seed\`.`,
      );
    }
    mkdirSync(dirname(rt), { recursive: true });
    copyFileSync(seed, rt);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(rt, "utf8"));
  } catch (err) {
    throw new StoreError(
      `data/runtime/${name}.json is not valid JSON (${err instanceof Error ? err.message : String(err)}). Run \`npm run seed\` to reset.`,
    );
  }
  if (!Array.isArray(parsed)) {
    throw new StoreError(`data/runtime/${name}.json must contain a JSON array`);
  }
  cache.set(rt, parsed);
  versions.set(rt, fileVersion(rt));
  return withSimulated(name, parsed as T[]);
}

/** Replace a whole collection: updates the cache and persists to data/runtime. */
export function writeCollection<T>(name: string, data: T[]): void {
  assertName(name);
  if (!visitorIsCurrent()) return; // A callback captured before reset/cleanup cannot resurrect data.
  if (currentVisitor() && SHARED_COLLECTIONS.has(name)) throw new StoreError('公开演示的共享数据为只读');
  if (currentVisitor() && ['conversations', 'traces', 'messages'].includes(name)) {
    data = data.filter(row => {
      const item = row as { isSimulated?: boolean; conversationId?: string };
      return !item.isSimulated && !item.conversationId?.startsWith('S');
    });
  }
  const rt = runtimeFile(name);
  mkdirSync(dirname(rt), { recursive: true });
  const tmp = `${rt}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  renameSync(tmp, rt);
  cache.set(rt, data);
  versions.set(rt, fileVersion(rt));
  if (name === 'traces') recordTraceCosts(data as RouteTrace[]);
}

/** Drop the in-memory cache (next read goes back to disk). Used by `npm run seed` and tests. */
export function clearStoreCache(): void {
  const directory = currentVisitor()?.directory;
  if (directory) evictDirectory(directory);
  else { cache.clear(); versions.clear(); }
}

function evictDirectory(directory: string): void {
  for (const key of cache.keys()) if (key.startsWith(directory + '/')) { cache.delete(key); versions.delete(key); }
}
onVisitorEvicted(evictDirectory);

function withSimulated<T>(name: string, own: T[]): T[] {
  if (!publicDemo() || !currentVisitor() || !['conversations', 'messages', 'traces'].includes(name)) return own;
  const file = join(sharedDirectory(), `simulated_${name}.json`);
  if (!existsSync(file)) return own;
  return [...own, ...readCollection<T>(`simulated_${name}`)];
}
