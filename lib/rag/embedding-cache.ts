import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeCollection } from '../store';

type Entry = { id: string; vector: number[] };
const globalCache = globalThis as unknown as { __qimuEmbeddingCaches?: Map<string, Map<string, number[]>> };
const caches = globalCache.__qimuEmbeddingCaches ??= new Map<string, Map<string, number[]>>();
const valid = (v: unknown): v is number[] => Array.isArray(v) && v.length > 0 && v.every(n => typeof n === 'number' && Number.isFinite(n)) && v.some(n => n !== 0);
function cache(): Map<string, number[]> {
  const root = process.cwd();
  let entries = caches.get(root);
  if (!entries) {
    entries = new Map();
    const path = join(root, 'data/runtime/embedding_cache.json');
    try {
      const data: unknown = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
      if (Array.isArray(data)) for (const entry of data as Entry[]) {
        if (entry && typeof entry.id === 'string' && valid(entry.vector)) entries.set(entry.id, entry.vector);
      }
    } catch { /* A corrupt cache is a miss, never a broken reset. */ }
    caches.set(root, entries);
  }
  return entries;
}
// Hydrate before reset removes runtime. Both registered reset entry points
// import this module before calling resetDemoData.
cache();
export const embeddingKey = (model: string, text: string): string => createHash('sha256').update(JSON.stringify([model, text])).digest('hex');
export function getCachedEmbedding(model: string, text: string): number[] | undefined {
  const vector = cache().get(embeddingKey(model, text));
  return vector ? [...vector] : undefined;
}
export function putCachedEmbeddings(model: string, texts: string[], vectors: number[][]): void {
  if (texts.length !== vectors.length || !vectors.every(valid)) throw new Error('Invalid embedding cache');
  texts.forEach((text, i) => cache().set(embeddingKey(model, text), [...vectors[i]]));
  restoreEmbeddingCache();
}
export function restoreEmbeddingCache(): void {
  writeCollection<Entry>('embedding_cache', [...cache()].map(([id, vector]) => ({ id, vector })));
}
