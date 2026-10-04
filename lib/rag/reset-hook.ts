import { registerResetHook } from '../store/reset';
import { buildKnowledgeIndex } from './index';
import { restoreEmbeddingCache } from './embedding-cache';

registerResetHook('kb-index', async () => {
  restoreEmbeddingCache();
  const docs = await buildKnowledgeIndex();
  console.log(`知识库索引：${docs.length} 篇，embedding ${docs.filter(d => d.indexMode === 'embedding').length} / bigram ${docs.filter(d => d.indexMode === 'bigram').length}`);
});
