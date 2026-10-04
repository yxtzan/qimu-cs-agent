/**
 * 前端调用后端 API 的唯一入口（docs/CONTRACTS.md）。
 *
 * - 类型一律来自 lib/types.ts。
 * - Mock 开关：`NEXT_PUBLIC_USE_MOCK`。设为 "1" 使用本地 mock；设为 "0" 或不设置时走真实后端
 *   （T15，见 docs/questions/T10-1.md）。演示机在 .env.local 里显式写 0 或 1。
 * - 商城（CONTRACTS §1）、买家聊天（§2，T12）、卖家会话（§3，T11）、知识库（§4）和规则（§5）（T13）、看板 / 评测（§6，T14）已实现（mock + 真实 fetch）；
 *   演示管理 resetDemo（设置页）也已实现；其余接口只写好了签名，调用会抛 `Error("not implemented: <函数名>")`，由后续任务填实现。
 * - 失败统一抛 `ApiError`（带 code / status，message 为中文，可直接展示）。
 */
import type {
  Buyer,
  ChatAction,
  ChatMessage,
  Conversation,
  ConversationStatus,
  Coupon,
  EvalReport,
  KbChunk,
  KbDoc,
  KbSearchHit,
  Order,
  OrderStatus,
  PendingAction,
  Product,
  ProductCategory,
  RoutingAnalytics,
  RouteTrace,
  Rule,
} from "@/lib/types";
import {
  MockApiError,
  mockGetBuyers,
  mockGetCoupons,
  mockGetOrder,
  mockGetOrders,
  mockGetProduct,
  mockGetProducts,
} from "@/lib/mock";
import {
  mockCreateRule,
  mockDeleteKbDoc,
  mockDeleteRule,
  mockGetKbChunks,
  mockImportKbDoc,
  mockListKbDocs,
  mockListRules,
  mockSearchKb,
  mockUpdateRule,
} from "@/lib/mock/admin";
import { mockGetLatestEval, mockGetRoutingAnalytics } from "@/lib/mock/analytics";
import { mockRead, mockReadClearingUnread, mockWrite, resetMockData } from "@/lib/mock/sync";
import { mockGetConversationMessages, mockGetLatestConversation, mockSendChat } from "@/lib/mock/chat";
import {
  mockClose,
  mockGetConversationDetail,
  mockListConversations,
  mockMarkMisfire,
  mockReply,
  mockRelease,
  mockTakeover,
} from "@/lib/mock/seller";

// ───────────────────────── 基础设施 ─────────────────────────

export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "1";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function viaMock<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof MockApiError) throw new ApiError(e.code, e.message, e.status);
    throw e;
  }
}

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
    });
  } catch {
    throw new ApiError("NETWORK", "网络开小差了，请稍后再试", 0);
  }
  if (!res.ok) {
    let code = "UNKNOWN";
    let message = "服务暂时不可用，请稍后再试";
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      if (body.error?.code) code = body.error.code;
      if (body.error?.message) message = body.error.message;
    } catch {
      /* 非 JSON 响应，沿用默认文案 */
    }
    throw new ApiError(code, message, res.status);
  }
  return (await res.json()) as T;
}

function notImplemented(name: string): never {
  throw new Error(`not implemented: ${name}`);
}

// ───────────────────────── 内部请求 / 响应类型（契约里以内联形式给出） ─────────────────────────

export interface ChatRequest {
  buyerId: string;
  conversationId?: string;
  text?: string;
  action?: ChatAction;
  context?: { orderId?: string; productId?: string; page?: "home" | "product" | "orders" | "order_detail" };
  debug?: boolean;
}

export interface ChatResponse {
  conversation: Conversation;
  messages: ChatMessage[];
  trace?: RouteTrace;
}

export interface ConversationDetail {
  conversation: Conversation;
  messages: ChatMessage[];
  traces: RouteTrace[];
  pendingActions: PendingAction[];
}

export type KbImportInput = { file: File; title?: string } | { title: string; content: string };

export type RuleInput = Omit<Rule, "id" | "hitCount" | "misfireCount" | "lastHitAt" | "createdAt" | "suggestion">;
export type RulePatch = Partial<Pick<Rule, "name" | "pattern" | "intent" | "maxLen" | "enabled">>;

export interface SellerAssistantResponse {
  text: string;
  steps: { tool: string; summary: string }[];
  csv?: { filename: string; content: string };
}

// ───────────────────────── 1. 商城（买家端）— 已实现 ─────────────────────────

/** GET /api/buyers */
export function getBuyers(): Promise<Buyer[]> {
  if (USE_MOCK) return viaMock(() => mockGetBuyers());
  return http<Buyer[]>("/api/buyers");
}

/** GET /api/products?category=&q= */
export function getProducts(params: { category?: ProductCategory; q?: string } = {}): Promise<Product[]> {
  if (USE_MOCK) return viaMock(() => mockGetProducts(params));
  return http<Product[]>(`/api/products${qs(params)}`);
}

/** GET /api/products/:id */
export function getProduct(id: string): Promise<Product> {
  if (USE_MOCK) return viaMock(() => mockGetProduct(id));
  return http<Product>(`/api/products/${encodeURIComponent(id)}`);
}

/** GET /api/orders?buyerId=&status= */
export function getOrders(buyerId: string, status?: OrderStatus): Promise<Order[]> {
  if (USE_MOCK) return viaMock(() => mockGetOrders(buyerId, status));
  return http<Order[]>(`/api/orders${qs({ buyerId, status })}`);
}

/** GET /api/orders/:id?buyerId=  （订单不属于该买家 → 403） */
export function getOrder(id: string, buyerId: string): Promise<Order> {
  if (USE_MOCK) return viaMock(() => mockGetOrder(id, buyerId));
  return http<Order>(`/api/orders/${encodeURIComponent(id)}${qs({ buyerId })}`);
}

/** GET /api/coupons?buyerId= */
export function getCoupons(buyerId: string): Promise<Coupon[]> {
  if (USE_MOCK) return viaMock(() => mockGetCoupons(buyerId));
  return http<Coupon[]>(`/api/coupons${qs({ buyerId })}`);
}

// ───────────────────────── 2. 客服聊天（买家端）— T12 已实现（mock + 真实 fetch） ─────────────────────────

/** POST /api/chat */
export function sendChat(req: ChatRequest): Promise<ChatResponse> {
  if (USE_MOCK) return viaMock(() => mockWrite(() => mockSendChat(req)));
  return http<ChatResponse>("/api/chat", { method: "POST", body: JSON.stringify(req) });
}

/** GET /api/conversations/:id/messages?after= */
export function getConversationMessages(
  conversationId: string,
  after?: string,
): Promise<{ messages: ChatMessage[]; conversation: Conversation }> {
  if (USE_MOCK) return viaMock(() => mockRead(() => mockGetConversationMessages(conversationId, after)));
  return http(`/api/conversations/${encodeURIComponent(conversationId)}/messages${qs({ after })}`);
}

/** GET /api/conversations/latest?buyerId= */
export function getLatestConversation(
  buyerId: string,
): Promise<{ conversation: Conversation | null; messages: ChatMessage[] }> {
  if (USE_MOCK) return viaMock(() => mockRead(() => mockGetLatestConversation(buyerId)));
  return http(`/api/conversations/latest${qs({ buyerId })}`);
}

// ───────────────────────── 3. 卖家端 — 会话部分 T11 已实现（mock + 真实 fetch） ─────────────────────────

/** GET /api/conversations?status=&includeSimulated= */
export function listConversations(params: { status?: ConversationStatus; includeSimulated?: boolean } = {}): Promise<Conversation[]> {
  if (USE_MOCK) return viaMock(() => mockRead(() => mockListConversations(params)));
  return http<Conversation[]>(
    `/api/conversations${qs({ status: params.status, includeSimulated: params.includeSimulated ? 1 : undefined })}`,
  );
}

/** GET /api/conversations/:id （读取后 unreadForSeller 归零） */
export function getConversationDetail(id: string): Promise<ConversationDetail> {
  if (USE_MOCK) return viaMock(() => mockReadClearingUnread(id, () => mockGetConversationDetail(id)));
  return http<ConversationDetail>(`/api/conversations/${encodeURIComponent(id)}`);
}

/** POST /api/conversations/:id/takeover */
export function takeoverConversation(id: string): Promise<Conversation> {
  if (USE_MOCK) return viaMock(() => mockWrite(() => mockTakeover(id)));
  return http<Conversation>(`/api/conversations/${encodeURIComponent(id)}/takeover`, { method: "POST" });
}

/** POST /api/conversations/:id/reply */
export function replyConversation(id: string, text: string): Promise<ChatMessage> {
  if (USE_MOCK) return viaMock(() => mockWrite(() => mockReply(id, text)));
  return http<ChatMessage>(`/api/conversations/${encodeURIComponent(id)}/reply`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

/** POST /api/conversations/:id/release */
export function releaseConversation(id: string): Promise<Conversation> {
  if (USE_MOCK) return viaMock(() => mockWrite(() => mockRelease(id)));
  return http<Conversation>(`/api/conversations/${encodeURIComponent(id)}/release`, { method: "POST" });
}

/** POST /api/conversations/:id/close */
export function closeConversation(id: string): Promise<Conversation> {
  if (USE_MOCK) return viaMock(() => mockWrite(() => mockClose(id)));
  return http<Conversation>(`/api/conversations/${encodeURIComponent(id)}/close`, { method: "POST" });
}

/** POST /api/traces/:id/misfire （P1） */
export function markTraceMisfire(traceId: string): Promise<RouteTrace> {
  if (USE_MOCK) return viaMock(() => mockRead(() => mockMarkMisfire(traceId)));
  return http<RouteTrace>(`/api/traces/${encodeURIComponent(traceId)}/misfire`, { method: "POST" });
}

// ───────────────────────── 4. 知识库 — T13 已实现（mock + 真实 fetch） ─────────────────────────

/** GET /api/kb */
export function listKbDocs(): Promise<KbDoc[]> {
  if (USE_MOCK) return viaMock(() => mockListKbDocs());
  return http<KbDoc[]>("/api/kb");
}

/** POST /api/kb/import （multipart 上传文件，或 JSON 粘贴文本） */
export async function importKbDoc(input: KbImportInput): Promise<KbDoc> {
  if (USE_MOCK) {
    if ("file" in input) {
      const content = await input.file.text();
      const fallbackTitle = input.file.name.replace(/\.(md|txt)$/i, "");
      return viaMock(() => mockImportKbDoc({ title: input.title, content, source: "upload", fallbackTitle }));
    }
    return viaMock(() => mockImportKbDoc({ title: input.title, content: input.content, source: "paste" }));
  }
  if ("file" in input) {
    const form = new FormData();
    form.append("file", input.file);
    if (input.title) form.append("title", input.title);
    return http<KbDoc>("/api/kb/import", { method: "POST", body: form });
  }
  return http<KbDoc>("/api/kb/import", {
    method: "POST",
    body: JSON.stringify({ title: input.title, content: input.content }),
  });
}

/** DELETE /api/kb/:id */
export function deleteKbDoc(id: string): Promise<{ ok: true }> {
  if (USE_MOCK) return viaMock(() => mockDeleteKbDoc(id));
  return http<{ ok: true }>(`/api/kb/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** GET /api/kb/:id/chunks */
export function getKbChunks(id: string): Promise<KbChunk[]> {
  if (USE_MOCK) return viaMock(() => mockGetKbChunks(id));
  return http<KbChunk[]>(`/api/kb/${encodeURIComponent(id)}/chunks`);
}

/** POST /api/kb/search */
export function searchKb(query: string, topK?: number): Promise<KbSearchHit[]> {
  if (USE_MOCK) return viaMock(() => mockSearchKb(query, topK));
  return http<KbSearchHit[]>("/api/kb/search", { method: "POST", body: JSON.stringify({ query, topK }) });
}

// ───────────────────────── 5. 规则 — T13 已实现（mock + 真实 fetch） ─────────────────────────

/** GET /api/rules */
export function listRules(): Promise<Rule[]> {
  if (USE_MOCK) return viaMock(() => mockRead(() => mockListRules()));
  return http<Rule[]>("/api/rules");
}

/** POST /api/rules （pattern 非法正则 → 400） */
export function createRule(input: RuleInput): Promise<Rule> {
  if (USE_MOCK) return viaMock(() => mockWrite(() => mockCreateRule(input)));
  return http<Rule>("/api/rules", { method: "POST", body: JSON.stringify(input) });
}

/** PATCH /api/rules/:id */
export function updateRule(id: string, patch: RulePatch): Promise<Rule> {
  if (USE_MOCK) return viaMock(() => mockWrite(() => mockUpdateRule(id, patch)));
  return http<Rule>(`/api/rules/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
}

/** DELETE /api/rules/:id */
export function deleteRule(id: string): Promise<{ ok: true }> {
  if (USE_MOCK) return viaMock(() => mockWrite(() => mockDeleteRule(id)));
  return http<{ ok: true }>(`/api/rules/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ───────────────────────── 6. 看板 / 评测 ─────────────────────────

/** GET /api/analytics/routing?range=today|7d&includeSimulated=1 */
export function getRoutingAnalytics(range: "today" | "7d", includeSimulated = true): Promise<RoutingAnalytics> {
  if (USE_MOCK) return viaMock(() => mockRead(() => mockGetRoutingAnalytics(range, includeSimulated)));
  return http<RoutingAnalytics>(`/api/analytics/routing${qs({ range, includeSimulated: includeSimulated ? 1 : 0 })}`);
}

/** GET /api/eval/latest */
export function getLatestEval(): Promise<EvalReport | null> {
  if (USE_MOCK) return viaMock(() => mockGetLatestEval());
  return http<EvalReport | null>("/api/eval/latest");
}

// ───────────────────────── 7. 演示管理 ─────────────────────────

/** POST /api/admin/reset */
export function resetDemo(): Promise<{ ok: true }> {
  if (USE_MOCK) {
    return viaMock(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400)); // 让「重置中…」状态能被看到
      resetMockData();
      return { ok: true as const };
    });
  }
  return http<{ ok: true }>("/api/admin/reset", { method: "POST" });
}

// ───────────────────────── 8. 店铺 AI 助手（P1） ─────────────────────────

/** POST /api/seller/assistant */
export function askSellerAssistant(message: string): Promise<SellerAssistantResponse> {
  void message;
  return notImplemented("askSellerAssistant");
}
