/**
 * 会话数据层（T16）：会话 / 消息 / RouteTrace 三个集合的类型化读写。
 *
 *   data/runtime/conversations.json   Conversation[]
 *   data/runtime/messages.json        ChatMessage[]（全部会话混在一起，按写入顺序 = 时间顺序）
 *   data/runtime/traces.json          RouteTrace[]
 *
 * 这三个集合没有 seed 文件，不存在时视为空数组；`resetDemoData()` 会清掉它们。
 * 所有函数都是同步的（读-改-写在同一个事件循环里完成），所以同一进程内不会互相覆盖。
 * Codex 的 T04 直接调用这些函数，签名请保持稳定。
 */
import { currentVisitor, publicDemo } from './visitor-context';
import { nowIso } from "../demo-clock";
import type {
  ChatMessage,
  Conversation,
  ConversationStatus,
  DialogState,
  PendingAction,
  RouteTrace,
} from "../types";
import { StoreError, readCollection, writeCollection } from "./index";

/** 卖家（客服）固定名字，见 CONTRACTS 通用约定。 */
export const SELLER_NAME = "阿栖";

const CONVERSATIONS = "conversations";
const MESSAGES = "messages";
const TRACES = "traces";
const PENDING_ACTIONS = "pending_actions";
const MISFIRE_MARKS = "misfire_marks";

/** 业务错误（找不到 / 状态冲突），API 层转成 4xx。 */
export class ConversationError extends Error {
  constructor(
    public code: "NOT_FOUND" | "CONFLICT",
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ConversationError";
  }
}

// ───────────────────────── 内部小工具 ─────────────────────────

/** 读集合；seed / runtime 都不存在时当作空集合（这几个集合本来就没有 seed）。 */
function readOrEmpty<T>(name: string): T[] {
  try {
    return readCollection<T>(name);
  } catch (err) {
    if (err instanceof StoreError && err.message.includes("not found")) return [];
    throw err;
  }
}

const emptyState = (): DialogState => ({
  currentTask: null,
  slots: {},
  history: [],
  turnCount: 0,
  unresolvedTurns: 0,
  riskFlags: [],
});

const time = (iso: string | undefined) => (iso ? Date.parse(iso) : 0);

/** 预览文字：压成一行并截断。 */
const preview = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 60);

// ───────────────────────── 会话 ─────────────────────────

/** 新建会话：id 自动生成（C1001、C1002…），可用 init 覆盖其它字段（种子流量会用到）。 */
export function createConversation(
  buyerId: string,
  init: Partial<Omit<Conversation, "buyerId">> = {},
): Conversation {
  const all = readOrEmpty<Conversation>(CONVERSATIONS);
  const maxNo = all.reduce((max, c) => Math.max(max, Number(/^C(\d+)(?:-|$)/.exec(c.id)?.[1]) || 0), 1000);
  const t = nowIso();
  const conversation: Conversation = {
    id: `C${maxNo + 1}${currentVisitor() ? `-${currentVisitor()!.sid}` : ''}`,
    mode: "ai",
    status: "ai_active",
    riskFlags: [],
    tags: [],
    state: emptyState(),
    createdAt: t,
    updatedAt: t,
    lastMessagePreview: "",
    unreadForSeller: 0,
    ...init,
    buyerId,
  };
  writeCollection(CONVERSATIONS, [...all, conversation]);
  return conversation;
}

/** 按 id 取会话，不存在返回 undefined。 */
export function getConversation(id: string): Conversation | undefined {
  return readOrEmpty<Conversation>(CONVERSATIONS).find((c) => c.id === id);
}

/** 更新会话字段（浅合并，不会自动改 updatedAt）；不存在返回 undefined。 */
export function updateConversation(
  id: string,
  patch: Partial<Omit<Conversation, "id">>,
): Conversation | undefined {
  const all = readOrEmpty<Conversation>(CONVERSATIONS);
  const index = all.findIndex((c) => c.id === id);
  if (index < 0) return undefined;
  const next: Conversation = { ...all[index], ...patch, id };
  const copy = [...all];
  copy[index] = next;
  writeCollection(CONVERSATIONS, copy);
  return next;
}

/** 会话列表，排序按 CONTRACTS §3：waiting_human 最前（等得最久的在最上），其次 human_active，其余 updatedAt 倒序。默认不含模拟会话。 */
export function listConversations(
  opts: { status?: ConversationStatus; includeSimulated?: boolean } = {},
): Conversation[] {
  const rank = (c: Conversation) => (c.status === "waiting_human" ? 0 : c.status === "human_active" ? 1 : 2);
  return readOrEmpty<Conversation>(CONVERSATIONS)
    .filter((c) => (opts.status ? c.status === opts.status : true))
    .filter((c) => opts.includeSimulated || !c.isSimulated)
    .sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (ra === 0) return time(a.handoffAt ?? a.updatedAt) - time(b.handoffAt ?? b.updatedAt);
      return time(b.updatedAt) - time(a.updatedAt);
    });
}

/** 买家最近一次未关闭的会话（不含模拟会话），没有则 undefined。 */
export function getLatestOpenConversation(buyerId: string): Conversation | undefined {
  return readOrEmpty<Conversation>(CONVERSATIONS)
    .filter((c) => c.buyerId === buyerId && c.status !== "closed" && !c.isSimulated)
    .sort((a, b) => time(b.updatedAt) - time(a.updatedAt) || b.id.localeCompare(a.id))[0];
}

// ───────────────────────── 消息 ─────────────────────────

/** 写入消息时的入参：id / createdAt 可省略（自动生成）；conversationId 由函数参数决定。 */
export type NewMessage = Omit<ChatMessage, "id" | "conversationId" | "createdAt"> &
  Partial<Pick<ChatMessage, "id" | "createdAt">>;

/**
 * 给会话追加消息（按给定顺序），返回补全 id / createdAt 后的消息。
 * 同时更新会话的 updatedAt 和 lastMessagePreview；会话处于人工模式时，每条买家消息让 unreadForSeller +1。
 * 会话不存在抛 ConversationError(NOT_FOUND)。
 */
export function appendMessages(conversationId: string, messages: NewMessage[]): ChatMessage[] {
  const conversation = getConversation(conversationId);
  if (!conversation) throw new ConversationError("NOT_FOUND", "没有找到这个会话", 404);
  if (messages.length === 0) return [];

  const all = readOrEmpty<ChatMessage>(MESSAGES);
  let seq = all.reduce((n, m) => (m.conversationId === conversationId ? n + 1 : n), 0);
  const stored: ChatMessage[] = messages.map((m) => {
    seq += 1;
    return {
      ...m,
      id: m.id ?? `${conversationId}-M${seq}`,
      conversationId,
      createdAt: m.createdAt ?? nowIso(),
    };
  });
  writeCollection(MESSAGES, [...all, ...stored]);

  const last = stored[stored.length - 1];
  const buyerCount = stored.filter((m) => m.role === "buyer").length;
  updateConversation(conversationId, {
    updatedAt: last.createdAt,
    lastMessagePreview: preview(last.text),
    unreadForSeller: conversation.unreadForSeller + (conversation.mode === "human" ? buyerCount : 0),
  });
  return stored;
}

/** 会话的消息（时间正序）。after 为消息 id：只返回它之后的；找不到该 id 就返回全部。确认卡片里的 PendingAction 会回填成最新状态。 */
export function listMessages(conversationId: string, opts: { after?: string } = {}): ChatMessage[] {
  let list = readOrEmpty<ChatMessage>(MESSAGES).filter((m) => m.conversationId === conversationId);
  if (opts.after) {
    const index = list.findIndex((m) => m.id === opts.after);
    if (index >= 0) list = list.slice(index + 1);
  }
  return withLivePendingActions(list);
}

/** CONTRACTS §2 补充约定第 2 条：confirm 卡片以 pending_actions 里的最新状态为准；集合不存在时原样返回。 */
function withLivePendingActions(messages: ChatMessage[]): ChatMessage[] {
  if (!messages.some((m) => m.card?.kind === "confirm")) return messages;
  const latest = new Map(readOrEmpty<PendingAction>(PENDING_ACTIONS).map((p) => [p.id, p]));
  return messages.map((m) => {
    if (m.card?.kind !== "confirm") return m;
    const fresh = latest.get(m.card.pendingAction.id);
    return fresh ? { ...m, card: { kind: "confirm", pendingAction: fresh } } : m;
  });
}

/** 某个会话关联的 PendingAction（会话详情用）。 */
export function listPendingActions(conversationId: string): PendingAction[] {
  return readOrEmpty<PendingAction>(PENDING_ACTIONS).filter((p) => p.conversationId === conversationId);
}

// ───────────────────────── RouteTrace ─────────────────────────

/** 写入一条 RouteTrace（id 可省略，自动生成 C1001-T3），并把会话的 lastLayer 更新为这条的 layer。 */
export function appendTrace(trace: Omit<RouteTrace, "id"> & { id?: string }): RouteTrace {
  const all = readOrEmpty<RouteTrace>(TRACES);
  const seq = all.reduce((n, t) => (t.conversationId === trace.conversationId ? n + 1 : n), 0) + 1;
  const stored: RouteTrace = { ...trace, id: trace.id ?? `${trace.conversationId}-T${seq}` };
  writeCollection(TRACES, [...all, stored]);
  if (getConversation(stored.conversationId)) {
    updateConversation(stored.conversationId, { lastLayer: stored.layer });
  }
  return stored;
}

/** 按 id 取一条 trace。 */
export function getTrace(id: string): RouteTrace | undefined {
  return readOrEmpty<RouteTrace>(TRACES).find((t) => t.id === id);
}

/** 查询 trace：按会话、起始时间（含）过滤，按 at 升序；includeSimulated 默认 true（看板默认含模拟数据）。 */
export function listTraces(
  opts: { conversationId?: string; since?: string; includeSimulated?: boolean } = {},
): RouteTrace[] {
  const since = opts.since ? Date.parse(opts.since) : undefined;
  const includeSimulated = opts.includeSimulated ?? true;
  return readOrEmpty<RouteTrace>(TRACES)
    .filter((t) => (opts.conversationId ? t.conversationId === opts.conversationId : true))
    .filter((t) => (since === undefined ? true : Date.parse(t.at) >= since))
    .filter((t) => includeSimulated || !t.isSimulated)
    .sort((a, b) => time(a.at) - time(b.at));
}

/** 按 id 取一条消息（看板低置信度样本要拿到买家原话）。 */
export function getMessage(id: string): ChatMessage | undefined {
  return readOrEmpty<ChatMessage>(MESSAGES).find((m) => m.id === id);
}

/**
 * 种子流量专用（T17）：整体替换"模拟历史数据"——先删掉旧的模拟会话 / 消息 / trace，再写入新的；
 * 演示中产生的真实会话（isSimulated 不为 true）原样保留。
 */
export function replaceSimulatedHistory(data: {
  conversations: Conversation[];
  messages: ChatMessage[];
  traces: RouteTrace[];
}): void {
  if (publicDemo() && !currentVisitor()) {
    writeCollection('simulated_conversations', data.conversations);
    writeCollection('simulated_messages', data.messages);
    writeCollection('simulated_traces', data.traces);
    return;
  }
  const oldConversations = readOrEmpty<Conversation>(CONVERSATIONS);
  const simulatedIds = new Set(oldConversations.filter((c) => c.isSimulated).map((c) => c.id));
  writeCollection(CONVERSATIONS, [...oldConversations.filter((c) => !c.isSimulated), ...data.conversations]);
  writeCollection(MESSAGES, [
    ...readOrEmpty<ChatMessage>(MESSAGES).filter((m) => !simulatedIds.has(m.conversationId)),
    ...data.messages,
  ]);
  writeCollection(TRACES, [...readOrEmpty<RouteTrace>(TRACES).filter((t) => !t.isSimulated), ...data.traces]);
}

/** 这条 trace 是否已被卖家标记过误判（防止重复点击重复计数）。 */
export function isMisfireMarked(traceId: string): boolean {
  return readOrEmpty<{ id: string }>(MISFIRE_MARKS).some((m) => m.id === traceId);
}

/** 记录「这条 trace 已标记误判」。 */
export function markMisfire(traceId: string): void {
  writeCollection(MISFIRE_MARKS, [...readOrEmpty<{ id: string; at: string }>(MISFIRE_MARKS), { id: traceId, at: nowIso() }]);
}

// ───────────────────────── 卖家操作（CONTRACTS §3 + §2 补充约定第 4 条） ─────────────────────────

function requireConversation(id: string): Conversation {
  const c = getConversation(id);
  if (!c) throw new ConversationError("NOT_FOUND", "没有找到这个会话", 404);
  if (currentVisitor() && c.isSimulated) throw new ConversationError('CONFLICT', '模拟历史会话为只读，请体验自己的客服会话', 409);
  return c;
}

/** 往 state.history 追加一条动作记录（最多保留 10 条，最新在后）。 */
function withHistory(c: Conversation, name: string, summary: string): DialogState {
  const history = [...c.state.history, { type: "seller_reply" as const, name, at: nowIso(), summary }];
  return { ...c.state, history: history.slice(-10) };
}

/** 读取会话详情并把 unreadForSeller 归零（卖家打开会话 = 已读）。 */
export function openConversationForSeller(id: string) {
  const c = getConversation(id);
  if (!c) throw new ConversationError('NOT_FOUND', '没有找到这个会话', 404);
  const conversation = c.unreadForSeller ? updateConversation(id, { unreadForSeller: 0 })! : c;
  return {
    conversation,
    messages: listMessages(id),
    traces: listTraces({ conversationId: id }),
    pendingActions: listPendingActions(id),
  };
}

/** 卖家接管：mode=human、status=human_active、assignee=阿栖，并向买家插入系统消息。已结束的会话不能接管（409）。 */
export function takeoverConversation(id: string): Conversation {
  const c = requireConversation(id);
  if (c.status === "closed") throw new ConversationError("CONFLICT", "会话已结束，不能接管", 409);
  if (c.mode === "human" && c.status === "human_active") return c;
  appendMessages(id, [{ role: "system", text: `人工客服 ${SELLER_NAME} 已接入` }]);
  return updateConversation(id, {
    mode: "human",
    status: "human_active",
    assignee: SELLER_NAME,
    state: withHistory(c, SELLER_NAME, `${SELLER_NAME}接管了会话`),
  })!;
}

/** 卖家回复：插入 role=seller 的消息；尚未接管则自动接管；已结束的会话不能回复（409）。 */
export function replyAsSeller(id: string, text: string): ChatMessage {
  const c = requireConversation(id);
  if (c.status === "closed") throw new ConversationError("CONFLICT", "会话已结束，不能回复", 409);
  const current = c.mode === "human" && c.status === "human_active" ? c : takeoverConversation(id);
  const [message] = appendMessages(id, [{ role: "seller", text }]);
  updateConversation(id, { state: withHistory(current, SELLER_NAME, `${SELLER_NAME}回复：${text.slice(0, 30)}`) });
  return message;
}

/** 交还 AI：mode=ai、status=ai_active，清空 handoffAt / assignee / unreadForSeller，unresolvedTurns 归零，插入系统消息。已结束的会话 409。 */
export function releaseConversation(id: string): Conversation {
  const c = requireConversation(id);
  if (c.status === "closed") throw new ConversationError("CONFLICT", "会话已结束，不能交还 AI", 409);
  appendMessages(id, [{ role: "system", text: "已切换回智能客服" }]);
  return updateConversation(id, {
    mode: "ai",
    status: "ai_active",
    assignee: undefined,
    handoffAt: undefined,
    unreadForSeller: 0,
    state: { ...c.state, unresolvedTurns: 0 },
  })!;
}

/** 结束会话：status=closed、mode=ai。 */
export function closeConversation(id: string): Conversation {
  requireConversation(id);
  return updateConversation(id, { status: "closed", mode: "ai", updatedAt: nowIso() })!;
}
