/**
 * 契约类型 —— 前后端唯一约定。
 * 维护者：Claude（总指挥）。Agent 不得修改，变更请求写 docs/QUESTIONS.md。
 * 所有时间字段为 ISO 8601 字符串（带 +08:00），所有金额单位为「元」（number，两位小数）。
 */

// ───────────────────────── 商品 ─────────────────────────

export type ProductCategory = "连衣裙" | "上衣" | "针织衫" | "外套" | "裤装" | "半身裙";
export type Size = "XS" | "S" | "M" | "L" | "XL";
export type Fit = "修身" | "标准" | "宽松";

export interface Sku {
  skuId: string; // 例 "P012-OAT-M"
  color: string; // 例 "燕麦色"
  size: Size;
  stock: number;
  restockDate?: string; // 缺货时的预计补货日期
}

export interface Product {
  id: string; // 例 "P012"
  name: string;
  category: ProductCategory;
  price: number;
  originalPrice?: number;
  colors: string[];
  sizes: Size[];
  fit: Fit;
  material: string; // 例 "羊毛 70% 锦纶 30%"
  care: string; // 洗护说明
  description: string;
  highlights: string[];
  images: string[];
  sales: number;
  rating: number; // 0–5
  skus: Sku[];
  tags: string[]; // 例 ["新品", "通勤"]
}

// ───────────────────────── 买家 / 订单 ─────────────────────────

export interface Address {
  name: string;
  phone: string; // 演示用虚构号码，显示时打码
  region: string; // 例 "浙江省 杭州市 西湖区"
  detail: string;
}

export interface Buyer {
  id: string; // 例 "B003"
  nickname: string;
  avatar: string;
  memberLevel: "普通" | "银卡" | "金卡";
  heightCm?: number;
  weightKg?: number;
  defaultAddress: Address;
}

export type OrderStatus =
  | "pending_payment" // 待付款
  | "paid" // 待发货
  | "shipped" // 已发货
  | "delivered" // 已签收
  | "completed" // 已完成
  | "cancelled"; // 已取消

export interface OrderItem {
  itemId: string; // 例 "QM2026092801-1"
  productId: string;
  productName: string;
  skuId: string;
  color: string;
  size: Size;
  quantity: number;
  unitPrice: number;
  image: string;
}

export interface LogisticsEvent {
  at: string;
  location: string;
  description: string;
}

export interface Logistics {
  carrier: string; // 例 "顺丰速运"
  trackingNo: string;
  status: "awaiting_pickup" | "in_transit" | "out_for_delivery" | "delivered" | "exception";
  estimatedDelivery?: string;
  events: LogisticsEvent[]; // 按时间倒序（最新在前）
}

export type AfterSaleType = "refund_only" | "return_refund" | "exchange";
export type AfterSaleStatus =
  | "pending_review" // 待审核
  | "approved" // 已同意，待买家寄回
  | "returning" // 买家已寄回
  | "refunding" // 退款中
  | "refunded" // 已退款
  | "exchange_shipped" // 换货已发出
  | "rejected" // 已拒绝
  | "closed"; // 已关闭

export interface AfterSale {
  id: string; // 例 "AS20260930001"
  orderId: string;
  itemId: string;
  type: AfterSaleType;
  reason: string; // 买家填写的原因（自由文本）
  reasonCategory?: string; // 归类标签，如 "尺码不合适"（可由 Jev 批量打标）
  amount: number;
  newSize?: Size;
  newColor?: string;
  status: AfterSaleStatus;
  createdAt: string;
  timeline: { at: string; status: AfterSaleStatus; note: string }[];
}

export interface Order {
  id: string; // 例 "QM2026092801"（QM + 10 位数字）
  buyerId: string;
  status: OrderStatus;
  items: OrderItem[];
  totalAmount: number;
  discount: number;
  payAmount: number;
  createdAt: string;
  paidAt?: string;
  shippedAt?: string;
  deliveredAt?: string;
  address: Address;
  logistics?: Logistics;
  afterSales: AfterSale[];
  remark?: string;
}

export interface Coupon {
  id: string;
  buyerId: string;
  title: string; // 例 "满 299 减 30"
  threshold: number;
  discount: number;
  scope: "全店" | ProductCategory;
  expiresAt: string;
  used: boolean;
}

// ───────────────────────── 对话 ─────────────────────────

export type Stage = "presale" | "insale" | "aftersale" | "other";

export type IntentId =
  | "product_consult"
  | "size_recommend"
  | "stock_check"
  | "promotion"
  | "shipping_policy"
  | "order_status"
  | "logistics_track"
  | "urge_shipping"
  | "modify_order"
  | "cancel_order"
  | "refund_apply"
  | "refund_progress"
  | "exchange"
  | "quality_issue"
  | "return_policy"
  | "invoice"
  | "human_request"
  | "greeting"
  | "multi_step_complex"
  | "other";

export type RiskKey = "legal_threat" | "health_safety" | "fraud_security" | "abuse_extreme" | "emotion";

export type Layer = "risk_gate" | "L1" | "L2" | "L3" | "human" | "action";

export type QuickActionType = "track_logistics" | "refund_progress" | "size_recommend" | "human";

export interface Slots {
  orderId?: string;
  itemId?: string;
  productId?: string;
  size?: Size;
  color?: string;
  heightCm?: number;
  weightKg?: number;
  reason?: string;
  address?: Partial<Address>;
}

export interface ActionRecord {
  type: "intent" | "tool_call" | "pending_action" | "confirm" | "cancel" | "handoff" | "seller_reply";
  name: string; // 意图 id / 工具名 / 原因
  at: string;
  summary: string; // 中文一句话，给人看也给模型看
}

export interface DialogState {
  currentTask: {
    intent: IntentId;
    status: "collecting" | "awaiting_confirm" | "done";
    startedAt: string;
  } | null;
  slots: Slots;
  history: ActionRecord[]; // 最多保留 10 条，最新在后
  pendingActionId?: string;
  lastIntent?: IntentId;
  turnCount: number;
  unresolvedTurns: number;
  riskFlags: RiskKey[];
}

export interface PendingAction {
  id: string;
  conversationId: string;
  tool: "apply_refund" | "request_exchange" | "modify_address" | "cancel_order";
  args: Record<string, unknown>;
  summary: string; // 例 "为订单 QM2026092801 的「燕麦色羊毛大衣 M」申请退货退款 ¥599.00"
  status: "pending" | "confirmed" | "cancelled" | "failed";
  createdAt: string;
  resolvedAt?: string;
  result?: string;
}

/** 聊天消息里可渲染的卡片 */
export type ChatCard =
  | { kind: "order"; order: Order }
  | { kind: "logistics"; orderId: string; logistics: Logistics }
  | { kind: "product"; product: Product }
  | { kind: "aftersale"; afterSale: AfterSale }
  | { kind: "confirm"; pendingAction: PendingAction }
  | { kind: "options"; prompt: string; options: { label: string; value: string; sublabel?: string; image?: string }[] }
  | { kind: "size_result"; size: Size; basis: string; productId?: string }
  | { kind: "coupons"; coupons: Coupon[] }
  | { kind: "sources"; sources: { docTitle: string; heading?: string; snippet: string }[] };

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: "buyer" | "ai" | "seller" | "system";
  text: string;
  card?: ChatCard;
  quickReplies?: { label: string; action: ChatAction }[]; // 消息下方的快捷回复
  traceId?: string; // AI 回复对应的 RouteTrace
  createdAt: string;
}

export type ChatAction =
  | { type: "quick_action"; name: QuickActionType }
  | { type: "confirm"; pendingActionId: string; confirm: boolean }
  | { type: "select_option"; value: string } // 回应 options 卡片
  | { type: "text"; text: string }; // 快捷回复里直接发送一句话

export type ConversationStatus = "ai_active" | "waiting_human" | "human_active" | "closed";

export interface Conversation {
  id: string;
  buyerId: string;
  mode: "ai" | "human";
  status: ConversationStatus;
  assignee?: string; // 人工客服名，如 "阿栖"
  handoffReason?: string; // 例 "风险闸门：health_safety 0.93；legal_threat 0.88"
  handoffSummary?: string; // AI 生成的一句话摘要
  handoffAt?: string; // 最近一次进入 waiting_human 的时间；交还 AI 后清空（2026-10-04 加，见 docs/questions/T11-1.md）
  lastLayer?: Layer; // 最近一条买家消息最终由哪一层接住（每写一条 RouteTrace 就更新）
  riskFlags: RiskKey[];
  tags: string[];
  state: DialogState;
  createdAt: string;
  updatedAt: string;
  lastMessagePreview: string;
  unreadForSeller: number;
  isSimulated?: boolean; // 种子流量生成的历史会话
}

// ───────────────────────── 理解层 ─────────────────────────

export interface DecideResult {
  provider: "jev" | "llm" | "mock";
  intent: {
    id: IntentId;
    confidence: number; // 0–1
    probabilities: Partial<Record<IntentId, number>>;
  };
  multiStep: number; // 0–1
  risk: {
    legal_threat: number;
    health_safety: number;
    fraud_security: number;
    abuse_extreme: number;
    emotion: { score: number; confidence: number }; // score 0–3
  };
  latencyMs: number;
  costUsd: number;
  error?: string; // 调用失败时填写，此时其余字段为保守默认值
}

export interface RouteTrace {
  id: string;
  conversationId: string;
  messageId: string; // 买家消息 id
  at: string;
  layer: Layer; // 最终是哪一层"理解并接住"了这条消息
  intent?: IntentId;
  stage?: Stage;
  confidence?: number;
  topIntents?: { id: IntentId; p: number }[]; // 前 3
  decideProvider?: DecideResult["provider"];
  riskScores?: Partial<Record<RiskKey, number>>;
  riskHit?: RiskKey[];
  ruleId?: string; // L1 命中的规则
  escalatedFrom?: Layer; // 例：L3 失败后转人工，escalatedFrom = "L3"
  handoffReason?: string;
  toolCalls: { name: string; ok: boolean; ms: number }[];
  usedGeneration: boolean; // handler 内是否调用了 LLM 生成
  ragHits?: number;
  latency: { totalMs: number; decideMs?: number; handlerMs?: number; agentMs?: number };
  cost: { decideUsd: number; generationUsd: number; agentUsd: number; totalUsd: number; estimated?: boolean };
  isSimulated?: boolean;
}

// ───────────────────────── 规则 / 知识库 ─────────────────────────

export interface Rule {
  id: string; // 例 "R001"
  name: string;
  pattern: string; // 正则字符串
  intent: IntentId;
  maxLen: number; // 消息超过这个字数不走该规则
  enabled: boolean;
  hitCount: number;
  misfireCount: number;
  lastHitAt?: string;
  createdAt: string;
  suggestion?: "keep" | "review" | "delete"; // 后端计算
}

export interface KbDoc {
  id: string;
  title: string;
  source: "seed" | "upload" | "paste";
  chunkCount: number;
  charCount: number;
  createdAt: string;
  indexMode: "embedding" | "bigram";
}

export interface KbChunk {
  id: string;
  docId: string;
  docTitle: string;
  heading?: string;
  text: string;
}

export interface KbSearchHit {
  chunk: KbChunk;
  score: number;
}

// ───────────────────────── 看板 / 评测 ─────────────────────────

export interface RoutingAnalytics {
  range: "today" | "7d";
  includesSimulated: boolean;
  totals: {
    messages: number;
    autoResolvedRate: number; // 0–1
    handoffRate: number; // 0–1
    avgLatencyMs: number;
  };
  byLayer: {
    layer: Layer;
    count: number;
    share: number; // 0–1
    avgLatencyMs: number;
    costPer1kCny: number;
  }[];
  byStage: { stage: Stage; count: number }[];
  byIntent: { intent: IntentId; stage: Stage; count: number }[];
  riskHits: { key: RiskKey; count: number }[];
  lowConfidence: {
    traceId: string;
    conversationId: string;
    text: string;
    intent?: IntentId;
    confidence?: number;
    at: string;
  }[];
  timeseries: { bucket: string; L1: number; L2: number; L3: number; risk_gate: number; human: number }[]; // 按小时(today)或按天(7d)
  latestEval?: EvalReport;
}

export interface EvalReport {
  runAt: string;
  provider: DecideResult["provider"];
  cases: number;
  intentAccuracy: number; // 0–1
  layerAccuracy: number; // 0–1
  riskRecall: number; // 0–1
  riskFalsePositiveRate: number; // 0–1
  avgLatencyMs: number;
  failures: { caseId: string; text: string; expected: string; got: string }[];
}
