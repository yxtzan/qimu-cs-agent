import assert from 'node:assert/strict';
import type { KbDoc, KbChunk, KbSearchHit } from '../lib/types';

async function main() {
  const base = process.argv[2] ?? 'http://localhost:3001';
  const expectedMode = process.argv[3];
  const created: string[] = [];
  async function request<T>(path: string, init?: RequestInit, status = 200): Promise<T> {
    const response = await fetch(new URL(path, base), init);
    assert.equal(response.status, status, `${path} HTTP 状态`);
    const body = await response.json();
    if (status !== 200) assert(body.error?.code && /[\u4e00-\u9fff]/.test(body.error.message), '中文错误契约');
    return body as T;
  }
  const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const docs = await request<KbDoc[]>('/api/kb'); assert.equal(docs.filter(d => d.source === 'seed').length, 10);
    if (expectedMode) assert(docs.every(d => d.indexMode === expectedMode));
    const hits = await request<KbSearchHit[]>('/api/kb/search', json({ query: '真丝怎么洗' })); assert.equal(hits[0].chunk.docTitle, '洗护指南'); assert.equal(hits[0].chunk.heading, '真丝');
    console.log(`PASS /api/kb/search 真丝怎么洗 → ${hits[0].chunk.docTitle}/${hits[0].chunk.heading}，${hits[0].score}；文档模式 ${[...new Set(docs.map(d => d.indexMode))].join('/')}`);
    const pasted = await request<KbDoc>('/api/kb/import', json({ title: 'T03星河羊绒测试', content: '## 星河羊绒\n星河羊绒需要专业干洗，不可机洗。' })); created.push(pasted.id); assert.equal(pasted.source, 'paste'); assert.equal(pasted.chunkCount, 1); assert.match(pasted.createdAt, /\+08:00$/);
    const chunks = await request<KbChunk[]>(`/api/kb/${encodeURIComponent(pasted.id)}/chunks`); assert.equal(chunks[0].heading, '星河羊绒');
    const importedHits = await request<KbSearchHit[]>('/api/kb/search', json({ query: '星河羊绒', topK: 20 })); assert(importedHits.some(h => h.chunk.docId === pasted.id));
    const form = new FormData(); form.append('file', new File(['## 星河亚麻\n星河亚麻建议冷水轻柔洗。'], '星河亚麻.md')); form.append('title', 'T03上传文档');
    const uploaded = await request<KbDoc>('/api/kb/import', { method: 'POST', body: form }); created.push(uploaded.id); assert.equal(uploaded.title, 'T03上传文档'); assert.equal(uploaded.source, 'upload');
    const txt = new FormData(); txt.append('file', new File(['星河棉织品请翻面清洗。'], '星河棉.txt'));
    const plain = await request<KbDoc>('/api/kb/import', { method: 'POST', body: txt }); created.push(plain.id); assert.equal(plain.title, '星河棉');
    await request(`/api/kb/${encodeURIComponent(pasted.id)}`, { method: 'DELETE' }); created.splice(created.indexOf(pasted.id), 1);
    await request(`/api/kb/${encodeURIComponent(pasted.id)}/chunks`, undefined, 404);
    const deletedHits = await request<KbSearchHit[]>('/api/kb/search', json({ query: '星河羊绒', topK: 20 })); assert(!deletedHits.some(h => h.chunk.docId === pasted.id));
    await request('/api/kb/missing', { method: 'DELETE' }, 404);
    for (const body of [{ query: '' }, { query: '真丝', topK: 0 }, { query: '真丝', topK: 1.5 }, { query: '真丝', topK: '4' }, { query: '真丝', topK: 21 }, null]) await request('/api/kb/search', json(body), 400);
    for (const body of [{ title: '', content: '正文' }, { title: '有效', content: '' }, { title: 1, content: '正文' }, { title: '有效', content: '# 仅标题' }]) await request('/api/kb/import', json(body), 400);
    await request('/api/kb/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid' }, 400);
    await request('/api/kb/import', json({ title: '超限', content: 'x'.repeat(1024 * 1024 + 1) }), 413);
    for (const [name, data, status] of [['bad.exe', '正文', 400], ['too-large.md', 'x'.repeat(1024 * 1024 + 1), 413]] as const) {
      const invalid = new FormData(); invalid.append('file', new File([data], name)); await request('/api/kb/import', { method: 'POST', body: invalid }, status);
    }
    const ui = await fetch(new URL('/seller/kb', base)); assert.equal(ui.status, 200); assert((await ui.text()).includes('栖木'));
    console.log('PASS 五个知识库 API；JSON/Markdown/txt 导入即检索；分块/删除；400/404/413；/seller/kb HTTP 200');
  } finally {
    for (const id of created) await request(`/api/kb/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
