import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLocalEnv } from '../lib/llm/env';
import { hasApiKey } from '../lib/llm/openrouter';
import { clearStoreCache, writeCollection } from '../lib/store';
import { readKnowledgeIndex } from '../lib/rag';
import { searchKnowledgeWithMetrics } from '../lib/rag/search';

async function main() {
  loadLocalEnv();
  if (!hasApiKey()) throw new Error('请先在 .env.local 配置 OPENROUTER_API_KEY，或用 node --env-file 读取已有配置');
  const root = process.cwd();
  const records = await readKnowledgeIndex();
  const vectors = records.filter(r => r.doc.indexMode === 'embedding');
  assert(vectors.some(r => r.doc.title === '洗护指南'), '请先用真实 key 运行 npm run seed 建立洗护指南向量索引');
  const temp = mkdtempSync(join(tmpdir(), 'qimu-t03-live-'));
  try {
    // Test pure vector ranking independently from documents that fell back during
    // indexing. The main runtime remains untouched and keeps all documents.
    cpSync(join(root, 'data/seed'), join(temp, 'data/seed'), { recursive: true });
    process.chdir(temp); clearStoreCache(); writeCollection('kb_index', vectors);
    let result = await searchKnowledgeWithMetrics('真丝怎么洗');
    console.log('真实查询第 1 次:', JSON.stringify(result.metrics));
    if (result.metrics.mode !== 'embedding') { result = await searchKnowledgeWithMetrics('真丝怎么洗'); console.log('真实查询第 2 次:', JSON.stringify(result.metrics)); }
    assert.equal(result.metrics.mode, 'embedding', '真实查询仍然降级，未验证成功');
    assert.equal(result.hits[0].chunk.docTitle, '洗护指南'); assert.equal(result.hits[0].chunk.heading, '真丝');
    console.log(JSON.stringify({ verified: 'real OpenRouter embedding', model: vectors.find(r => r.doc.title === '洗护指南')!.model, first: { docTitle: result.hits[0].chunk.docTitle, heading: result.hits[0].chunk.heading, score: result.hits[0].score }, metrics: result.metrics, embeddingDocs: vectors.length, indexingFallbackDocs: records.length - vectors.length }, null, 2));
  } finally { process.chdir(root); clearStoreCache(); rmSync(temp, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : '真实检索验证失败'); process.exitCode = 1; });
