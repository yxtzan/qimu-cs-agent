/**
 * 前端调用后端 API 的唯一入口（docs/CONTRACTS.md）。
 *
 * - 类型一律来自 lib/types.ts。
 * - Mock 开关：`NEXT_PUBLIC_USE_MOCK`。设为 "1" 强制使用本地 mock；设为 "0" 强制走真实后端；
 *   不设置时默认使用 mock（后端接口就绪前的过渡约定，后端合并后请在 .env.local 里设 NEXT_PUBLIC_USE_MOCK=0）。
 * - 商城部分（CONTRACTS §1）已实现（mock + 真实 fetch）；其余接口只写好了签名，调用会抛
 *   `Error("not implemented: <函数名>")`，由后续任务（T11/T12/T13…）填实现。
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

// ───────────────────────── 基础设施 ─────────────────────────

export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== "0";

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

// ───────────────────────── 2. 客服聊天（买家端）— T12 实现 ─────────────────────────

/** POST /api/chat */
export function sendChat(req: ChatRequest): Promise<ChatResponse> {
  void req;
  return notImplemented("sendChat");
}

/** GET /api/conversations/:id/messages?after= */
export function getConversationMessages(
  conversationId: string,
  after?: string,
): Promise<{ messages: ChatMessage[]; conversation: Conversation }> {
  void conversationId;
  void after;
  return notImplemented("getConversationMessages");
}

/** GET /api/conversations/latest?buyerId= */
export function getLatestConversation(
  buyerId: string,
): Promise<{ conversation: Conversation | null; messages: ChatMessage[] }> {
  void buyerId;
  return notImplemented("getLatestConversation");
}

// ───────────────────────── 3. 卖家端 — T11/T14/T15 实现 ─────────────────────────

/** GET /api/conversations?status=&includeSimulated= */
export function listConversations(params: { status?: ConversationStatus; includeSimulated?: boolean } = {}): Promise<Conversation[]> {
  void params;
  return notImplemented("listConversations");
}

/** GET /api/conversations/:id （读取后 unreadForSeller 归零） */
export function getConversationDetail(id: string): Promise<ConversationDetail> {
  void id;
  return notImplemented("getConversationDetail");
}

/** POST /api/conversations/:id/takeover */
export function takeoverConversation(id: string): Promise<Conversation> {
  void id;
  return notImplemented("takeoverConversation");
}

/** POST /api/conversations/:id/reply */
export function replyConversation(id: string, text: string): Promise<ChatMessage> {
  void id;
  void text;
  return notImplemented("replyConversation");
}

/** POST /api/conversations/:id/release */
export function releaseConversation(id: string): Promise<Conversation> {
  void id;
  return notImplemented("releaseConversation");
}

/** POST /api/conversations/:id/close */
export function closeConversation(id: string): Promise<Conversation> {
  void id;
  return notImplemented("closeConversation");
}

/** POST /api/traces/:id/misfire （P1） */
export function markTraceMisfire(traceId: string): Promise<RouteTrace> {
  void traceId;
  return notImplemented("markTraceMisfire");
}

// ───────────────────────── 4. 知识库 ─────────────────────────

/** GET /api/kb */
export function listKbDocs(): Promise<KbDoc[]> {
  return notImplemented("listKbDocs");
}

/** POST /api/kb/import （multipart 上传文件，或 JSON 粘贴文本） */
export function importKbDoc(input: KbImportInput): Promise<KbDoc> {
  void input;
  return notImplemented("importKbDoc");
}

/** DELETE /api/kb/:id */
export function deleteKbDoc(id: string): Promise<{ ok: true }> {
  void id;
  return notImplemented("deleteKbDoc");
}

/** GET /api/kb/:id/chunks */
export function getKbChunks(id: string): Promise<KbChunk[]> {
  void id;
  return notImplemented("getKbChunks");
}

/** POST /api/kb/search */
export function searchKb(query: string, topK?: number): Promise<KbSearchHit[]> {
  void query;
  void topK;
  return notImplemented("searchKb");
}

// ───────────────────────── 5. 规则 ─────────────────────────

/** GET /api/rules */
export function listRules(): Promise<Rule[]> {
  return notImplemented("listRules");
}

/** POST /api/rules （pattern 非法正则 → 400） */
export function createRule(input: RuleInput): Promise<Rule> {
  void input;
  return notImplemented("createRule");
}

/** PATCH /api/rules/:id */
export function updateRule(id: string, patch: RulePatch): Promise<Rule> {
  void id;
  void patch;
  return notImplemented("updateRule");
}

/** DELETE /api/rules/:id */
export function deleteRule(id: string): Promise<{ ok: true }> {
  void id;
  return notImplemented("deleteRule");
}

// ───────────────────────── 6. 看板 / 评测 ─────────────────────────

/** GET /api/analytics/routing?range=today|7d&includeSimulated=1 */
export function getRoutingAnalytics(range: "today" | "7d", includeSimulated = true): Promise<RoutingAnalytics> {
  void range;
  void includeSimulated;
  return notImplemented("getRoutingAnalytics");
}

/** GET /api/eval/latest */
export function getLatestEval(): Promise<EvalReport | null> {
  return notImplemented("getLatestEval");
}

// ───────────────────────── 7. 演示管理 ─────────────────────────

/** POST /api/admin/reset */
export function resetDemo(): Promise<{ ok: true }> {
  return notImplemented("resetDemo");
}

// ───────────────────────── 8. 店铺 AI 助手（P1） ─────────────────────────

/** POST /api/seller/assistant */
export function askSellerAssistant(message: string): Promise<SellerAssistantResponse> {
  void message;
  return notImplemented("askSellerAssistant");
}
