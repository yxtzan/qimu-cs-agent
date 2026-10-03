/**
 * mock 模式的跨标签页同步（T13）。
 *
 * 买家端（/）和卖家端（/seller）通常在两个浏览器标签页里打开，而 mock 数据在各自标签页的内存里，互相看不到。
 * 这里把「会话 / 规则」快照写进 localStorage：每次 mock 调用前读取别的标签页写入的新快照，
 * 会改动数据的调用结束后写回。这样即使后端还没合并，也能真实演示
 * 「买家触发转人工 → 卖家端出现红点 → 卖家回复 → 买家端收到」。
 *
 * 局限（仅 mock）：
 * - 快照 30 分钟没更新就视为过期，重新从种子数据开始；控制台运行 `__qimuMock.reset()` 可立即重置。
 * - 订单、知识库不同步（只在各自标签页内有效）。
 * - 两个标签页恰好同时修改同一份数据时，后写入的会覆盖先写入的（真实后端不存在这个问题）。
 */
import { exportRules, importRules, resetAdminMock, type RuleSeed } from "./admin";
import { exportChatMeta, importChatMeta } from "./chat";
import { mockSellerStore, replaceSellerStore, resetSellerMock, type Seed } from "./seller";

const KEY = "qimu-mock-sync-v1";
const TTL_MS = 30 * 60 * 1000;

interface Snapshot {
  rev: number;
  writtenAt: number;
  seller: Seed[];
  chat: { ids: string[]; counter: number };
  rules: RuleSeed[];
}

const enabled = () => typeof window !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCK !== "0";

let localRev = 0;
let inflight = 0;

function read(): Snapshot | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as Snapshot;
    if (Date.now() - snap.writtenAt > TTL_MS) return null;
    return snap;
  } catch {
    return null;
  }
}

function syncIn() {
  if (!enabled() || inflight > 0) return; // 本标签页有写操作进行中时不覆盖内存，避免写丢
  const snap = read();
  if (!snap || snap.rev <= localRev) return;
  replaceSellerStore(snap.seller);
  importChatMeta(snap.chat);
  importRules(snap.rules);
  localRev = snap.rev;
}

function syncOut() {
  if (!enabled()) return;
  try {
    localRev = Math.max(Date.now(), localRev + 1);
    const snap: Snapshot = {
      rev: localRev,
      writtenAt: Date.now(),
      seller: mockSellerStore(),
      chat: exportChatMeta(),
      rules: exportRules(),
    };
    window.localStorage.setItem(KEY, JSON.stringify(snap));
  } catch {
    /* 隐私模式 / 配额满：退化成单标签页 mock，不影响使用 */
  }
}

/** 只读调用：调用前拉取别的标签页的最新数据。 */
export async function mockRead<T>(fn: () => Promise<T>): Promise<T> {
  syncIn();
  return fn();
}

/** 会改动数据的调用：调用前拉取最新数据，结束后写回。 */
export async function mockWrite<T>(fn: () => Promise<T>): Promise<T> {
  syncIn();
  inflight += 1;
  try {
    return await fn();
  } finally {
    inflight -= 1;
    syncOut();
  }
}

/** 会话详情：读取后卖家未读归零是写操作，但只有真的有未读时才写回，避免轮询时互相覆盖。 */
export async function mockReadClearingUnread<T>(conversationId: string, fn: () => Promise<T>): Promise<T> {
  syncIn();
  const hadUnread = (mockSellerStore().find((s) => s.conversation.id === conversationId)?.conversation.unreadForSeller ?? 0) > 0;
  return hadUnread ? mockWrite(fn) : fn();
}

/**
 * 重置演示数据（设置页「重置演示数据」，等价于后端的 POST /api/admin/reset）：
 * 卖家会话、规则恢复种子数据，并立刻写回一份新快照，其他已打开的标签页下次请求时会自动同步成重置后的数据。
 * 订单、知识库不跨标签页同步，调用方随后应刷新本页（其他标签页手动刷新即可）。
 */
export function resetMockData() {
  resetSellerMock();
  resetAdminMock();
  syncOut();
}

export function resetMockSync() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  resetSellerMock();
  window.location.reload();
}

if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCK !== "0") {
  const w = window as unknown as { __qimuMock?: Record<string, unknown> };
  w.__qimuMock = { ...(w.__qimuMock ?? {}), reset: resetMockSync };
}
