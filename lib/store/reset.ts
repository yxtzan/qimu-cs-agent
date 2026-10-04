/**
 * 重置演示数据（T16）。`npm run seed`、`POST /api/admin/reset`、评测脚本都走这里。
 *
 *   1. 清空 data/runtime，把 data/seed/*.json 复制进去
 *   2. 清掉进程内缓存
 *   3. 依次执行用 registerResetHook 注册的钩子（T03：知识库索引；T17：种子流量）
 *
 * 钩子所在的模块必须在重置前被 import 过才会注册——新增钩子时，只需在
 * `lib/store/reset-hooks.ts` 里加一行 import（`app/api/admin/reset/route.ts` 和 `scripts/seed.ts` 都只 import 那个文件）。
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { clearStoreCache } from "./index";

type ResetHook = () => void | Promise<void>;

// 放在 globalThis 上：Next.js 开发模式热更新模块后钩子不丢。
const g = globalThis as unknown as { __qimuResetHooks?: Map<string, ResetHook> };
const hooks: Map<string, ResetHook> = (g.__qimuResetHooks ??= new Map());

/** 注册重置钩子（同名覆盖，按注册顺序执行）。 */
export function registerResetHook(name: string, fn: ResetHook): void {
  hooks.set(name, fn);
}

/** 重置：seed → runtime，清缓存，再执行所有钩子。钩子报错会中断并抛出。 */
export async function resetDemoData(): Promise<void> {
  const seedDir = join(process.cwd(), "data", "seed");
  const runtimeDir = join(process.cwd(), "data", "runtime");
  // 评测结果（T06）和向量缓存（T05-1）不是演示状态，重置时保留：
  // 否则看板评测卡会消失，知识库会从向量检索退回 bigram。
  const keepNames = ["eval_latest.json", "embedding_cache.json"];
  const kept = new Map<string, Buffer>();
  for (const name of keepNames) {
    const file = join(runtimeDir, name);
    if (existsSync(file)) kept.set(name, readFileSync(file));
  }
  rmSync(runtimeDir, { recursive: true, force: true });
  mkdirSync(runtimeDir, { recursive: true });
  for (const [name, buf] of kept) writeFileSync(join(runtimeDir, name), buf);
  for (const file of readdirSync(seedDir).filter((f) => f.endsWith(".json"))) {
    copyFileSync(join(seedDir, file), join(runtimeDir, file));
  }
  clearStoreCache();
  for (const [name, hook] of hooks) {
    try {
      await hook();
    } catch (err) {
      throw new Error(`重置钩子「${name}」执行失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
