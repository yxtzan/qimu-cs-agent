import { loadLocalEnv } from "../lib/llm/env";
import { decide } from "../lib/brain/decide";

async function main(): Promise<void> {
  loadLocalEnv();
  const message = process.argv[2];
  if (!message) {
    console.error('用法：npx tsx scripts/try-decide.ts "一句话" [state JSON]');
    process.exitCode = 1;
    return;
  }
  let state: unknown = {};
  if (process.argv[3]) {
    try { state = JSON.parse(process.argv[3]); } catch { console.error("state JSON 无法解析"); process.exitCode = 1; return; }
  }
  const started = Date.now();
  const result = await decide(state, message);
  console.log(JSON.stringify({ ...result, elapsedMs: Date.now() - started }, null, 2));
}

void main();
