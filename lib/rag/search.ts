import { embed, hasApiKey } from '../llm/openrouter';
import { ApiError } from '../store/http';
import type { KbSearchHit } from '../types';
import { bigramScore, cosineSimilarity } from './chunk';
import { readKnowledgeIndex, validVectors } from './index';

export interface SearchMetrics { latencyMs: number; costUsd: number; estimated: boolean; mode: 'embedding' | 'bigram' | 'mixed'; fallback?: string }
export async function searchKnowledgeWithMetrics(query: string, topK = 4, options: { deadlineMs?: number } = {}): Promise<{ hits: KbSearchHit[]; metrics: SearchMetrics }> {
  if (typeof query !== 'string' || !query.trim() || query.length > 2000) throw new ApiError('BAD_REQUEST', '请输入 1–2000 字的搜索问题', 400);
  if (!Number.isInteger(topK) || topK < 1 || topK > 20) throw new ApiError('BAD_REQUEST', 'topK 必须是 1–20 的整数', 400);
  const started = Date.now();
  const records = await readKnowledgeIndex();
  const metrics: SearchMetrics = { latencyMs: 0, costUsd: 0, estimated: false, mode: 'bigram' };
  const models = [...new Set(records.filter(r => r.vectors && r.model).map(r => r.model!))];
  const queryVectors = new Map<string, number[]>();
  if (hasApiKey() && process.env.CLASSIFIER_PROVIDER !== 'mock') {
    for (const model of models) {
      const remainingMs = options.deadlineMs === undefined ? 2000 : options.deadlineMs - Date.now() - 50;
      if (remainingMs <= 0) { metrics.fallback = '本轮时间预算已用尽，已使用 bigram'; break; }
      try {
        const result = await embed({ model, input: [query.trim()], timeoutMs: Math.min(2000, remainingMs) });
        metrics.costUsd += result.costUsd;
        metrics.estimated ||= result.estimated;
        if (!validVectors(result.data, 1)) throw new Error('Invalid query embedding');
        queryVectors.set(model, result.data[0]);
      } catch (error) { metrics.estimated = true; metrics.fallback = `查询 embedding 不可用（${error instanceof Error ? error.name : 'UnknownError'}），已使用 bigram`; }
    }
  }
  let embeddingCount = 0, bigramCount = 0;
  const thresholdEnv = Number(process.env.RAG_MIN_SCORE ?? '0.35');
  const threshold = Number.isFinite(thresholdEnv) && thresholdEnv >= 0 && thresholdEnv <= 1 ? thresholdEnv : 0.35;
  const hits = records.flatMap(record => record.chunks.map((chunk, i) => {
    const q = record.model ? queryVectors.get(record.model) : undefined;
    const vector = record.vectors?.[i];
    const vectorMode = Boolean(q && vector && q.length === vector.length);
    if (vectorMode) embeddingCount++; else bigramCount++;
    const score = vectorMode ? Math.max(0, cosineSimilarity(q!, vector!)) : bigramScore(query, chunk);
    return { chunk, score };
  })).filter(hit => hit.score >= threshold).sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id)).slice(0, topK);
  metrics.mode = embeddingCount ? (bigramCount ? 'mixed' : 'embedding') : 'bigram';
  metrics.latencyMs = Date.now() - started;
  return { hits, metrics };
}
export async function searchKnowledge(query: string, topK = 4): Promise<KbSearchHit[]> {
  const result = await searchKnowledgeWithMetrics(query, topK);
  // API returns only the contracted hit array; model accounting remains observable.
  console.info('[rag-search]', JSON.stringify(result.metrics));
  return result.hits;
}
