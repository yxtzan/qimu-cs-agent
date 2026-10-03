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
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

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
  return join(dataDir(), "runtime", `${name}.json`);
}

// Keep the cache on globalThis so Next.js dev-mode module reloads don't lose writes.
const g = globalThis as unknown as { __qimuStoreCache?: Map<string, unknown> };
const cache: Map<string, unknown> = (g.__qimuStoreCache ??= new Map());

function assertName(name: string): void {
  if (!NAME_RE.test(name)) throw new StoreError(`Invalid collection name: "${name}"`);
}

/** Read a whole collection. Copies seed → runtime on first use. */
export function readCollection<T>(name: string): T[] {
  assertName(name);
  const cached = cache.get(name);
  if (cached) return cached as T[];

  const rt = runtimeFile(name);
  if (!existsSync(rt)) {
    const seed = seedFile(name);
    if (!existsSync(seed)) {
      throw new StoreError(
        `Collection "${name}" not found: neither data/runtime/${name}.json nor data/seed/${name}.json exists. Run \`npm run seed\`.`,
      );
    }
    mkdirSync(join(dataDir(), "runtime"), { recursive: true });
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
  cache.set(name, parsed);
  return parsed as T[];
}

/** Replace a whole collection: updates the cache and persists to data/runtime. */
export function writeCollection<T>(name: string, data: T[]): void {
  assertName(name);
  mkdirSync(join(dataDir(), "runtime"), { recursive: true });
  const rt = runtimeFile(name);
  const tmp = `${rt}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  renameSync(tmp, rt);
  cache.set(name, data);
}

/** Drop the in-memory cache (next read goes back to disk). Used by `npm run seed` and tests. */
export function clearStoreCache(): void {
  cache.clear();
}
