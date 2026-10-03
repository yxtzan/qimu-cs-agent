import type {
  ActionRecord,
  ConversationStatus,
  DialogState,
  IntentId,
  Layer,
  PendingAction,
  RiskKey,
  Slots,
  Stage,
} from "@/lib/types";

/** 意图中文名（docs/ARCHITECTURE.md §4.1 的 20 个意图）。 */
export const INTENT_LABEL: Record<IntentId, string> = {
  product_consult: "商品咨询",
  size_recommend: "尺码推荐",
  stock_check: "库存查询",
  promotion: "优惠活动",
  shipping_policy: "运费与发货规则",
  order_status: "订单状态",
  logistics_track: "查物流",
  urge_shipping: "催发货",
  modify_order: "修改订单",
  cancel_order: "取消订单",
  refund_apply: "申请退款",
  refund_progress: "退款进度",
  exchange: "申请换货",
  quality_issue: "质量问题",
  return_policy: "退换货政策",
  invoice: "发票",
  human_request: "要求人工",
  greeting: "打招呼",
  multi_step_complex: "多步复杂请求",
  other: "其他",
};

export const STAGE_LABEL: Record<Stage, string> = {
  presale: "售前",
  insale: "售中",
  aftersale: "售后",
  other: "其他",
};

export function intentLabel(id: IntentId | undefined | null): string {
  return id ? (INTENT_LABEL[id] ?? id) : "—";
}

export const RISK_LABEL: Record<RiskKey, string> = {
  legal_threat: "投诉威胁",
  health_safety: "健康安全",
  fraud_security: "账号安全",
  abuse_extreme: "言辞激烈",
  emotion: "情绪激动",
};

/** 层级标签配色（PRD §7：风险闸门=橙、L1=灰蓝、L2=墨绿、L3=紫、人工=红）。 */
export const LAYER_META: Record<Layer, { label: string; className: string; dot: string }> = {
  risk_gate: { label: "风险闸门", className: "bg-orange-50 text-orange-700 ring-orange-200", dot: "bg-orange-500" },
  L1: { label: "L1 规则层", className: "bg-slate-100 text-slate-600 ring-slate-200", dot: "bg-slate-400" },
  L2: { label: "L2 上下文层", className: "bg-brand-soft text-brand ring-brand/20", dot: "bg-brand" },
  L3: { label: "L3 大模型", className: "bg-purple-50 text-purple-700 ring-purple-200", dot: "bg-purple-500" },
  human: { label: "人工", className: "bg-red-50 text-red-700 ring-red-200", dot: "bg-red-500" },
  action: { label: "动作确认", className: "bg-stone-100 text-stone-600 ring-stone-200", dot: "bg-stone-400" },
};

export const CONVERSATION_STATUS_LABEL: Record<ConversationStatus, string> = {
  ai_active: "AI 处理中",
  waiting_human: "待人工",
  human_active: "人工处理中",
  closed: "已结束",
};

export const CONVERSATION_STATUS_CLASS: Record<ConversationStatus, string> = {
  ai_active: "bg-brand-soft text-brand",
  waiting_human: "bg-red-50 text-red-700",
  human_active: "bg-sky-50 text-sky-700",
  closed: "bg-stone-100 text-stone-500",
};

export const TASK_STATUS_LABEL: Record<NonNullable<DialogState["currentTask"]>["status"], string> = {
  collecting: "收集信息中",
  awaiting_confirm: "等待买家确认",
  done: "已完成",
};

export const SLOT_LABEL: Record<keyof Slots, string> = {
  orderId: "订单号",
  itemId: "订单商品",
  productId: "商品",
  size: "尺码",
  color: "颜色",
  heightCm: "身高",
  weightKg: "体重",
  reason: "原因",
  address: "新地址",
};

export function formatSlotValue(key: keyof Slots, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (key === "heightCm") return `${value} cm`;
  if (key === "weightKg") return `${value} kg`;
  if (key === "address" && typeof value === "object") {
    const a = value as Record<string, string | undefined>;
    return [a.name, a.phone, a.region, a.detail].filter(Boolean).join(" ") || "—";
  }
  return String(value);
}

export const ACTION_TYPE_META: Record<ActionRecord["type"], { label: string; className: string }> = {
  intent: { label: "识别意图", className: "bg-brand-soft text-brand" },
  tool_call: { label: "调用工具", className: "bg-purple-50 text-purple-700" },
  pending_action: { label: "待确认操作", className: "bg-amber-50 text-amber-700" },
  confirm: { label: "买家确认", className: "bg-green-50 text-success" },
  cancel: { label: "买家取消", className: "bg-stone-100 text-stone-600" },
  handoff: { label: "转人工", className: "bg-red-50 text-red-700" },
  seller_reply: { label: "人工回复", className: "bg-sky-50 text-sky-700" },
};

export const PENDING_STATUS_LABEL: Record<PendingAction["status"], string> = {
  pending: "待买家确认",
  confirmed: "已确认执行",
  cancelled: "已取消",
  failed: "执行失败",
};

export const TOOL_LABEL: Record<string, string> = {
  list_orders: "查订单列表",
  get_order: "查订单",
  track_logistics: "查物流",
  get_aftersale: "查售后单",
  search_products: "搜商品",
  get_product: "查商品",
  check_stock: "查库存",
  recommend_size: "推荐尺码",
  list_coupons: "查优惠券",
  search_kb: "检索知识库",
  apply_refund: "申请退款",
  request_exchange: "申请换货",
  modify_address: "修改地址",
  cancel_order: "取消订单",
  create_handoff: "转人工",
};
