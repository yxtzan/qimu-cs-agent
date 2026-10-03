/**
 * 卖家端 mock（CONTRACTS §3）。形状严格符合 lib/types.ts。
 * 会话数据放在模块级变量里，所以「接管 / 交还 AI / 回复 / 结束」在同一次页面会话内会保留；刷新页面后重置。
 * 时间以 DEMO_NOW（2026-10-05 10:00）为"现在"。
 */
import { nowIso } from "@/lib/demo-clock";
import type {
  ActionRecord,
  ChatMessage,
  Conversation,
  DialogState,
  Layer,
  PendingAction,
  RouteTrace,
} from "@/lib/types";
import { MOCK_COUPONS, MOCK_ORDERS } from "./data";
import { MockApiError } from "./index";

// ───────────────────────── helpers ─────────────────────────

/** "10-05 09:38" → "2026-10-05T09:38:00+08:00" */
const at = (md: string) => {
  const [d, t] = md.split(" ");
  return `2026-${d}T${t}:00+08:00`;
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const delay = (ms = 120) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type Role = ChatMessage["role"];

function m(
  conv: string,
  n: number,
  role: Role,
  when: string,
  text: string,
  extra: Partial<Pick<ChatMessage, "card" | "traceId" | "quickReplies">> = {},
): ChatMessage {
  return { id: `${conv}-M${n}`, conversationId: conv, role, text, createdAt: at(when), ...extra };
}

const NO_COST = { decideUsd: 0, generationUsd: 0, agentUsd: 0, totalUsd: 0 };

function tr(
  conv: string,
  n: number,
  messageId: string,
  when: string,
  layer: Layer,
  rest: Partial<RouteTrace> & { totalMs: number },
): RouteTrace {
  const { totalMs, ...fields } = rest;
  return {
    id: `${conv}-T${n}`,
    conversationId: conv,
    messageId,
    at: at(when),
    layer,
    toolCalls: [],
    usedGeneration: false,
    latency: { totalMs },
    cost: NO_COST,
    ...fields,
  };
}

function rec(type: ActionRecord["type"], name: string, when: string, summary: string): ActionRecord {
  return { type, name, at: at(when), summary };
}

const emptyState = (): DialogState => ({
  currentTask: null,
  slots: {},
  history: [],
  turnCount: 0,
  unresolvedTurns: 0,
  riskFlags: [],
});

export interface Seed {
  conversation: Conversation;
  messages: ChatMessage[];
  traces: RouteTrace[];
  pendingActions: PendingAction[];
}

// ───────────────────────── 1. 待人工：健康安全 + 投诉威胁（演示剧本第 4 幕） ─────────────────────────

const C1 = "C1001";
const c1: Seed = {
  conversation: {
    id: C1,
    handoffAt: at("10-05 09:40"),
    buyerId: "B002",
    mode: "ai",
    status: "waiting_human",
    handoffReason: "风险闸门：health_safety 0.93；legal_threat 0.88",
    handoffSummary:
      "买家周雨桐穿着订单 QM2026092902（云感真丝衬衫 象牙白 M）后全身起红疹，并表示不处理就向 12315 投诉；情绪激动，需立即人工安抚并跟进。",
    riskFlags: ["health_safety", "legal_threat"],
    tags: ["高风险", "质量问题"],
    state: {
      currentTask: { intent: "quality_issue", status: "collecting", startedAt: at("10-05 09:40") },
      slots: { orderId: "QM2026092902", productId: "P013", reason: "穿着后全身起红疹" },
      history: [
        rec("intent", "product_consult", "10-05 09:36", "识别为商品咨询（洗护）"),
        rec("tool_call", "search_kb", "10-05 09:36", "检索知识库「洗护指南 · 真丝」，命中 2 段"),
        rec("intent", "quality_issue", "10-05 09:40", "识别为质量问题（风险闸门优先拦截）"),
        rec("handoff", "风险闸门", "10-05 09:40", "health_safety 0.93 · legal_threat 0.88，转人工"),
      ],
      lastIntent: "quality_issue",
      turnCount: 3,
      unresolvedTurns: 0,
      riskFlags: ["health_safety", "legal_threat"],
    },
    createdAt: at("10-05 09:36"),
    updatedAt: at("10-05 09:41"),
    lastMessagePreview: "照片我可以发给你们",
    unreadForSeller: 3,
  },
  messages: [
    m(C1, 1, "buyer", "10-05 09:36", "我昨天收到的那件云感真丝衬衫，怎么洗才不会缩水？"),
    m(
      C1,
      2,
      "ai",
      "10-05 09:36",
      "真丝衬衫建议冷水（≤30°C）轻柔手洗，使用中性洗涤剂，不要拧干，平铺阴干，避免暴晒。收纳时用衣架挂起即可～",
      {
        traceId: `${C1}-T1`,
        card: {
          kind: "sources",
          sources: [{ docTitle: "洗护指南", heading: "真丝", snippet: "真丝面料请冷水手洗，使用中性洗涤剂，切勿拧干或暴晒……" }],
        },
      },
    ),
    m(C1, 3, "buyer", "10-05 09:40", "我穿了半天，脖子和手臂全起红疹了！！你们不处理我就去12315投诉"),
    m(C1, 4, "system", "10-05 09:40", "已为您转接人工客服，阿栖正在赶来", { traceId: `${C1}-T2` }),
    m(C1, 5, "buyer", "10-05 09:41", "有人吗？我现在很难受"),
    m(C1, 6, "buyer", "10-05 09:41", "照片我可以发给你们"),
  ],
  traces: [
    tr(C1, 1, `${C1}-M1`, "10-05 09:36", "L2", {
      totalMs: 612,
      intent: "product_consult",
      stage: "presale",
      confidence: 0.91,
      topIntents: [
        { id: "product_consult", p: 0.91 },
        { id: "return_policy", p: 0.04 },
        { id: "quality_issue", p: 0.02 },
      ],
      decideProvider: "jev",
      riskScores: { legal_threat: 0.01, health_safety: 0.02, fraud_security: 0, abuse_extreme: 0, emotion: 0 },
      toolCalls: [{ name: "search_kb", ok: true, ms: 142 }],
      usedGeneration: true,
      ragHits: 2,
      latency: { totalMs: 612, decideMs: 186, handlerMs: 426 },
      cost: { decideUsd: 0.00002, generationUsd: 0.00009, agentUsd: 0, totalUsd: 0.00011 },
    }),
    tr(C1, 2, `${C1}-M3`, "10-05 09:40", "risk_gate", {
      totalMs: 203,
      intent: "quality_issue",
      stage: "aftersale",
      confidence: 0.86,
      topIntents: [
        { id: "quality_issue", p: 0.86 },
        { id: "refund_apply", p: 0.08 },
        { id: "human_request", p: 0.03 },
      ],
      decideProvider: "jev",
      riskScores: { legal_threat: 0.88, health_safety: 0.93, fraud_security: 0.01, abuse_extreme: 0.12, emotion: 0.8 },
      riskHit: ["health_safety", "legal_threat"],
      handoffReason: "风险闸门：health_safety 0.93；legal_threat 0.88",
      latency: { totalMs: 203, decideMs: 198 },
      cost: { decideUsd: 0.00002, generationUsd: 0, agentUsd: 0, totalUsd: 0.00002 },
    }),
  ],
  pendingActions: [],
};

// ───────────────────────── 2. 待人工：账号安全 ─────────────────────────

const C2 = "C1002";
const c2: Seed = {
  conversation: {
    id: C2,
    handoffAt: at("10-05 09:52"),
    buyerId: "B005",
    mode: "ai",
    status: "waiting_human",
    handoffReason: "风险闸门：fraud_security 0.91",
    handoffSummary: "买家郑可心称账号疑似被盗：收到非本人下单的短信，且收货地址变成了陌生地址。需人工核实账号安全并暂停相关订单。",
    riskFlags: ["fraud_security"],
    tags: ["高风险", "账号安全"],
    state: {
      currentTask: null,
      slots: {},
      history: [
        rec("intent", "other", "10-05 09:52", "识别为其他（账号安全相关，风险闸门拦截）"),
        rec("handoff", "风险闸门", "10-05 09:52", "fraud_security 0.91，转人工"),
      ],
      lastIntent: "other",
      turnCount: 2,
      unresolvedTurns: 0,
      riskFlags: ["fraud_security"],
    },
    createdAt: at("10-05 09:52"),
    updatedAt: at("10-05 09:53"),
    lastMessagePreview: "收货地址还变成了一个陌生地址，快帮我看看！",
    unreadForSeller: 1,
  },
  messages: [
    m(C2, 1, "buyer", "10-05 09:52", "我账号是不是被盗了？刚刚收到一条不是我下的订单的短信"),
    m(C2, 2, "system", "10-05 09:52", "已为您转接人工客服，阿栖正在赶来", { traceId: `${C2}-T1` }),
    m(C2, 3, "buyer", "10-05 09:53", "收货地址还变成了一个陌生地址，快帮我看看！"),
  ],
  traces: [
    tr(C2, 1, `${C2}-M1`, "10-05 09:52", "risk_gate", {
      totalMs: 191,
      intent: "other",
      stage: "other",
      confidence: 0.58,
      topIntents: [
        { id: "other", p: 0.58 },
        { id: "order_status", p: 0.22 },
        { id: "modify_order", p: 0.11 },
      ],
      decideProvider: "jev",
      riskScores: { legal_threat: 0.03, health_safety: 0, fraud_security: 0.91, abuse_extreme: 0, emotion: 0.5 },
      riskHit: ["fraud_security"],
      handoffReason: "风险闸门：fraud_security 0.91",
      latency: { totalMs: 191, decideMs: 187 },
      cost: { decideUsd: 0.00002, generationUsd: 0, agentUsd: 0, totalUsd: 0.00002 },
    }),
  ],
  pendingActions: [],
};

// ───────────────────────── 3. 待人工：质量问题金额 > ¥500，规则要求人工审核 ─────────────────────────

const C3 = "C1003";
const c3: Seed = {
  conversation: {
    id: C3,
    handoffAt: at("10-05 09:12"),
    buyerId: "B004",
    mode: "ai",
    status: "waiting_human",
    handoffReason: "业务规则：质量问题金额 ¥599.00 > ¥500，需人工审核（L2 升级）",
    handoffSummary:
      "买家吴晓晴反馈订单 QM2026092703「燕麦色羊毛混纺大衣 M」（¥599）袖口开线，要求退货；属质量问题且金额超过 ¥500，需人工审核照片后处理。买家略有不满。",
    riskFlags: ["emotion"],
    tags: ["质量问题", "金额>500"],
    state: {
      currentTask: { intent: "quality_issue", status: "collecting", startedAt: at("10-05 09:10") },
      slots: { orderId: "QM2026092703", itemId: "QM2026092703-1", productId: "P007", size: "M", color: "燕麦色", reason: "袖口线头开了一大截" },
      history: [
        rec("intent", "quality_issue", "10-05 09:10", "识别为质量问题"),
        rec("tool_call", "get_order", "10-05 09:10", "查询订单 QM2026092703，燕麦色羊毛混纺大衣 M，¥599.00，已签收"),
        rec("handoff", "质量问题 > ¥500", "10-05 09:12", "金额超过 ¥500，按规则转人工审核"),
      ],
      lastIntent: "quality_issue",
      turnCount: 3,
      unresolvedTurns: 1,
      riskFlags: ["emotion"],
    },
    createdAt: at("10-05 09:10"),
    updatedAt: at("10-05 09:14"),
    lastMessagePreview: "我照片都拍好了 怎么发？",
    unreadForSeller: 2,
  },
  messages: [
    m(C3, 1, "buyer", "10-05 09:10", "上周买的那件羊毛大衣，袖口线头开了一大截，我要退货"),
    m(C3, 2, "ai", "10-05 09:10", "非常抱歉给您带来不好的体验！请问是订单 QM2026092703 里的「燕麦色羊毛混纺大衣 M」吗？", {
      traceId: `${C3}-T1`,
    }),
    m(C3, 3, "buyer", "10-05 09:11", "对 就是这件 你们质量也太差了吧 这么贵的衣服"),
    m(
      C3,
      4,
      "ai",
      "10-05 09:12",
      "已为您登记质量问题。这类问题涉及金额超过 ¥500，需要人工审核照片后处理，我先帮您转接人工客服，请稍候～",
      { traceId: `${C3}-T2` },
    ),
    m(C3, 5, "system", "10-05 09:12", "已为您转接人工客服，阿栖正在赶来"),
    m(C3, 6, "buyer", "10-05 09:13", "好的"),
    m(C3, 7, "buyer", "10-05 09:14", "我照片都拍好了 怎么发？"),
  ],
  traces: [
    tr(C3, 1, `${C3}-M1`, "10-05 09:10", "L2", {
      totalMs: 540,
      intent: "quality_issue",
      stage: "aftersale",
      confidence: 0.88,
      topIntents: [
        { id: "quality_issue", p: 0.88 },
        { id: "refund_apply", p: 0.07 },
        { id: "exchange", p: 0.03 },
      ],
      decideProvider: "jev",
      riskScores: { legal_threat: 0.05, health_safety: 0.03, fraud_security: 0, abuse_extreme: 0.04, emotion: 0.35 },
      toolCalls: [{ name: "get_order", ok: true, ms: 38 }],
      usedGeneration: true,
      latency: { totalMs: 540, decideMs: 192, handlerMs: 348 },
      cost: { decideUsd: 0.00002, generationUsd: 0.00006, agentUsd: 0, totalUsd: 0.00008 },
    }),
    tr(C3, 2, `${C3}-M3`, "10-05 09:12", "human", {
      totalMs: 468,
      intent: "quality_issue",
      stage: "aftersale",
      confidence: 0.93,
      topIntents: [
        { id: "quality_issue", p: 0.93 },
        { id: "refund_apply", p: 0.04 },
        { id: "human_request", p: 0.01 },
      ],
      decideProvider: "jev",
      riskScores: { legal_threat: 0.12, health_safety: 0.02, fraud_security: 0, abuse_extreme: 0.1, emotion: 0.62 },
      escalatedFrom: "L2",
      handoffReason: "业务规则：质量问题金额 ¥599.00 > ¥500，需人工审核",
      toolCalls: [{ name: "create_handoff", ok: true, ms: 12 }],
      latency: { totalMs: 468, decideMs: 190, handlerMs: 278 },
      cost: { decideUsd: 0.00002, generationUsd: 0, agentUsd: 0, totalUsd: 0.00002 },
    }),
  ],
  pendingActions: [],
};

// ───────────────────────── 4. 人工处理中：物流异常，阿栖已接管 ─────────────────────────

const C4 = "C1004";
const c4: Seed = {
  conversation: {
    id: C4,
    handoffAt: at("10-05 09:25"),
    buyerId: "B006",
    mode: "human",
    status: "human_active",
    assignee: "阿栖",
    handoffReason: "买家主动要求人工（human_request 0.96）",
    handoffSummary: "买家孙悦然的订单 QM2026092511 物流显示异常（苏州转运中心滞留 3 天），担心包裹丢失，要求人工核实。",
    riskFlags: [],
    tags: ["物流异常"],
    state: {
      currentTask: { intent: "logistics_track", status: "collecting", startedAt: at("10-05 09:20") },
      slots: { orderId: "QM2026092511" },
      history: [
        rec("intent", "logistics_track", "10-05 09:20", "识别为查物流"),
        rec("tool_call", "track_logistics", "10-05 09:20", "查询 QM2026092511：顺丰速运，状态异常，最新节点 10-02 苏州转运中心"),
        rec("handoff", "要求人工", "10-05 09:25", "买家表示担心包裹丢失并要求人工"),
        rec("seller_reply", "阿栖", "10-05 09:31", "已联系顺丰核实"),
        rec("seller_reply", "阿栖", "10-05 09:47", "顺丰确认滞留，已加急重发"),
      ],
      lastIntent: "human_request",
      turnCount: 4,
      unresolvedTurns: 0,
      riskFlags: [],
    },
    createdAt: at("10-05 09:20"),
    updatedAt: at("10-05 09:47"),
    lastMessagePreview: "顺丰确认包裹在苏州分拨中心滞留，已加急，今天下午会重新发出……",
    unreadForSeller: 0,
  },
  messages: [
    m(C4, 1, "buyer", "10-05 09:20", "我的快递三天没更新了，怎么回事？"),
    m(C4, 2, "ai", "10-05 09:20", "帮您查到订单 QM2026092511 的物流：顺丰速运，目前状态异常，最新节点为 10-02 苏州转运中心。", {
      traceId: `${C4}-T1`,
      card: {
        kind: "logistics",
        orderId: "QM2026092511",
        logistics: {
          carrier: "顺丰速运",
          trackingNo: "SF1029384756102",
          status: "exception",
          events: [
            { at: at("10-02 18:40"), location: "苏州转运中心", description: "快件到达苏州转运中心，暂未发出（异常）" },
            { at: at("10-02 07:15"), location: "杭州转运中心", description: "快件已发往苏州转运中心" },
            { at: at("10-01 20:30"), location: "杭州仓", description: "已揽收" },
          ],
        },
      },
    }),
    m(C4, 3, "buyer", "10-05 09:25", "异常是什么意思？是不是丢了？？我要人工"),
    m(C4, 4, "system", "10-05 09:25", "已为您转接人工客服，阿栖正在赶来", { traceId: `${C4}-T2` }),
    m(C4, 5, "system", "10-05 09:30", "人工客服 阿栖 已接入"),
    m(C4, 6, "seller", "10-05 09:31", "您好，我是阿栖～已经联系顺丰帮您核实，预计 30 分钟内给您回复，请放心。"),
    m(C4, 7, "buyer", "10-05 09:34", "好的 麻烦快点"),
    m(C4, 8, "seller", "10-05 09:47", "顺丰确认包裹在苏州分拨中心滞留，已加急，今天下午会重新发出，给您添麻烦了。"),
  ],
  traces: [
    tr(C4, 1, `${C4}-M1`, "10-05 09:20", "L2", {
      totalMs: 388,
      intent: "logistics_track",
      stage: "insale",
      confidence: 0.94,
      topIntents: [
        { id: "logistics_track", p: 0.94 },
        { id: "urge_shipping", p: 0.03 },
        { id: "order_status", p: 0.02 },
      ],
      decideProvider: "jev",
      riskScores: { legal_threat: 0, health_safety: 0, fraud_security: 0, abuse_extreme: 0, emotion: 0.28 },
      toolCalls: [
        { name: "list_orders", ok: true, ms: 24 },
        { name: "track_logistics", ok: true, ms: 31 },
      ],
      latency: { totalMs: 388, decideMs: 181, handlerMs: 207 },
      cost: { decideUsd: 0.00002, generationUsd: 0, agentUsd: 0, totalUsd: 0.00002 },
    }),
    tr(C4, 2, `${C4}-M3`, "10-05 09:25", "L1", {
      totalMs: 4,
      intent: "human_request",
      stage: "other",
      confidence: 1,
      ruleId: "R001",
      handoffReason: "买家主动要求人工（规则 R001 命中）",
      toolCalls: [{ name: "create_handoff", ok: true, ms: 3 }],
      latency: { totalMs: 4 },
    }),
  ],
  pendingActions: [],
};

// ───────────────────────── 5. AI 处理中：多步换货，等待买家确认（演示剧本第 3 幕） ─────────────────────────

const C5 = "C1005";
const exchangePending: PendingAction = {
  id: "PA-1001",
  conversationId: C5,
  tool: "request_exchange",
  args: { orderId: "QM2026092801", itemId: "QM2026092801-1", newSize: "L" },
  summary: "为订单 QM2026092801 的「燕麦色羊毛混纺大衣 M」换货为 L 码（燕麦色）",
  status: "pending",
  createdAt: at("10-05 09:56"),
};
const c5: Seed = {
  conversation: {
    id: C5,
    buyerId: "B001",
    mode: "ai",
    status: "ai_active",
    riskFlags: [],
    tags: ["多步任务", "换货"],
    state: {
      currentTask: { intent: "exchange", status: "awaiting_confirm", startedAt: at("10-05 09:56") },
      slots: { orderId: "QM2026092801", itemId: "QM2026092801-1", productId: "P007", size: "L", color: "燕麦色" },
      history: [
        rec("intent", "multi_step_complex", "10-05 09:56", "识别为多步复杂请求（换货 + 查优惠券），交给 L3"),
        rec("tool_call", "get_order", "10-05 09:56", "QM2026092801 已签收 5 天，在 7 天无理由内"),
        rec("tool_call", "check_stock", "10-05 09:56", "燕麦色 L 码有货（库存 3）"),
        rec("pending_action", "request_exchange", "10-05 09:56", "生成换货确认卡，等待买家确认"),
        rec("tool_call", "list_coupons", "10-05 09:56", "可用优惠券 2 张"),
      ],
      pendingActionId: "PA-1001",
      lastIntent: "multi_step_complex",
      turnCount: 1,
      unresolvedTurns: 0,
      riskFlags: [],
    },
    createdAt: at("10-05 09:56"),
    updatedAt: at("10-05 09:56"),
    lastMessagePreview: "另外您还有 2 张可用优惠券，下次下单可以直接使用～",
    unreadForSeller: 0,
  },
  messages: [
    m(C5, 1, "buyer", "10-05 09:56", "上周买的那件外套换成 L，顺便看看有没有券"),
    m(
      C5,
      2,
      "ai",
      "10-05 09:56",
      "查到您的订单 QM2026092801：燕麦色羊毛混纺大衣 M（9 月 30 日签收，仍在 7 天无理由内）。燕麦色 L 码有货，请确认是否换货：",
      {
        traceId: `${C5}-T1`,
        card: { kind: "confirm", pendingAction: exchangePending },
      },
    ),
    m(C5, 3, "ai", "10-05 09:56", "另外您还有 2 张可用优惠券，下次下单可以直接使用～", {
      traceId: `${C5}-T1`,
      card: { kind: "coupons", coupons: MOCK_COUPONS.filter((c) => c.buyerId === "B001" && !c.used && c.expiresAt > at("10-05 10:00")) },
    }),
  ],
  traces: [
    tr(C5, 1, `${C5}-M1`, "10-05 09:56", "L3", {
      totalMs: 4820,
      intent: "multi_step_complex",
      stage: "aftersale",
      confidence: 0.82,
      topIntents: [
        { id: "multi_step_complex", p: 0.82 },
        { id: "exchange", p: 0.12 },
        { id: "promotion", p: 0.04 },
      ],
      decideProvider: "jev",
      riskScores: { legal_threat: 0, health_safety: 0, fraud_security: 0, abuse_extreme: 0, emotion: 0.05 },
      toolCalls: [
        { name: "get_order", ok: true, ms: 82 },
        { name: "check_stock", ok: true, ms: 64 },
        { name: "request_exchange", ok: true, ms: 41 },
        { name: "list_coupons", ok: true, ms: 55 },
      ],
      usedGeneration: true,
      latency: { totalMs: 4820, decideMs: 210, agentMs: 4600 },
      cost: { decideUsd: 0.00002, generationUsd: 0, agentUsd: 0.0031, totalUsd: 0.00312 },
    }),
  ],
  pendingActions: [exchangePending],
};

// ───────────────────────── 6. AI 处理中：改地址，槽位收集中 ─────────────────────────

const C6 = "C1006";
const c6: Seed = {
  conversation: {
    id: C6,
    buyerId: "B003",
    mode: "ai",
    status: "ai_active",
    riskFlags: [],
    tags: ["改地址"],
    state: {
      currentTask: { intent: "modify_order", status: "collecting", startedAt: at("10-05 09:57") },
      slots: {
        orderId: "QM2026100401",
        address: { name: "陈思", region: "上海市 浦东新区", detail: "世纪大道 100 号" },
      },
      history: [
        rec("intent", "modify_order", "10-05 09:57", "识别为修改订单"),
        rec("tool_call", "list_orders", "10-05 09:57", "找到 1 个可改地址的订单 QM2026100401（待发货）"),
        rec("intent", "modify_order", "10-05 09:58", "沿用当前任务，补全地址槽位"),
      ],
      lastIntent: "modify_order",
      turnCount: 2,
      unresolvedTurns: 0,
      riskFlags: [],
    },
    createdAt: at("10-05 09:57"),
    updatedAt: at("10-05 09:58"),
    lastMessagePreview: "收到～新地址是「上海市 浦东新区 世纪大道 100 号」，还需要确认收件人手机号……",
    unreadForSeller: 1,
  },
  messages: [
    m(C6, 1, "buyer", "10-05 09:57", "地址填错了，能改吗"),
    m(C6, 2, "ai", "10-05 09:57", "可以的～您有 1 个待发货订单 QM2026100401（软糯圆领开衫 雾粉 S），请告诉我新的收货地址（省市区 + 详细地址）。", {
      traceId: `${C6}-T1`,
    }),
    m(C6, 3, "buyer", "10-05 09:58", "改成上海市浦东新区世纪大道100号，收件人还是我"),
    m(C6, 4, "ai", "10-05 09:58", "收到～新地址是「上海市 浦东新区 世纪大道 100 号」，还需要确认一下收件人手机号是否仍为 137****7003？", {
      traceId: `${C6}-T2`,
    }),
  ],
  traces: [
    tr(C6, 1, `${C6}-M1`, "10-05 09:57", "L2", {
      totalMs: 402,
      intent: "modify_order",
      stage: "insale",
      confidence: 0.93,
      topIntents: [
        { id: "modify_order", p: 0.93 },
        { id: "order_status", p: 0.04 },
        { id: "cancel_order", p: 0.02 },
      ],
      decideProvider: "jev",
      riskScores: { legal_threat: 0, health_safety: 0, fraud_security: 0.06, abuse_extreme: 0, emotion: 0.1 },
      toolCalls: [{ name: "list_orders", ok: true, ms: 27 }],
      latency: { totalMs: 402, decideMs: 188, handlerMs: 214 },
      cost: { decideUsd: 0.00002, generationUsd: 0, agentUsd: 0, totalUsd: 0.00002 },
    }),
    tr(C6, 2, `${C6}-M3`, "10-05 09:58", "L2", {
      totalMs: 431,
      intent: "modify_order",
      stage: "insale",
      confidence: 0.97,
      topIntents: [
        { id: "modify_order", p: 0.97 },
        { id: "other", p: 0.02 },
        { id: "order_status", p: 0.01 },
      ],
      decideProvider: "jev",
      riskScores: { legal_threat: 0, health_safety: 0, fraud_security: 0.04, abuse_extreme: 0, emotion: 0.02 },
      latency: { totalMs: 431, decideMs: 195, handlerMs: 236 },
      cost: { decideUsd: 0.00002, generationUsd: 0, agentUsd: 0, totalUsd: 0.00002 },
    }),
  ],
  pendingActions: [],
};

// ───────────────────────── 7. 已结束：尺码咨询 ─────────────────────────

const C7 = "C1007";
const c7: Seed = {
  conversation: {
    id: C7,
    buyerId: "B007",
    mode: "ai",
    status: "closed",
    riskFlags: [],
    tags: ["售前", "尺码"],
    state: {
      ...emptyState(),
      currentTask: { intent: "size_recommend", status: "done", startedAt: at("10-04 16:18") },
      slots: { productId: "P002", heightCm: 162, weightKg: 55 },
      history: [
        rec("intent", "size_recommend", "10-04 16:18", "识别为尺码推荐"),
        rec("tool_call", "recommend_size", "10-04 16:18", "162cm / 55kg，修身版型 → 推荐 L"),
      ],
      lastIntent: "size_recommend",
      turnCount: 2,
    },
    createdAt: at("10-04 16:18"),
    updatedAt: at("10-04 16:20"),
    lastMessagePreview: "好的，谢谢！我选 L",
    unreadForSeller: 0,
  },
  messages: [
    m(C7, 1, "buyer", "10-04 16:18", "我162cm 55kg，法式碎花茶歇裙穿什么码？"),
    m(C7, 2, "ai", "10-04 16:18", "这款是修身版型，按您的身高体重推荐 L 码～", {
      traceId: `${C7}-T1`,
      card: {
        kind: "size_result",
        size: "L",
        productId: "P002",
        basis: "身高 162cm 对应 M，体重 55kg 对应 L，取较大者 L；修身版型体重在区间下沿，不需要再加大。",
      },
    }),
    m(C7, 3, "buyer", "10-04 16:20", "好的，谢谢！我选 L"),
  ],
  traces: [
    tr(C7, 1, `${C7}-M1`, "10-04 16:18", "L2", {
      totalMs: 356,
      intent: "size_recommend",
      stage: "presale",
      confidence: 0.96,
      topIntents: [
        { id: "size_recommend", p: 0.96 },
        { id: "product_consult", p: 0.03 },
        { id: "stock_check", p: 0.01 },
      ],
      decideProvider: "jev",
      riskScores: { legal_threat: 0, health_safety: 0, fraud_security: 0, abuse_extreme: 0, emotion: 0 },
      toolCalls: [{ name: "recommend_size", ok: true, ms: 3 }],
      latency: { totalMs: 356, decideMs: 184, handlerMs: 172 },
      cost: { decideUsd: 0.00002, generationUsd: 0, agentUsd: 0, totalUsd: 0.00002 },
    }),
  ],
  pendingActions: [],
};

// ───────────────────────── 8. 已结束：L1 规则秒回物流 ─────────────────────────

const C8 = "C1008";
const order100201 = MOCK_ORDERS.find((o) => o.id === "QM2026100201");
const c8: Seed = {
  conversation: {
    id: C8,
    buyerId: "B001",
    mode: "ai",
    status: "closed",
    riskFlags: [],
    tags: ["售中", "物流"],
    state: {
      ...emptyState(),
      currentTask: { intent: "logistics_track", status: "done", startedAt: at("10-04 09:28") },
      slots: { orderId: "QM2026100201" },
      history: [
        rec("intent", "logistics_track", "10-04 09:28", "规则 R002 命中：查物流"),
        rec("tool_call", "track_logistics", "10-04 09:28", "查询 QM2026100201：顺丰速运，运输中"),
      ],
      lastIntent: "logistics_track",
      turnCount: 1,
    },
    createdAt: at("10-04 09:28"),
    updatedAt: at("10-04 09:29"),
    lastMessagePreview: "您的包裹正在运输中，预计 10 月 6 日送达～",
    unreadForSeller: 0,
  },
  messages: [
    m(C8, 1, "buyer", "10-04 09:28", "到哪了"),
    m(C8, 2, "ai", "10-04 09:28", "您的包裹正在运输中，预计 10 月 6 日送达～", {
      traceId: `${C8}-T1`,
      card: order100201?.logistics
        ? { kind: "logistics", orderId: "QM2026100201", logistics: order100201.logistics }
        : undefined,
    }),
  ],
  traces: [
    tr(C8, 1, `${C8}-M1`, "10-04 09:28", "L1", {
      totalMs: 9,
      intent: "logistics_track",
      stage: "insale",
      confidence: 1,
      ruleId: "R002",
      toolCalls: [{ name: "track_logistics", ok: true, ms: 6 }],
      latency: { totalMs: 9 },
    }),
  ],
  pendingActions: [],
};

/** lastLayer = 最近一条 RouteTrace 的层级（契约：每写一条 trace 就更新）。 */
function withLastLayer(seed: Seed): Seed {
  const last = seed.traces[seed.traces.length - 1];
  if (last) seed.conversation.lastLayer = last.layer;
  return seed;
}

const SEEDS: Seed[] = [c1, c2, c3, c4, c5, c6, c7, c8].map(withLastLayer);

// ───────────────────────── 内存状态 ─────────────────────────

let store: Seed[] = clone(SEEDS);

function find(id: string): Seed {
  const s = store.find((x) => x.conversation.id === id);
  if (!s) throw new MockApiError("NOT_FOUND", "没有找到这个会话", 404);
  return s;
}

function touch(s: Seed, preview: string, at_ = nowIso()) {
  s.conversation.updatedAt = at_;
  s.conversation.lastMessagePreview = preview;
}

function pushMessage(s: Seed, role: Role, text: string): ChatMessage {
  const msg: ChatMessage = {
    id: `${s.conversation.id}-M${s.messages.length + 1}`,
    conversationId: s.conversation.id,
    role,
    text,
    createdAt: nowIso(),
  };
  s.messages.push(msg);
  return msg;
}

function pushHistory(s: Seed, record: Omit<ActionRecord, "at">) {
  const h = s.conversation.state.history;
  h.push({ ...record, at: nowIso() });
  if (h.length > 10) h.splice(0, h.length - 10);
}

/** 排序规则同 CONTRACTS §3：waiting_human 在最前（等得最久的最前），其余按 updatedAt 倒序。 */
function sortConversations(list: Conversation[]): Conversation[] {
  return [...list].sort((a, b) => {
    const aw = a.status === "waiting_human";
    const bw = b.status === "waiting_human";
    if (aw !== bw) return aw ? -1 : 1;
    if (aw && bw) return Date.parse(a.handoffAt ?? a.updatedAt) - Date.parse(b.handoffAt ?? b.updatedAt);
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
}

// ───────────────────────── mock API ─────────────────────────

export async function mockListConversations(
  params: { status?: Conversation["status"]; includeSimulated?: boolean } = {},
): Promise<Conversation[]> {
  await delay();
  const list = store
    .map((s) => s.conversation)
    .filter((c) => (params.status ? c.status === params.status : true))
    .filter((c) => params.includeSimulated || !c.isSimulated);
  return clone(sortConversations(list));
}

export async function mockGetConversationDetail(id: string) {
  await delay();
  const s = find(id);
  s.conversation.unreadForSeller = 0; // 契约：读取后未读归零
  return clone({
    conversation: s.conversation,
    messages: s.messages,
    traces: s.traces,
    pendingActions: s.pendingActions,
  });
}

export async function mockTakeover(id: string): Promise<Conversation> {
  await delay(80);
  const s = find(id);
  const c = s.conversation;
  if (c.status === "closed") throw new MockApiError("CONFLICT", "会话已结束，不能接管", 409);
  c.mode = "human";
  c.status = "human_active";
  c.assignee = "阿栖";
  pushMessage(s, "system", "人工客服 阿栖 已接入");
  pushHistory(s, { type: "seller_reply", name: "阿栖", summary: "阿栖接管了会话" });
  touch(s, "人工客服 阿栖 已接入");
  return clone(c);
}

export async function mockReply(id: string, text: string): Promise<ChatMessage> {
  await delay(80);
  const s = find(id);
  if (s.conversation.status === "closed") throw new MockApiError("CONFLICT", "会话已结束，不能回复", 409);
  if (s.conversation.mode !== "human") {
    // 契约：尚未接管则自动接管
    await mockTakeover(id);
  }
  const msg = pushMessage(s, "seller", text);
  pushHistory(s, { type: "seller_reply", name: "阿栖", summary: `阿栖回复：${text.slice(0, 30)}` });
  touch(s, text, msg.createdAt);
  return clone(msg);
}

export async function mockRelease(id: string): Promise<Conversation> {
  await delay(80);
  const s = find(id);
  const c = s.conversation;
  c.mode = "ai";
  c.status = "ai_active";
  c.assignee = undefined;
  c.handoffAt = undefined; // 契约：交还 AI 后清空 handoffAt
  c.state.unresolvedTurns = 0;
  pushMessage(s, "system", "已切换回智能客服");
  touch(s, "已切换回智能客服");
  return clone(c);
}

export async function mockClose(id: string): Promise<Conversation> {
  await delay(80);
  const s = find(id);
  s.conversation.status = "closed";
  s.conversation.mode = "ai";
  touch(s, s.conversation.lastMessagePreview, nowIso());
  return clone(s.conversation);
}

export async function mockMarkMisfire(traceId: string): Promise<RouteTrace> {
  await delay(60);
  for (const s of store) {
    const t = s.traces.find((x) => x.id === traceId);
    if (t) return clone(t);
  }
  throw new MockApiError("NOT_FOUND", "没有找到这条路由记录", 404);
}

/** 买家端聊天 mock（lib/mock/chat.ts）与卖家端共用同一份内存会话：买家新建的会话会出现在卖家会话列表里，卖家接管 / 回复买家端也能收到。 */
export function mockSellerStore(): Seed[] {
  return store;
}

/**
 * 跨标签页同步（lib/mock/sync.ts）：用另一个标签页写入的快照覆盖内存数据。
 * 就地更新（保持对象引用不变），避免正在进行中的调用拿着旧引用写丢数据。
 */
export function replaceSellerStore(next: Seed[]) {
  const merged: Seed[] = next.map((n) => {
    const cur = store.find((x) => x.conversation.id === n.conversation.id);
    if (!cur) return n;
    for (const k of Object.keys(cur.conversation)) delete (cur.conversation as unknown as Record<string, unknown>)[k];
    Object.assign(cur.conversation, n.conversation);
    cur.messages.splice(0, cur.messages.length, ...n.messages);
    cur.traces.splice(0, cur.traces.length, ...n.traces);
    cur.pendingActions.splice(0, cur.pendingActions.length, ...n.pendingActions);
    return cur;
  });
  store.splice(0, store.length, ...merged);
}

/** 测试 / 演示用：重置卖家端 mock 数据。 */
export function resetSellerMock() {
  store = clone(SEEDS);
}
