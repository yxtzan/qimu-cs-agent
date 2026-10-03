import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateSeed } from './seed-data';
import { checkSeed } from './check-seed';
import { clearStoreCache } from '../lib/store';

const seedDir = join(process.cwd(), 'data/seed');
const runtimeDir = join(process.cwd(), 'data/runtime');

// Extension points for T03 and T17. These do not pretend to create an index or traffic yet.
export async function buildKnowledgeIndex(): Promise<void> { /* T03 */ }
export async function generateSeedTraffic(): Promise<void> { /* T17 */ }

export async function resetDemoData(): Promise<void> {
  mkdirSync(seedDir, { recursive: true });
  for (const [name, value] of Object.entries(generateSeed())) {
    const file = join(seedDir, `${name}.json`);
    if (!existsSync(file)) writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
  }
  // Validate before replacing runtime: a broken seed must not destroy a running demo.
  checkSeed(seedDir);
  rmSync(runtimeDir, { recursive: true, force: true });
  mkdirSync(runtimeDir, { recursive: true });
  for (const file of readdirSync(seedDir).filter(f => f.endsWith('.json'))) {
    copyFileSync(join(seedDir, file), join(runtimeDir, file));
  }
  clearStoreCache();
  await buildKnowledgeIndex();
  await generateSeedTraffic();
  checkSeed(runtimeDir, join(seedDir, 'kb'));
  console.log('演示数据已重置；知识库索引和种子流量分别由 T03 / T17 接入。');
}

if (process.argv[1]?.endsWith('/seed.ts')) {
  resetDemoData().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
