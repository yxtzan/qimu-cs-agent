import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateSeed } from './seed-data';
import { checkSeed } from './check-seed';
import { resetDemoData as resetRuntimeData } from '../lib/store/reset';
import '../lib/store/reset-hooks'; // T17：所有重置钩子（种子流量、知识库索引…）统一登记在这个文件里

const seedDir = join(process.cwd(), 'data/seed');
const runtimeDir = join(process.cwd(), 'data/runtime');

// Extension point for T03. This does not pretend to create an index yet.
export async function buildKnowledgeIndex(): Promise<void> { /* T03 */ }

export async function resetDemoData(): Promise<void> {
  mkdirSync(seedDir, { recursive: true });
  for (const [name, value] of Object.entries(generateSeed())) {
    const file = join(seedDir, `${name}.json`);
    if (!existsSync(file)) writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
  }
  // Validate before replacing runtime: a broken seed must not destroy a running demo.
  checkSeed(seedDir);
  await resetRuntimeData(); // T16: seed → runtime + registered reset hooks (lib/store/reset.ts, incl. T17 seed traffic)
  await buildKnowledgeIndex();
  checkSeed(runtimeDir, join(seedDir, 'kb'));
  console.log('演示数据已重置（含模拟历史数据）；知识库索引由 T03 接入。');
}

if (process.argv[1]?.endsWith('/seed.ts')) {
  resetDemoData().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
