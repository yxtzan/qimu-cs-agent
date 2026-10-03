import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clearStoreCache, readCollection } from '../lib/store';
import { chunkDocument, cosineSimilarity } from '../lib/rag/chunk';
import { buildKnowledgeIndex, deleteKnowledgeDoc, getKnowledgeChunks, importKnowledgeDoc, listKnowledgeDocs, type IndexedDoc } from '../lib/rag';
import { searchKnowledge, searchKnowledgeWithMetrics } from '../lib/rag/search';
import { resetDemoData } from '../lib/store/reset';
import '../lib/store/reset-hooks';
import { appendMessages, createConversation, listMessages } from '../lib/store/conversations';
import { cancelPendingAction } from '../lib/tools/execute-pending';
import { runTool } from '../lib/tools/registry';
import type { PendingAction } from '../lib/types';

async function main() {
  const root = process.cwd();
  const temp = mkdtempSync(join(tmpdir(), 'qimu-t03-rag-'));
  const oldKey = process.env.OPENROUTER_API_KEY, oldProvider = process.env.CLASSIFIER_PROVIDER, oldModel = process.env.EMBEDDING_MODEL;
  const originalFetch = globalThis.fetch;
  const originalTimer = globalThis.setTimeout;
  const timeouts: number[] = [];
  try {
    cpSync(join(root, 'data/seed'), join(temp, 'data/seed'), { recursive: true }); process.chdir(temp); clearStoreCache();
    process.env.OPENROUTER_API_KEY = ''; process.env.CLASSIFIER_PROVIDER = 'mock';
    const text = Array.from({ length: 640 }, (_, i) => String.fromCodePoint(0x4e00 + i)).join('');
    const chunks = chunkDocument('doc', '测试', `# 测试\n## 第一章\n${text}\n## 第二章\n单独章节`);
    assert.equal(chunks.length, 4); assert.equal(chunks[0].text.length, 300); assert.equal(chunks[1].text.slice(0, 50), chunks[0].text.slice(-50)); assert.equal(chunks[3].heading, '第二章'); assert.equal(chunks[3].text, '单独章节');
    assert.equal(cosineSimilarity([1, 0], [1, 0]), 1); assert.equal(cosineSimilarity([0, 0], [1, 0]), 0); assert.equal(cosineSimilarity([1], [1, 2]), 0);
    await buildKnowledgeIndex();
    assert.equal((await listKnowledgeDocs()).length, 10); assert((await listKnowledgeDocs()).every(d => d.indexMode === 'bigram'));
    const hits = await searchKnowledge('真丝怎么洗'); assert.equal(hits[0].chunk.docTitle, '洗护指南'); assert.equal(hits[0].chunk.heading, '真丝'); assert(hits[0].score >= 0.35);
    assert.equal((await searchKnowledge('zzzznonmatchingquery')).length, 0);
    const titles = ['星河羊绒护理', '星河亚麻护理'];
    const imported = await Promise.all(titles.map(title => importKnowledgeDoc(title, `## 星河\n${title}使用中性洗剂，阴干。`)));
    assert.equal((await listKnowledgeDocs()).length, 12);
    assert((await searchKnowledge('星河羊绒')).some(h => h.chunk.docId === imported[0].id));
    clearStoreCache(); assert.equal((await getKnowledgeChunks(imported[0].id))[0].heading, '星河');
    await deleteKnowledgeDoc(imported[0].id); assert(!(await searchKnowledge('星河羊绒')).some(h => h.chunk.docId === imported[0].id));
    await assert.rejects(() => getKnowledgeChunks('missing')); await assert.rejects(() => deleteKnowledgeDoc('missing'));
    await assert.rejects(() => importKnowledgeDoc('仅标题', '# 标题'));
    await assert.rejects(() => searchKnowledge('')); await assert.rejects(() => searchKnowledge('真丝', 0));
    console.log(`PASS 无 key bigram：10 篇索引；真丝怎么洗 → ${hits[0].chunk.docTitle}/${hits[0].chunk.heading}（${hits[0].score}）；300 字分块/50 字重叠；并发导入/删除/落盘`);
    const conversation = createConversation('B001');
    const context = { buyerId: 'B001', conversationId: conversation.id };
    const actionResult = await runTool('request_exchange', { orderId: 'QM2026092801', itemId: 'QM2026092801-1', newSize: 'L' }, context);
    assert(actionResult.ok); const pending = actionResult.data as PendingAction;
    appendMessages(conversation.id, [{ role: 'ai', text: '请确认', card: { kind: 'confirm', pendingAction: pending } }]);
    assert(cancelPendingAction(pending.id, context).ok);
    const message = listMessages(conversation.id)[0]; assert(message.card?.kind === 'confirm'); assert.equal(message.card.pendingAction.status, 'cancelled');
    await resetDemoData(); assert.equal((await listKnowledgeDocs()).length, 10); assert.equal(readCollection<PendingAction>('pending_actions').length, 0);
    console.log('PASS T16 确认卡片读取回填最新状态；共用登记表 + reset 钩子重建索引并清空导入文档/待确认动作');
    // This fixture exercises actual embed() request/response parsing, not model quality.
    process.env.OPENROUTER_API_KEY = 'local-transport-fixture'; process.env.CLASSIFIER_PROVIDER = 'jev'; process.env.EMBEDDING_MODEL = 'fixture/embedding';
    globalThis.setTimeout = ((callback: Parameters<typeof setTimeout>[0], delay?: number, ...args: unknown[]) => {
      timeouts.push(delay ?? 0); return originalTimer(callback, delay, ...args);
    }) as typeof setTimeout;
    let requests = 0;
    globalThis.fetch = async (_input, init) => {
      requests++;
      if (requests === 1) throw new Error('simulated first indexing attempt failure');
      const body = JSON.parse(init!.body as string) as { input: string[]; model: string };
      assert.equal(body.model, 'fixture/embedding');
      const data = body.input.map((input, index) => ({ index, embedding: input.includes('\n真丝\n') || input === '真丝怎么洗' ? [1, 0, 0] : input.includes('真丝') ? [0.6, 0.8, 0] : [0, 1, 0] })).reverse();
      return Response.json({ data, usage: { prompt_tokens: 100, cost: 0.000001 } });
    };
    await buildKnowledgeIndex();
    assert((await listKnowledgeDocs()).every(d => d.indexMode === 'embedding'));
    assert(timeouts.length >= 11 && timeouts.slice().every(t => t === 30000), '索引每批 30 秒，首批失败重试后成功');
    const embedded = await searchKnowledgeWithMetrics('真丝怎么洗'); assert.equal(embedded.metrics.mode, 'embedding'); assert.equal(embedded.hits[0].chunk.docTitle, '洗护指南'); assert.equal(embedded.hits[0].chunk.heading, '真丝'); assert.equal(embedded.metrics.costUsd, 0.000001); assert(!embedded.metrics.estimated); assert(requests >= 11);
    assert(readCollection<IndexedDoc>('kb_index').every(r => r.indexing.costUsd > 0 && r.vectors?.length === r.chunks.length));
    // Query must use the model that built each stored index, even after env changes.
    process.env.EMBEDDING_MODEL = 'different/model'; await searchKnowledge('真丝怎么洗');
    process.env.EMBEDDING_MODEL = 'fixture/embedding';
    assert(timeouts.includes(8000), '在线查询仍为 8 秒');
    let failedRequests = 0;
    globalThis.fetch = async () => { failedRequests++; throw new Error('simulated network failure'); };
    const fallback = await searchKnowledgeWithMetrics('真丝怎么洗'); assert.equal(fallback.metrics.mode, 'bigram'); assert.equal(fallback.hits[0].chunk.heading, '真丝'); assert(fallback.metrics.fallback);
    const beforeImport = failedRequests;
    const failedImport = await importKnowledgeDoc('网络故障新文档', '## 羊绒\n羊绒不能机洗。'); assert.equal(failedImport.indexMode, 'bigram'); assert.equal(failedRequests - beforeImport, 2, '索引只重试 1 次');
    globalThis.fetch = async () => Response.json({ data: [{ index: 0, embedding: [0, 0] }], usage: { cost: 0.000001 } });
    const invalid = await importKnowledgeDoc('坏向量文档', '## 羊绒\n羊绒要阴干。'); assert.equal(invalid.indexMode, 'bigram');
    globalThis.fetch = originalFetch; process.env.OPENROUTER_API_KEY = ''; const offline = await searchKnowledgeWithMetrics('真丝怎么洗'); assert.equal(offline.hits[0].chunk.heading, '真丝'); assert.equal(offline.metrics.mode, 'bigram');
    console.log('PASS embedding 传输夹具（非真实模型）：索引 30 秒+重试 1 次，查询 8 秒；向量解析/余弦/成本/原索引模型；查询失败、导入失败、无效向量及移除 key 自动降到 bigram');
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalTimer;
    for (const [name, value] of [['OPENROUTER_API_KEY', oldKey], ['CLASSIFIER_PROVIDER', oldProvider], ['EMBEDDING_MODEL', oldModel]]) { if (value === undefined) delete process.env[name!]; else process.env[name!] = value; }
    process.chdir(root); clearStoreCache(); rmSync(temp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
