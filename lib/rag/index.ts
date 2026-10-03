import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { nowIso } from '../demo-clock';
import { embed, hasApiKey } from '../llm/openrouter';
import { readCollection, writeCollection } from '../store';
import { ApiError } from '../store/http';
import type { KbChunk, KbDoc } from '../types';
import { chunkDocument } from './chunk';

export interface IndexedDoc {
  doc: KbDoc;
  chunks: KbChunk[];
  vectors?: number[][];
  model?: string;
  indexing: { latencyMs: number; costUsd: number; estimated: boolean; fallback?: string };
}
const globalState = globalThis as unknown as { __qimuKbQueues?: Map<string, Promise<unknown>> };
const queues = globalState.__qimuKbQueues ??= new Map<string, Promise<unknown>>();

// Serialize mutations across hot reloads so simultaneous imports/deletes don't
// overwrite each other while waiting for embeddings.
function mutate<T>(operation: () => Promise<T>): Promise<T> {
  const root = process.cwd();
  const run = (queues.get(root) ?? Promise.resolve()).catch(() => {}).then(operation);
  queues.set(root, run.catch(() => {}));
  return run;
}
export function validVectors(vectors: number[][], count: number): boolean {
  const dimension = vectors[0]?.length;
  return vectors.length === count && Boolean(dimension) && vectors.every(v => v.length === dimension && v.every(Number.isFinite) && v.some(n => n !== 0));
}
async function makeIndex(id: string, title: string, content: string, source: KbDoc['source']): Promise<IndexedDoc> {
  const started = Date.now();
  const chunks = chunkDocument(id, title, content);
  if (!chunks.length) throw new ApiError('BAD_REQUEST', '文档没有可检索的正文内容', 400);
  const record: IndexedDoc = {
    doc: { id, title, source, chunkCount: chunks.length, charCount: Array.from(content).length, createdAt: nowIso(), indexMode: 'bigram' },
    chunks, indexing: { latencyMs: 0, costUsd: 0, estimated: false },
  };
  if (hasApiKey() && process.env.CLASSIFIER_PROVIDER !== 'mock') {
    try {
      // Indexing is a batch operation. Each batch gets 30s and one retry;
      // online query embeddings use a separate 2s timeout (search.ts).
      const vectors: number[][] = [];
      for (let offset = 0; offset < chunks.length; offset += 64) {
        const batch = chunks.slice(offset, offset + 64);
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const result = await embed({ input: batch.map(c => `${c.docTitle}\n${c.heading ?? ''}\n${c.text}`), timeoutMs: 30000 });
            record.indexing.costUsd += result.costUsd;
            record.indexing.estimated ||= result.estimated;
            if (!validVectors(result.data, batch.length)) throw new Error('Invalid embeddings');
            vectors.push(...result.data);
            break;
          } catch (error) {
            record.indexing.estimated = true;
            if (attempt === 1) throw error;
          }
        }
      }
      if (!validVectors(vectors, chunks.length)) throw new Error('Inconsistent embedding dimensions');
      record.vectors = vectors;
      record.model = process.env.EMBEDDING_MODEL?.trim();
      record.doc.indexMode = 'embedding';
    } catch (error) {
      // Persist a safe diagnostic, never upstream response bodies or credentials.
      record.indexing.estimated = true;
      record.indexing.fallback = `embedding 不可用（${error instanceof Error ? error.name : 'UnknownError'}），已使用 bigram`;
    }
  }
  record.indexing.latencyMs = Date.now() - started;
  return record;
}

export function buildKnowledgeIndex(): Promise<KbDoc[]> {
  return mutate(async () => {
    const dir = join(process.cwd(), 'data/seed/kb');
    const records: IndexedDoc[] = [];
    for (const file of readdirSync(dir).filter(f => f.endsWith('.md')).sort()) {
      records.push(await makeIndex(`KB-${file.slice(0, -3)}`, file.slice(0, -3), readFileSync(join(dir, file), 'utf8'), 'seed'));
    }
    writeCollection('kb_index', records);
    return records.map(r => r.doc);
  });
}
export async function readKnowledgeIndex(): Promise<IndexedDoc[]> {
  if (!existsSync(join(process.cwd(), 'data/runtime/kb_index.json'))) {
    await mutate(async () => {
      if (existsSync(join(process.cwd(), 'data/runtime/kb_index.json'))) return;
      const dir = join(process.cwd(), 'data/seed/kb');
      const records: IndexedDoc[] = [];
      for (const file of readdirSync(dir).filter(f => f.endsWith('.md')).sort()) records.push(await makeIndex(`KB-${file.slice(0, -3)}`, file.slice(0, -3), readFileSync(join(dir, file), 'utf8'), 'seed'));
      writeCollection('kb_index', records);
    });
  }
  return readCollection<IndexedDoc>('kb_index');
}
export async function listKnowledgeDocs(): Promise<KbDoc[]> { return (await readKnowledgeIndex()).map(r => r.doc); }
export async function getKnowledgeChunks(id: string): Promise<KbChunk[]> {
  const record = (await readKnowledgeIndex()).find(r => r.doc.id === id);
  if (!record) throw new ApiError('NOT_FOUND', '没有找到这篇知识库文档', 404);
  return record.chunks;
}
export const MAX_DOCUMENT_BYTES = 1024 * 1024;
export function validateDocument(title: unknown, content: unknown): asserts title is string {
  if (typeof title !== 'string' || !title.trim() || title.length > 200) throw new ApiError('BAD_REQUEST', '请提供 1–200 字的文档标题', 400);
  if (typeof content !== 'string' || !content.trim()) throw new ApiError('BAD_REQUEST', '请提供文档正文', 400);
  if (Buffer.byteLength(content, 'utf8') > MAX_DOCUMENT_BYTES) throw new ApiError('TOO_LARGE', '文档不能超过 1MB', 413);
}
export async function importKnowledgeDoc(title: string, content: string, source: 'paste' | 'upload' = 'paste'): Promise<KbDoc> {
  validateDocument(title, content);
  await readKnowledgeIndex();
  return mutate(async () => {
    const record = await makeIndex(`KB-${randomUUID()}`, title.trim(), content, source);
    writeCollection('kb_index', [...readCollection<IndexedDoc>('kb_index'), record]);
    return record.doc;
  });
}
export async function deleteKnowledgeDoc(id: string): Promise<{ ok: true }> {
  await readKnowledgeIndex();
  return mutate(async () => {
    const records = readCollection<IndexedDoc>('kb_index');
    if (!records.some(r => r.doc.id === id)) throw new ApiError('NOT_FOUND', '没有找到这篇知识库文档', 404);
    writeCollection('kb_index', records.filter(r => r.doc.id !== id));
    return { ok: true };
  });
}
