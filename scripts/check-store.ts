/**
 * T00 self-check for lib/store. Run: npx tsx scripts/check-store.ts
 * Uses a throw-away collection name and cleans up after itself.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { StoreError, clearStoreCache, readCollection, writeCollection } from "../lib/store";

const name = "t00-selfcheck";
const seed = join(process.cwd(), "data", "seed", `${name}.json`);
const runtime = join(process.cwd(), "data", "runtime", `${name}.json`);
let failures = 0;
function check(label: string, ok: boolean): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures++;
}

mkdirSync(join(process.cwd(), "data", "seed"), { recursive: true });
rmSync(runtime, { force: true });
writeFileSync(seed, JSON.stringify([{ id: 1 }, { id: 2 }]));

try {
  const first = readCollection<{ id: number }>(name);
  check("first read copies seed → runtime", first.length === 2 && existsSync(runtime));

  writeCollection(name, [...first, { id: 3 }]);
  check("write updates the in-process cache", readCollection(name).length === 3);

  clearStoreCache();
  check("write persisted to disk (survives cache clear)", readCollection(name).length === 3);

  try {
    readCollection("does-not-exist");
    check("missing collection throws StoreError", false);
  } catch (err) {
    check("missing collection throws StoreError", err instanceof StoreError);
  }
  try {
    readCollection("../evil");
    check("path traversal rejected", false);
  } catch (err) {
    check("path traversal rejected", err instanceof StoreError);
  }
} finally {
  rmSync(seed, { force: true });
  rmSync(runtime, { force: true });
}
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
