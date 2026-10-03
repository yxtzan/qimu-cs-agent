/**
 * 买家客服聊天 mock：脚本化的"假后端"（CONTRACTS §2）。
 *
 * 目的：后端（T04/T05）没好之前，前端也能完整演示 PRD §8 剧本的前 4 步，并且卡片和交互是真实的：
 *   1. 售前：商品页问「160cm 50kg 穿什么码？这件能机洗吗」→ 尺码结果卡 + 洗护回答（来源引用卡）
 *   2. 售中：订单页点「联系客服」问「到哪了」→ L1 规则 R002 → 物流时间线卡
 *   3. 售后多步：「上周买的那件外套换成 L，顺便看看有没有券」→ L3 → 确认卡 + 优惠券卡；点确认后订单真的多一条换货售后单
 *   4. 高风险：「穿了全身起红疹…不处理我就去 12315」→ 风险闸门 → 转人工（等待 → 卖家接管 → 买家 2 秒轮询收到）
 * 回复文字是模板拼的，路由层级 / 意图 / 耗时 / 成本是写死的"合理数值"，只为演示调试信息行。
 *
 * 会话与卖家端 mock 共用同一份内存（lib/mock/seller.ts 的 store）：买家端发起的会话会出现在 /seller 的会话列表里，
 * 在同一个浏览器标签页内接管 / 回复，买家端轮询就能收到。刷新页面后重置。
 */
import { DEMO_NOW, nowIso } from "@/lib/demo-clock";
import type { ChatRequest, ChatResponse } from "@/lib/api-client";
import type {
  ActionRecord,
  AfterSale,
  ChatAction,
  ChatCard,
  ChatMessage,
  Coupon,
  IntentId,
  Layer,
  Logistics,
  Order,
  OrderItem,
  PendingAction,
  Product,
  RiskKey,
  RouteTrace,
  Size,
  Slots,
  Stage,
} from "@/lib/types";
import { intentLabel } from "@/components/seller/labels";
import { MOCK_BUYERS, MOCK_COUPONS, MOCK_ORDERS, MOCK_PRODUCTS } from "./data";
import { MockApiError } from "./index";
import { mockRelease, mockReply, mockSellerStore, mockTakeover, type Seed } from "./seller";

// ───────────────────────── 小工具 ─────────────────────────

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const SIZES: Size[] = ["XS", "S", "M", "L", "XL"];
const DEMO_NOW_MS = Date.parse(DEMO_NOW);

const STAGE_OF: Partial<Record<IntentId, Stage>> = {
  product_consult: "presale",
  size_recommend: "presale",
  stock_check: "presale",
  promotion: "presale",
  shipping_policy: "presale",
  order_status: "insale",
  logistics_track: "insale",
  urge_shipping: "insale",
  modify_order: "insale",
  cancel_order: "insale",
  refund_apply: "aftersale",
  refund_progress: "aftersale",
  exchange: "aftersale",
  quality_issue: "aftersale",
  return_policy: "aftersale",
  invoice: "aftersale",
  multi_step_complex: "aftersale",
};

const NO_COST: RouteTrace["cost"] = { decideUsd: 0, generationUsd: 0, agentUsd: 0, totalUsd: 0 };

const productOf = (id: string): Product | undefined => MOCK_PRODUCTS.find((p) => p.id === id);
const describeItem = (it: OrderItem) => `${it.productName}（${it.color} ${it.size}）`;
const money = (n: number) => `¥${n.toFixed(2)}`;
const mdText = (iso: string) => `${Number(iso.slice(5, 7))} 月 ${Number(iso.slice(8, 10))} 日`;

// ───────────────────────── 会话存取 ─────────────────────────

/** 买家端新建的会话 id → 方便区分于卖家端预置的演示会话 */
const buyerConvIds = new Set<string>();
let convCounter = 0;

function findSeed(id: string): Seed | undefined {
  return mockSellerStore().find((s) => s.conversation.id === id);
}

function latestSeedOf(buyerId: string): Seed | undefined {
  const list = mockSellerStore()
    .filter((s) => buyerConvIds.has(s.conversation.id) && s.conversation.buyerId === buyerId && s.conversation.status !== "closed")
    .sort((a, b) => Date.parse(b.conversation.updatedAt) - Date.parse(a.conversation.updatedAt));
  return list[0];
}

function createSeed(buyerId: string): Seed {
  convCounter += 1;
  const id = `BC${String(convCounter).padStart(4, "0")}`;
  const t = nowIso();
  const seed: Seed = {
    conversation: {
      id,
      buyerId,
      mode: "ai",
      status: "ai_active",
      riskFlags: [],
      tags: [],
      state: { currentTask: null, slots: {}, history: [], turnCount: 0, unresolvedTurns: 0, riskFlags: [] },
      createdAt: t,
      updatedAt: t,
      lastMessagePreview: "",
      unreadForSeller: 0,
    },
    messages: [],
    traces: [],
    pendingActions: [],
  };
  mockSellerStore().push(seed);
  buyerConvIds.add(id);
  return seed;
}

function addMessage(
  seed: Seed,
  role: ChatMessage["role"],
  text: string,
  extra: Partial<Pick<ChatMessage, "card" | "quickReplies" | "traceId">> = {},
): ChatMessage {
  const msg: ChatMessage = {
    id: `${seed.conversation.id}-M${seed.messages.length + 1}`,
    conversationId: seed.conversation.id,
    role,
    text,
    createdAt: nowIso(),
    ...extra,
  };
  seed.messages.push(msg);
  seed.conversation.updatedAt = msg.createdAt;
  seed.conversation.lastMessagePreview = text;
  return msg;
}

function pushHistory(seed: Seed, record: Omit<ActionRecord, "at">) {
  const h = seed.conversation.state.history;
  h.push({ ...record, at: nowIso() });
  if (h.length > 10) h.splice(0, h.length - 10);
}

// ───────────────────────── 业务小函数 ─────────────────────────

const buyerOrders = (buyerId: string) =>
  MOCK_ORDERS.filter((o) => o.buyerId === buyerId).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

/** 按日历日计算（签收 9-30、现在 10-05 → 5 天），与 DATA_SPEC 里「签收 5 天」一致 */
function daysSince(iso: string): number {
  const day = (ms: number) => Math.floor((ms + 8 * 3600 * 1000) / 86400000);
  return day(DEMO_NOW_MS) - day(Date.parse(iso));
}

function availableCoupons(buyerId: string): Coupon[] {
  return MOCK_COUPONS.filter((c) => c.buyerId === buyerId && !c.used && Date.parse(c.expiresAt) > DEMO_NOW_MS);
}

function skuStock(productId: string, color: string, size: Size) {
  return productOf(productId)?.skus.find((s) => s.color === color && s.size === size);
}

/** DATA_SPEC §4 的确定性尺码推荐 */
const HEIGHT_RANGES: Record<Size, [number, number]> = { XS: [150, 154], S: [155, 159], M: [160, 164], L: [165, 169], XL: [170, 175] };
const WEIGHT_RANGES: Record<Size, [number, number]> = { XS: [40, 44], S: [45, 49], M: [50, 54], L: [55, 61], XL: [62, 70] };

function sizeFor(value: number, ranges: Record<Size, [number, number]>): Size | null {
  for (const s of SIZES) {
    const [lo, hi] = ranges[s];
    if (value >= lo && value < hi + 1) return s;
  }
  return null;
}

function recommendSize(heightCm: number, weightKg: number, fit?: Product["fit"]): { size: Size; basis: string } | null {
  const hs = sizeFor(heightCm, HEIGHT_RANGES);
  const ws = sizeFor(weightKg, WEIGHT_RANGES);
  if (!hs || !ws) return null;
  let idx = Math.max(SIZES.indexOf(hs), SIZES.indexOf(ws));
  const size = SIZES[idx];
  let basis = `身高 ${heightCm}cm 对应 ${hs} 码，体重 ${weightKg}kg 对应 ${ws} 码，取较大者 ${size} 码`;
  const [hLo, hHi] = HEIGHT_RANGES[size];
  const [wLo, wHi] = WEIGHT_RANGES[size];
  if (fit === "宽松" && idx > 0 && heightCm < (hLo + hHi + 1) / 2 && weightKg < (wLo + wHi + 1) / 2) {
    basis += `；该款为宽松版型，喜欢宽松效果可选 ${SIZES[idx - 1]}，想合身选 ${size}`;
  } else if (fit === "修身" && idx < SIZES.length - 1 && (heightCm >= hHi || weightKg >= wHi)) {
    idx += 1;
    basis += `；该款为修身版型且您的数据在区间上沿，建议大一码选 ${SIZES[idx]} 码`;
  } else if (fit) {
    basis += `；该款为${fit}版型，无需修正`;
  }
  return { size: SIZES[idx], basis };
}

function parseBody(text: string): { heightCm?: number; weightKg?: number } {
  const out: { heightCm?: number; weightKg?: number } = {};
  const h = text.match(/(1[4-9]\d)\s*(?:cm|CM|厘米|公分)?/);
  if (h) out.heightCm = Number(h[1]);
  const w = text.match(/(\d{2,3}(?:\.\d)?)\s*(kg|KG|公斤|斤)/);
  if (w) out.weightKg = w[2] === "斤" ? Math.round(Number(w[1]) / 2) : Number(w[1]);
  else if (h) {
    // 「160 50」这种只带身高单位的写法：身高后面紧跟的两位数当体重
    const rest = text.slice((h.index ?? 0) + h[0].length);
    const w2 = rest.match(/(?:^|[^\d])([3-9]\d)(?!\d)/);
    if (w2) out.weightKg = Number(w2[1]);
  }
  return out;
}

function parseSize(text: string): Size | undefined {
  const m = text.match(/(?<![A-Za-z])(XS|XL|S|M|L)(?![A-Za-z])/i);
  return m ? (m[1].toUpperCase() as Size) : undefined;
}

// ───────────────────────── 一轮对话的产出 ─────────────────────────

interface Reply {
  text: string;
  card?: ChatCard;
  quickReplies?: ChatMessage["quickReplies"];
}

interface Turn {
  layer: Layer;
  intent: IntentId;
  confidence: number;
  ruleId?: string;
  replies: Reply[];
  /** 假装思考多久（毫秒），让「正在输入…」可见 */
  delayMs: number;
  totalMs: number;
  decideMs?: number;
  handlerMs?: number;
  agentMs?: number;
  cost?: RouteTrace["cost"];
  toolCalls?: RouteTrace["toolCalls"];
  usedGeneration?: boolean;
  ragHits?: number;
  riskScores?: Partial<Record<RiskKey, number>>;
  riskHit?: RiskKey[];
  handoff?: { reason: string; summary: string; flags?: RiskKey[]; systemText?: string };
  slots?: Slots;
  task?: "collecting" | "awaiting_confirm" | "done" | null;
  pending?: PendingAction;
  unresolved?: "inc" | "reset";
  historyNotes?: Omit<ActionRecord, "at">[];
  decideProvider?: RouteTrace["decideProvider"];
  escalatedFrom?: Layer;
}

interface Ctx {
  seed: Seed;
  buyerId: string;
  nickname: string;
  text: string;
  context: NonNullable<ChatRequest["context"]>;
  slots: Slots;
}

const l1Cost: RouteTrace["cost"] = NO_COST;
const l2Cost: RouteTrace["cost"] = { decideUsd: 0.00002, generationUsd: 0.00009, agentUsd: 0, totalUsd: 0.00011 };

function l1(intent: IntentId, ruleId: string, replies: Reply[], extra: Partial<Turn> = {}): Turn {
  return { layer: "L1", intent, ruleId, confidence: 0.99, replies, delayMs: 260, totalMs: 9, cost: l1Cost, ...extra };
}

function l2(intent: IntentId, confidence: number, replies: Reply[], extra: Partial<Turn> = {}): Turn {
  return {
    layer: "L2",
    intent,
    confidence,
    replies,
    delayMs: 700,
    totalMs: 612,
    decideMs: 186,
    handlerMs: 426,
    cost: l2Cost,
    decideProvider: "mock",
    ...extra,
  };
}

const QUICK_MENU: ChatMessage["quickReplies"] = [
  { label: "查物流", action: { type: "quick_action", name: "track_logistics" } },
  { label: "退款进度", action: { type: "quick_action", name: "refund_progress" } },
  { label: "尺码推荐", action: { type: "quick_action", name: "size_recommend" } },
];

// ───────────────────────── 订单选择（状态 → 唯一订单自动选 → options 卡片 → 追问） ─────────────────────────

type OrderPick = { kind: "order"; order: Order } | { kind: "options"; orders: Order[] } | { kind: "none" } | { kind: "foreign" };

function pickOrder(
  ctx: Ctx,
  filter: (o: Order) => boolean,
  prefer?: (o: Order) => boolean,
  acceptWanted?: (o: Order) => boolean,
): OrderPick {
  const mine = buyerOrders(ctx.buyerId);
  const explicit = ctx.text.match(/QM\d{10}/)?.[0];
  // 槽位里的订单号只在「上一轮正在向买家追问」时沿用，避免上一个话题的订单串到下一个话题
  const slotOrder = ctx.seed.conversation.state.currentTask?.status === "collecting" ? ctx.slots.orderId : undefined;
  const wanted = explicit ?? ctx.context.orderId ?? slotOrder;
  if (wanted) {
    const o = MOCK_ORDERS.find((x) => x.id === wanted);
    if (o && o.buyerId !== ctx.buyerId) return { kind: "foreign" };
    if (o && (explicit || !acceptWanted || acceptWanted(o))) return { kind: "order", order: o };
  }
  let list = mine.filter(filter);
  if (prefer) {
    const preferred = list.filter(prefer);
    if (preferred.length > 0) list = preferred;
  }
  if (list.length === 0) return { kind: "none" };
  if (list.length === 1) return { kind: "order", order: list[0] };
  return { kind: "options", orders: list };
}

const ORDER_STATUS_TEXT: Record<Order["status"], string> = {
  pending_payment: "待付款",
  paid: "待发货",
  shipped: "已发货",
  delivered: "已签收",
  completed: "已完成",
  cancelled: "已取消",
};

function orderOptionsCard(prompt: string, orders: Order[]): ChatCard {
  return {
    kind: "options",
    prompt,
    options: orders.map((o) => ({
      label: o.items.map((i) => i.productName).join("、"),
      value: o.id,
      sublabel: `订单 ${o.id} · ${ORDER_STATUS_TEXT[o.status]} · ${money(o.payAmount)}`,
    })),
  };
}

function askWhichOrder(intent: IntentId, ctx: Ctx, orders: Order[], what: string): Turn {
  return l2(
    intent,
    0.9,
    [{ text: `您最近有几个订单，想${what}的是哪一单呢？`, card: orderOptionsCard("请选择订单", orders) }],
    { task: "collecting", slots: ctx.slots },
  );
}

function noOrderTurn(intent: IntentId, pick: OrderPick, what: string): Turn {
  const text =
    pick.kind === "foreign"
      ? "这个订单不属于当前账号，我没法帮您查看哦。请确认订单号，或选择您自己的订单～"
      : `我没有找到可以${what}的订单。如果订单号在别的账号下，可以告诉我订单号，或点下方「转人工」让同事帮您看看。`;
  return l2(intent, 0.88, [{ text }], { task: null });
}

// ───────────────────────── 各意图的回复 ─────────────────────────

function logisticsTurn(ctx: Ctx, viaRule: boolean): Turn {
  const pick = pickOrder(
    ctx,
    (o) => !!o.logistics,
    (o) => o.status === "shipped",
  );
  const intent: IntentId = "logistics_track";
  if (pick.kind === "options") return askWhichOrder(intent, ctx, pick.orders, "查物流");
  if (pick.kind !== "order") return noOrderTurn(intent, pick, "查物流");
  const o = pick.order;
  const slots: Slots = { orderId: o.id };
  if (!o.logistics) {
    const text =
      o.status === "paid"
        ? `订单 ${o.id} 已付款，仓库还没有发货，发出后会第一时间有物流信息。需要我帮您催一下发货吗？`
        : `订单 ${o.id} 目前是「${ORDER_STATUS_TEXT[o.status]}」状态，没有物流信息哦。`;
    return viaRule ? l1(intent, "R002", [{ text }], { slots, task: "done" }) : l2(intent, 0.9, [{ text }], { slots, task: "done" });
  }
  const lg: Logistics = o.logistics;
  const latest = lg.events[0];
  const eta = lg.estimatedDelivery ? `，预计 ${mdText(lg.estimatedDelivery)}送达` : "";
  const text =
    lg.status === "delivered"
      ? `订单 ${o.id} 已签收：${latest.description}（${latest.at.slice(5, 16).replace("T", " ")}）。`
      : `订单 ${o.id} 目前${latest.description.replace(/。$/, "")}${eta}，详细轨迹如下：`;
  const reply: Reply = { text, card: { kind: "logistics", orderId: o.id, logistics: lg } };
  const toolCalls = [{ name: "track_logistics", ok: true, ms: viaRule ? 4 : 96 }];
  if (viaRule) {
    return l1(intent, "R002", [reply], { slots, task: "done", toolCalls, historyNotes: [{ type: "tool_call", name: "track_logistics", summary: `查询订单 ${o.id} 的物流` }] });
  }
  return l2(intent, 0.94, [reply], { slots, task: "done", toolCalls, historyNotes: [{ type: "tool_call", name: "track_logistics", summary: `查询订单 ${o.id} 的物流` }] });
}

function refundProgressTurn(ctx: Ctx, viaRule: boolean): Turn {
  const intent: IntentId = "refund_progress";
  const pick = pickOrder(ctx, (o) => o.afterSales.length > 0);
  if (pick.kind === "options") return askWhichOrder(intent, ctx, pick.orders, "查售后进度");
  if (pick.kind !== "order") {
    return (viaRule ? l1(intent, "R003", [{ text: "我没有找到您名下进行中的售后单。需要申请退换货的话，告诉我是哪一单就好～" }]) : noOrderTurn(intent, pick, "查售后进度"));
  }
  const o = pick.order;
  const a = o.afterSales[o.afterSales.length - 1];
  if (!a) {
    return l2(intent, 0.9, [{ text: `订单 ${o.id} 目前没有售后单。需要退换货的话告诉我就好～` }], { task: "done", slots: { orderId: o.id } });
  }
  const last = a.timeline[a.timeline.length - 1];
  const text =
    a.status === "refunding"
      ? `您的退货退款 ${a.id} 目前是「退款中」：${last.note}。`
      : `您的售后单 ${a.id} 当前进度：${last.note}。`;
  const reply: Reply = { text, card: { kind: "aftersale", afterSale: a } };
  const toolCalls = [{ name: "get_aftersale", ok: true, ms: viaRule ? 5 : 88 }];
  const slots: Slots = { orderId: o.id, itemId: a.itemId };
  return viaRule
    ? l1(intent, "R003", [reply], { slots, task: "done", toolCalls })
    : l2(intent, 0.91, [reply], { slots, task: "done", toolCalls });
}

function sizeTurn(ctx: Ctx): Turn {
  const intent: IntentId = "size_recommend";
  const productId = ctx.context.productId ?? ctx.slots.productId;
  const product = productId ? productOf(productId) : undefined;
  const body = parseBody(ctx.text);
  const buyer = MOCK_BUYERS.find((b) => b.id === ctx.buyerId);
  const heightCm = body.heightCm ?? ctx.slots.heightCm;
  const weightKg = body.weightKg ?? ctx.slots.weightKg;
  const slots: Slots = { ...(product ? { productId: product.id } : {}), ...(heightCm ? { heightCm } : {}), ...(weightKg ? { weightKg } : {}) };

  if (!heightCm || !weightKg) {
    const quick: ChatMessage["quickReplies"] =
      buyer?.heightCm && buyer.weightKg
        ? [{ label: `按档案推荐（${buyer.heightCm}cm / ${buyer.weightKg}kg）`, action: { type: "text", text: `我${buyer.heightCm}cm ${buyer.weightKg}kg，穿什么码？` } }]
        : undefined;
    return l2(
      intent,
      0.92,
      [{ text: "可以的～告诉我您的身高和体重（例如「160cm 50kg」），我来帮您推荐尺码。", quickReplies: quick }],
      { task: "collecting", slots },
    );
  }
  const rec = recommendSize(heightCm, weightKg, product?.fit);
  if (!rec) {
    return l2(
      intent,
      0.9,
      [{ text: "您的身高体重超出了尺码表的范围，我不太敢乱推荐。要不要让人工客服帮您看看？", quickReplies: [{ label: "转人工", action: { type: "quick_action", name: "human" } }] }],
      { task: "done", slots },
    );
  }
  const offered = product ? product.sizes.includes(rec.size) : true;
  const head = product ? `按您 ${heightCm}cm / ${weightKg}kg，「${product.name}」推荐 ${rec.size} 码。` : `按您 ${heightCm}cm / ${weightKg}kg，推荐 ${rec.size} 码（通用尺码表）。`;
  const replies: Reply[] = [
    {
      text: offered ? head : `${head}不过这款没有 ${rec.size} 码，可以看看相邻的尺码。`,
      card: { kind: "size_result", size: rec.size, basis: rec.basis, productId: product?.id },
    },
  ];
  let ragHits = 0;
  if (/洗|机洗|水洗|干洗|面料|材质|缩水/.test(ctx.text)) {
    if (product) {
      ragHits = 2;
      const machine = /机洗|可机洗/.test(product.care) && !/不可机洗/.test(product.care);
      replies.push({
        text: machine ? `这件可以机洗：${product.care}` : `这件不建议机洗哦：${product.care}`,
        card: {
          kind: "sources",
          sources: [
            { docTitle: "洗护指南", heading: product.material.split(" ")[0].replace(/\d+%?/, "") || "面料", snippet: product.care },
            { docTitle: "尺码指南", heading: "尺码表", snippet: `${rec.size} 码：身高 ${HEIGHT_RANGES[rec.size].join("–")} cm，体重 ${WEIGHT_RANGES[rec.size].join("–")} kg` },
          ],
        },
      });
    } else {
      replies.push({ text: "洗护方式因商品而异，您可以在商品页点「问客服」，我就能告诉您具体那件怎么洗啦～" });
    }
  }
  return l2(intent, 0.93, replies, {
    task: "done",
    slots,
    ragHits,
    usedGeneration: ragHits > 0,
    toolCalls: [{ name: "recommend_size", ok: true, ms: 3 }, ...(ragHits ? [{ name: "search_kb", ok: true, ms: 142 }] : [])],
    historyNotes: [{ type: "tool_call", name: "recommend_size", summary: `${heightCm}cm / ${weightKg}kg → ${rec.size} 码` }],
  });
}

function careTurn(ctx: Ctx): Turn {
  const productId = ctx.context.productId ?? ctx.slots.productId;
  const product = productId ? productOf(productId) : undefined;
  if (!product) {
    return l2("product_consult", 0.85, [{ text: "想了解哪件商品的洗护 / 面料呢？在商品页点「问客服」，我就能直接回答啦～" }], { task: null });
  }
  return l2(
    "product_consult",
    0.9,
    [
      {
        text: `「${product.name}」的材质是 ${product.material}。洗护建议：${product.care}`,
        card: { kind: "sources", sources: [{ docTitle: "洗护指南", heading: product.material.split(" ")[0].replace(/\d+%?/, ""), snippet: product.care }] },
      },
    ],
    { task: "done", slots: { productId: product.id }, ragHits: 2, usedGeneration: true, toolCalls: [{ name: "search_kb", ok: true, ms: 138 }] },
  );
}

function stockTurn(ctx: Ctx): Turn {
  const productId = ctx.context.productId ?? ctx.slots.productId;
  const product = productId ? productOf(productId) : undefined;
  if (!product) return l2("stock_check", 0.84, [{ text: "想查哪件商品的库存呢？在商品页点「问客服」我就能帮您看～" }], { task: null });
  const size = parseSize(ctx.text);
  const lines = product.colors.map((c) => {
    const skus = product.skus.filter((s) => s.color === c && (!size || s.size === size));
    const out = skus.filter((s) => s.stock <= 0);
    const low = skus.filter((s) => s.stock > 0 && s.stock <= 5);
    if (skus.length > 0 && out.length === skus.length) {
      const d = out[0].restockDate;
      return `${c}${size ? ` ${size} 码` : ""}：暂时缺货${d ? `，预计 ${mdText(d)}补货` : ""}`;
    }
    if (low.length > 0) {
      const lowText = low.map((s) => `${s.size} 码仅剩 ${s.stock} 件`).join("、");
      return size ? `${c}：${lowText}` : `${c}：${lowText}，其余现货充足`;
    }
    return size ? `${c} ${size} 码：现货充足` : `${c}：现货充足`;
  });
  return l2(
    "stock_check",
    0.92,
    [{ text: `「${product.name}」库存情况：\n${lines.join("\n")}`, card: { kind: "product", product } }],
    { task: "done", slots: { productId: product.id, ...(size ? { size } : {}) }, toolCalls: [{ name: "check_stock", ok: true, ms: 74 }] },
  );
}

function promotionTurn(ctx: Ctx): Turn {
  const coupons = availableCoupons(ctx.buyerId);
  return l2(
    "promotion",
    0.9,
    [
      {
        text: coupons.length > 0 ? `您目前有 ${coupons.length} 张可用优惠券，下单时会自动为您选最划算的一张：` : "您目前没有可用的优惠券。关注店铺活动，上新时会有新券哦～",
        card: coupons.length > 0 ? { kind: "coupons", coupons } : undefined,
      },
    ],
    { task: "done", toolCalls: [{ name: "list_coupons", ok: true, ms: 69 }] },
  );
}

function orderStatusTurn(ctx: Ctx): Turn {
  const intent: IntentId = "order_status";
  const pick = pickOrder(ctx, () => true);
  if (pick.kind === "options") return askWhichOrder(intent, ctx, pick.orders, "查看");
  if (pick.kind !== "order") return noOrderTurn(intent, pick, "查看");
  const o = pick.order;
  const hint =
    o.status === "pending_payment" ? "，还没有付款哦，请在 30 分钟内完成支付" : o.status === "paid" ? "，仓库正在备货，发货后会通知您" : "";
  return l2(intent, 0.9, [{ text: `订单 ${o.id} 目前是「${ORDER_STATUS_TEXT[o.status]}」${hint}。`, card: { kind: "order", order: o } }], {
    task: "done",
    slots: { orderId: o.id },
    toolCalls: [{ name: "get_order", ok: true, ms: 81 }],
  });
}

function pendingId(): string {
  return `PA${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;
}

/** 换货：L2（单步）或 L3（顺便查券的多步请求） */
function exchangeTurn(ctx: Ctx, multi: boolean): Turn {
  const intent: IntentId = multi ? "multi_step_complex" : "exchange";
  const wantsCoat = /外套|大衣/.test(ctx.text);
  const pick = pickOrder(
    ctx,
    (o) => (o.status === "delivered" || o.status === "completed") && o.afterSales.length === 0,
    wantsCoat ? (o) => o.items.some((i) => productOf(i.productId)?.category === "外套") : undefined,
    wantsCoat ? (o) => o.items.some((i) => productOf(i.productId)?.category === "外套") : undefined,
  );
  const fail = (text: string, extra: Partial<Turn> = {}): Turn =>
    multi
      ? agentTurn(intent, [{ text }], { task: "done", ...extra }, ctx)
      : l2(intent, 0.9, [{ text }], { task: "done", ...extra });
  if (pick.kind === "options") return askWhichOrder(intent, ctx, pick.orders, "换货");
  if (pick.kind !== "order") return noOrderTurn(intent, pick, "换货");
  const order = pick.order;
  const item = order.items.find((i) => (ctx.slots.itemId ? i.itemId === ctx.slots.itemId : wantsCoat ? productOf(i.productId)?.category === "外套" : true)) ?? order.items[0];
  const slots: Slots = { orderId: order.id, itemId: item.itemId, productId: item.productId };

  if (order.status !== "delivered" && order.status !== "completed") {
    return fail(`订单 ${order.id} 目前是「${ORDER_STATUS_TEXT[order.status]}」，签收后 7 天内才可以申请换货哦。`, { slots });
  }
  if (order.afterSales.some((a) => a.itemId === item.itemId)) {
    return fail(`订单 ${order.id} 的这件商品已经有售后单了（每单每件限换 1 次），可以点「退款进度」看看进展。`, { slots });
  }
  const signedDays = order.deliveredAt ? daysSince(order.deliveredAt) : 0;
  if (signedDays > 7) {
    return fail(`订单 ${order.id} 已签收 ${signedDays} 天，超过 7 天无理由换货期限了。如果是质量问题可以告诉我，我帮您转人工处理。`, { slots });
  }

  const newSize = parseSize(ctx.text) ?? (ctx.slots.size as Size | undefined);
  const product = productOf(item.productId);
  if (!newSize) {
    const opts = (product?.sizes ?? SIZES).filter((s) => s !== item.size);
    return l2(
      intent,
      0.9,
      [
        {
          text: `好的，帮您换「${describeItem(item)}」，想换成哪个尺码？`,
          card: {
            kind: "options",
            prompt: "请选择新尺码",
            options: opts.map((s) => {
              const st = skuStock(item.productId, item.color, s)?.stock ?? 0;
              return { label: `${s} 码`, value: `size:${s}`, sublabel: st > 0 ? (st <= 5 ? `仅剩 ${st} 件` : "现货充足") : "缺货" };
            }),
          },
        },
      ],
      { task: "collecting", slots },
    );
  }
  const sku = skuStock(item.productId, item.color, newSize);
  const stock = sku?.stock ?? 0;
  const toolCalls: RouteTrace["toolCalls"] = [
    { name: "list_orders", ok: true, ms: 168 },
    { name: "get_order", ok: true, ms: 91 },
    { name: "check_stock", ok: true, ms: 83 },
  ];
  if (stock <= 0) {
    const d = sku?.restockDate;
    return fail(`抱歉，「${item.productName}」${item.color} ${newSize} 码暂时缺货${d ? `，预计 ${mdText(d)}补货` : ""}。您可以换成别的尺码，或补货后再来找我～`, {
      slots: { ...slots, size: newSize },
      toolCalls,
    });
  }
  const pending: PendingAction = {
    id: pendingId(),
    conversationId: ctx.seed.conversation.id,
    tool: "request_exchange",
    args: { orderId: order.id, itemId: item.itemId, newSize },
    summary: `为订单 ${order.id} 的「${describeItem(item)}」申请换货，换为 ${newSize} 码（${item.color}，现货 ${stock} 件）`,
    status: "pending",
    createdAt: nowIso(),
  };
  const confirmReply: Reply = {
    text: `订单 ${order.id} 签收 ${signedDays} 天，在 7 天无理由内；${item.color} ${newSize} 码${stock <= 5 ? `仅剩 ${stock} 件` : "有货"}。确认换货吗？`,
    card: { kind: "confirm", pendingAction: pending },
  };
  if (!multi) {
    return l2(intent, 0.93, [confirmReply], {
      task: "awaiting_confirm",
      slots: { ...slots, size: newSize },
      pending,
      toolCalls: [...toolCalls, { name: "request_exchange", ok: true, ms: 12 }],
      historyNotes: [{ type: "pending_action", name: "request_exchange", summary: pending.summary }],
    });
  }
  const coupons = availableCoupons(ctx.buyerId);
  return agentTurn(
    intent,
    [
      confirmReply,
      {
        text: coupons.length > 0 ? `另外查了一下，您还有 ${coupons.length} 张可用优惠券，下次下单时可以用：` : "另外查了一下，您目前没有可用的优惠券。",
        card: coupons.length > 0 ? { kind: "coupons", coupons } : undefined,
      },
    ],
    {
      task: "awaiting_confirm",
      slots: { ...slots, size: newSize },
      pending,
      toolCalls: [...toolCalls, { name: "request_exchange", ok: true, ms: 14 }, { name: "list_coupons", ok: true, ms: 77 }],
      historyNotes: [{ type: "pending_action", name: "request_exchange", summary: pending.summary }],
    },
    ctx,
  );
}

function agentTurn(intent: IntentId, replies: Reply[], extra: Partial<Turn>, ctx: Ctx): Turn {
  void ctx;
  return {
    layer: "L3",
    intent,
    confidence: 0.82,
    replies,
    delayMs: 1700,
    totalMs: 3412,
    decideMs: 188,
    agentMs: 3224,
    decideProvider: "mock",
    usedGeneration: true,
    cost: { decideUsd: 0.00002, generationUsd: 0, agentUsd: 0.00318, totalUsd: 0.0032 },
    ...extra,
  };
}

function refundApplyTurn(ctx: Ctx): Turn {
  const intent: IntentId = "refund_apply";
  const pick = pickOrder(ctx, (o) => ["paid", "shipped", "delivered", "completed"].includes(o.status) && o.afterSales.length === 0);
  if (pick.kind === "options") return askWhichOrder(intent, ctx, pick.orders, "退款");
  if (pick.kind !== "order") return noOrderTurn(intent, pick, "退款");
  const order = pick.order;
  const item = order.items[0];
  const slots: Slots = { orderId: order.id, itemId: item.itemId };
  if (order.afterSales.length > 0) {
    return l2(intent, 0.9, [{ text: `订单 ${order.id} 已经有售后单 ${order.afterSales[0].id} 了，可以点「退款进度」查看。` }], { task: "done", slots });
  }
  const unshipped = order.status === "paid";
  if (!unshipped && order.deliveredAt && daysSince(order.deliveredAt) > 7) {
    return l2(intent, 0.9, [{ text: `订单 ${order.id} 已签收超过 7 天，超出无理由退货期限。如果是质量问题请告诉我，我帮您转人工处理。` }], { task: "done", slots });
  }
  const type = unshipped ? "refund_only" : "return_refund";
  const reason = ctx.text.replace(/QM\d{10}/g, "").slice(0, 30) || "买家申请";
  const pending: PendingAction = {
    id: pendingId(),
    conversationId: ctx.seed.conversation.id,
    tool: "apply_refund",
    args: { orderId: order.id, itemId: item.itemId, type, reason },
    summary: `为订单 ${order.id} 的「${describeItem(item)}」申请${type === "refund_only" ? "仅退款" : "退货退款"} ${money(item.unitPrice * item.quantity)}`,
    status: "pending",
    createdAt: nowIso(),
  };
  const buyer = MOCK_BUYERS.find((b) => b.id === ctx.buyerId);
  const freeShip = buyer?.memberLevel === "金卡" && type === "return_refund" ? "（金卡会员免退货运费）" : "";
  return l2(
    intent,
    0.9,
    [{ text: `好的，帮您整理好了申请${freeShip}，请确认：`, card: { kind: "confirm", pendingAction: pending } }],
    {
      task: "awaiting_confirm",
      slots,
      pending,
      toolCalls: [{ name: "get_order", ok: true, ms: 84 }, { name: "apply_refund", ok: true, ms: 11 }],
      historyNotes: [{ type: "pending_action", name: "apply_refund", summary: pending.summary }],
    },
  );
}

function fallbackTurn(ctx: Ctx): Turn {
  const n = ctx.seed.conversation.state.unresolvedTurns + 1;
  if (n >= 2) {
    return {
      ...agentTurn("other", [{ text: "这个问题我可能没理解对，为了不耽误您，我帮您转接人工客服～" }], {}, ctx),
      layer: "human",
      confidence: 0.41,
      task: null,
      unresolved: "inc",
      escalatedFrom: "L3",
      handoff: { reason: "连续 2 轮未能解决（unresolvedTurns ≥ 2）", summary: `买家${ctx.nickname}，问题 AI 连续两轮未能解决，需要人工跟进。` },
    };
  }
  return agentTurn(
    "other",
    [
      {
        text: "这个问题我需要再确认一下～您可以换个说法告诉我，或者直接点下方「转人工」。",
        quickReplies: [{ label: "转人工", action: { type: "quick_action", name: "human" } }, ...(QUICK_MENU ?? []).slice(0, 2)],
      },
    ],
    { confidence: 0.41, task: null, unresolved: "inc" },
    ctx,
  );
}

function humanTurn(ctx: Ctx, viaRule: boolean, reason = "买家主动要求人工客服"): Turn {
  const base: Partial<Turn> = {
    handoff: { reason, summary: `买家${ctx.nickname}，${intentLabel("human_request")}，${reason}。` },
    task: null,
    historyNotes: [{ type: "handoff", name: "human_request", summary: reason }],
  };
  return viaRule
    ? l1("human_request", "R001", [{ text: "好的，马上为您转接人工客服，请稍等～" }], base)
    : l2("human_request", 0.97, [{ text: "好的，马上为您转接人工客服，请稍等～" }], base);
}

// ───────────────────────── 风险闸门 ─────────────────────────

function riskGate(ctx: Ctx): Turn | null {
  const t = ctx.text;
  const hits: RiskKey[] = [];
  const scores: Partial<Record<RiskKey, number>> = { legal_threat: 0.02, health_safety: 0.02, fraud_security: 0.01, abuse_extreme: 0.01, emotion: 0.1 };
  if (/红疹|过敏|起疹|皮炎|红肿|起泡|刺痛|受伤|烫伤/.test(t)) {
    hits.push("health_safety");
    scores.health_safety = 0.93;
  }
  if (/12315|315|投诉|律师|起诉|曝光|消协|法院|赔偿/.test(t)) {
    hits.push("legal_threat");
    scores.legal_threat = 0.88;
  }
  if (/被盗|盗号|盗刷|诈骗|骗子|陌生地址|不是我下单|账号.*异常/.test(t)) {
    hits.push("fraud_security");
    scores.fraud_security = 0.91;
  }
  if (/去死|滚|傻[逼B]|垃圾店|骗人/.test(t)) {
    hits.push("abuse_extreme");
    scores.abuse_extreme = 0.9;
  }
  if (hits.length === 0) return null;
  scores.emotion = hits.includes("health_safety") ? 0.8 : 0.6;
  const reason = `风险闸门：${hits.map((h) => `${h} ${scores[h]!.toFixed(2)}`).join("；")}`;
  const orderId = ctx.context.orderId ?? ctx.slots.orderId ?? buyerOrders(ctx.buyerId).find((o) => o.status === "delivered")?.id;
  const summary = `买家${ctx.nickname}${orderId ? `（订单 ${orderId}）` : ""}反馈：${t.slice(0, 40)}。触发风险闸门（${hits.join("、")}），需立即人工跟进。`;
  return {
    layer: "risk_gate",
    intent: hits.includes("fraud_security") ? "other" : "quality_issue",
    confidence: 0.86,
    replies: [],
    delayMs: 350,
    totalMs: 203,
    decideMs: 198,
    decideProvider: "mock",
    cost: { decideUsd: 0.00002, generationUsd: 0, agentUsd: 0, totalUsd: 0.00002 },
    riskScores: scores,
    riskHit: hits,
    task: null,
    slots: orderId ? { orderId } : {},
    handoff: {
      reason,
      summary,
      flags: hits,
      systemText: "已为您转接人工客服，阿栖正在赶来",
    },
    historyNotes: [{ type: "handoff", name: "风险闸门", summary: reason }],
  };
}

// ───────────────────────── 路由：文本 → Turn ─────────────────────────

function routeText(ctx: Ctx): Turn {
  const raw = ctx.text.trim();
  const t = raw.replace(/\s+/g, "");

  const risk = riskGate(ctx);
  if (risk) return risk;

  // ── L1 规则（DATA_SPEC §5）
  if (t.length <= 12 && /人工|真人|转客服/.test(t)) return humanTurn(ctx, true);
  if (t.length <= 10 && /^(到哪了|物流|查物流|快递到哪了?|发货了吗)[?？!！。]*$/.test(t)) return logisticsTurn(ctx, true);
  if (t.length <= 12 && /退款(进度|到哪|到账|什么时候到)/.test(t)) return refundProgressTurn(ctx, true);
  if (t.length <= 8 && /^(你好|您好|在吗|在不在|hi|hello)[?？!！~。]*$/i.test(t)) {
    return l1("greeting", "R004", [{ text: "您好，我是栖木智能客服小栖～可以帮您查物流、看退款进度、推荐尺码，也可以直接告诉我想问什么。", quickReplies: QUICK_MENU }]);
  }
  if (t.length <= 10 && /发票/.test(t)) {
    return l1("invoice", "R005", [
      {
        text: "我们提供电子普通发票：确认收货后在订单详情页申请，1 个工作日内开具。",
        card: { kind: "sources", sources: [{ docTitle: "发票说明", heading: "开票流程", snippet: "电子普通发票，确认收货后在订单详情申请，1 个工作日内开具。" }] },
      },
    ]);
  }
  if (t.length <= 12 && /运费险/.test(t)) {
    return l1("return_policy", "R006", [{ text: "7 天无理由退货的订单可以投保运费险；金卡会员退货运费由我们承担，不需要另外购买哦。" }]);
  }

  // ── L2 / L3
  if (/(换|换成|换个|换一下).{0,6}(XS|XL|S|M|L|码|大一|小一|色)|换货|能换|想换/i.test(raw)) {
    const multi = /券|顺便|另外|还有|看看有没有/.test(raw);
    return exchangeTurn(ctx, multi);
  }
  if (/退款|退货|不想要|申请退/.test(raw)) {
    if (/进度|到哪|到账|怎么样了|什么时候/.test(raw)) return refundProgressTurn(ctx, false);
    return refundApplyTurn(ctx);
  }
  if (/物流|快递|发货|到哪|送到|几天到/.test(raw)) return logisticsTurn(ctx, false);
  if (/尺码|穿什么|身高|体重|公斤|斤|cm|厘米|[1][4-9]\d\s*[\d]{2}/i.test(raw) || /^\s*1[4-9]\d/.test(raw)) return sizeTurn(ctx);
  if (/洗|面料|材质|缩水|起球/.test(raw)) return careTurn(ctx);
  if (/库存|有货|缺货|补货/.test(raw)) return stockTurn(ctx);
  if (/券|优惠|折扣|满减|活动/.test(raw)) return promotionTurn(ctx);
  if (/订单|付款|支付|下单/.test(raw)) return orderStatusTurn(ctx);
  if (/人工|真人|转客服/.test(raw)) return humanTurn(ctx, false);

  return fallbackTurn(ctx);
}

// ───────────────────────── 落盘：把 Turn 变成消息 + trace + 会话状态 ─────────────────────────

function commitTurn(ctx: Ctx, buyerMsg: ChatMessage, turn: Turn): ChatMessage[] {
  const { seed } = ctx;
  const conv = seed.conversation;
  const traceId = `${conv.id}-T${seed.traces.length + 1}`;
  const stage = STAGE_OF[turn.intent] ?? "other";
  const trace: RouteTrace = {
    id: traceId,
    conversationId: conv.id,
    messageId: buyerMsg.id,
    at: nowIso(),
    layer: turn.layer,
    intent: turn.intent,
    stage,
    confidence: turn.confidence,
    topIntents: [
      { id: turn.intent, p: turn.confidence },
      { id: turn.intent === "other" ? "human_request" : "other", p: Math.round((1 - turn.confidence) * 55) / 100 },
    ],
    decideProvider: turn.decideProvider,
    riskScores: turn.riskScores,
    riskHit: turn.riskHit,
    ruleId: turn.ruleId,
    escalatedFrom: turn.escalatedFrom,
    handoffReason: turn.handoff?.reason,
    toolCalls: turn.toolCalls ?? [],
    usedGeneration: turn.usedGeneration ?? false,
    ragHits: turn.ragHits,
    latency: { totalMs: turn.totalMs, decideMs: turn.decideMs, handlerMs: turn.handlerMs, agentMs: turn.agentMs },
    cost: turn.cost ?? NO_COST,
  };
  seed.traces.push(trace);
  conv.lastLayer = turn.layer;

  const out: ChatMessage[] = [];
  for (const r of turn.replies) {
    out.push(addMessage(seed, "ai", r.text, { card: r.card, quickReplies: r.quickReplies, traceId }));
  }
  if (turn.handoff) {
    out.push(addMessage(seed, "system", turn.handoff.systemText ?? "已为您转接人工客服，阿栖正在赶来", { traceId }));
  }

  // 会话状态
  const st = conv.state;
  st.turnCount += 1;
  st.lastIntent = turn.intent;
  st.slots = { ...st.slots, ...ctx.slots, ...(turn.slots ?? {}) };
  if (turn.unresolved === "inc") st.unresolvedTurns += 1;
  if (turn.unresolved === "reset") st.unresolvedTurns = 0;
  if (turn.task === null) st.currentTask = null;
  else if (turn.task) st.currentTask = { intent: turn.intent, status: turn.task, startedAt: st.currentTask?.startedAt ?? nowIso() };
  pushHistory(seed, { type: "intent", name: turn.intent, summary: `识别为${intentLabel(turn.intent)}（${turn.layer}）` });
  for (const note of turn.historyNotes ?? []) pushHistory(seed, note);

  if (turn.pending) {
    seed.pendingActions.push(turn.pending);
    st.pendingActionId = turn.pending.id;
  }

  if (turn.handoff) {
    conv.mode = "human";
    conv.status = "waiting_human";
    conv.handoffReason = turn.handoff.reason;
    conv.handoffSummary = turn.handoff.summary;
    conv.handoffAt = nowIso();
    conv.unreadForSeller += 1;
    for (const f of turn.handoff.flags ?? []) {
      if (!conv.riskFlags.includes(f)) conv.riskFlags.push(f);
      if (!st.riskFlags.includes(f)) st.riskFlags.push(f);
    }
    if ((turn.handoff.flags ?? []).length > 0 && !conv.tags.includes("高风险")) conv.tags.push("高风险");
  }
  return out;
}

// ───────────────────────── 确认 / 取消 ─────────────────────────

function nextAfterSaleId(): string {
  const n = MOCK_ORDERS.reduce((acc, o) => acc + o.afterSales.length, 0) + 2;
  return `AS20261005${String(n).padStart(3, "0")}`;
}

function setCardStatus(seed: Seed, pending: PendingAction) {
  for (const m of seed.messages) {
    if (m.card?.kind === "confirm" && m.card.pendingAction.id === pending.id) {
      m.card = { kind: "confirm", pendingAction: clone(pending) };
    }
  }
}

function confirmTurn(ctx: Ctx, action: Extract<ChatAction, { type: "confirm" }>): Turn {
  const pending = ctx.seed.pendingActions.find((p) => p.id === action.pendingActionId);
  const base = { layer: "action" as Layer, intent: "other" as IntentId, confidence: 1, delayMs: 650, totalMs: 38, cost: NO_COST };
  if (!pending) {
    return { ...base, replies: [{ text: "这个操作已经找不到了，请重新告诉我您想办理的事情～" }], task: null };
  }
  if (pending.status !== "pending") {
    return { ...base, replies: [{ text: `这个操作已经处理过了（${pending.status === "confirmed" ? "已确认" : "已取消"}）。` }], task: null };
  }
  const intent: IntentId = pending.tool === "apply_refund" ? "refund_apply" : "exchange";
  const resolvedAt = nowIso();
  if (!action.confirm) {
    pending.status = "cancelled";
    pending.resolvedAt = resolvedAt;
    pending.result = "买家取消";
    setCardStatus(ctx.seed, pending);
    ctx.seed.conversation.state.pendingActionId = undefined;
    return {
      ...base,
      intent,
      replies: [{ text: "好的，已为您取消本次操作，没有任何改动。还有其他需要帮忙的吗？", quickReplies: QUICK_MENU }],
      task: null,
      historyNotes: [{ type: "cancel", name: pending.tool, summary: `买家取消：${pending.summary}` }],
    };
  }

  const args = pending.args as { orderId: string; itemId: string; newSize?: Size; type?: "refund_only" | "return_refund"; reason?: string };
  const order = MOCK_ORDERS.find((o) => o.id === args.orderId);
  const item = order?.items.find((i) => i.itemId === args.itemId);
  if (!order || !item) {
    pending.status = "failed";
    pending.resolvedAt = resolvedAt;
    pending.result = "订单不存在";
    setCardStatus(ctx.seed, pending);
    return { ...base, intent, replies: [{ text: "抱歉，办理失败了：没有找到对应的订单。" }], task: null };
  }
  const isExchange = pending.tool === "request_exchange";
  const afterSale: AfterSale = {
    id: nextAfterSaleId(),
    orderId: order.id,
    itemId: item.itemId,
    type: isExchange ? "exchange" : args.type ?? "return_refund",
    reason: isExchange ? `换货：${item.size} 码换 ${args.newSize} 码` : (args.reason ?? "买家申请"),
    amount: isExchange ? 0 : item.unitPrice * item.quantity,
    newSize: isExchange ? args.newSize : undefined,
    newColor: undefined,
    status: "pending_review",
    createdAt: resolvedAt,
    timeline: [{ at: resolvedAt, status: "pending_review", note: isExchange ? `已提交换货申请（${item.size} 码 → ${args.newSize} 码），等待商家审核` : "已提交退货退款申请，等待商家审核" }],
  };
  order.afterSales.push(afterSale);
  pending.status = "confirmed";
  pending.resolvedAt = resolvedAt;
  pending.result = `已创建售后单 ${afterSale.id}`;
  setCardStatus(ctx.seed, pending);
  ctx.seed.conversation.state.pendingActionId = undefined;
  const tail = isExchange ? "请在 7 天内寄回原商品，我们收到后 24 小时内发出新件。" : "请在 7 天内寄回商品，商家确认收货后 24 小时内发起退款。";
  return {
    ...base,
    intent,
    replies: [{ text: `已为您提交，售后单号 ${afterSale.id}。${tail}`, card: { kind: "aftersale", afterSale } }],
    task: "done",
    toolCalls: [{ name: pending.tool, ok: true, ms: 36 }],
    historyNotes: [{ type: "confirm", name: pending.tool, summary: `买家确认：${pending.summary}` }],
  };
}

// ───────────────────────── 快捷按钮 / 选项 ─────────────────────────

const QUICK_LABEL = { track_logistics: "查物流", refund_progress: "退款进度", size_recommend: "尺码推荐", human: "转人工" } as const;

function lastOptions(seed: Seed): Extract<ChatCard, { kind: "options" }> | undefined {
  for (let i = seed.messages.length - 1; i >= 0; i--) {
    const c = seed.messages[i].card;
    if (c?.kind === "options") return c;
  }
  return undefined;
}

function routeAction(ctx: Ctx, action: ChatAction): Turn {
  if (action.type === "quick_action") {
    // 快捷按钮是 L1 入口：quick_action 优先于正则
    const byName = { track_logistics: logisticsTurn, refund_progress: refundProgressTurn } as const;
    if (action.name === "track_logistics" || action.name === "refund_progress") {
      const t = byName[action.name](ctx, true);
      return { ...t, ruleId: `quick:${action.name}` };
    }
    if (action.name === "size_recommend") return { ...sizeTurn(ctx), layer: "L1", ruleId: "quick:size_recommend", totalMs: 8, cost: l1Cost, delayMs: 300 };
    return { ...humanTurn(ctx, true, "买家点击了「转人工」按钮"), ruleId: "quick:human" };
  }
  // select_option：回应 options 卡片
  const v = (action as Extract<ChatAction, { type: "select_option" }>).value;
  const task = ctx.seed.conversation.state.currentTask;
  if (v.startsWith("size:")) {
    ctx.slots = { ...ctx.slots, size: v.slice(5) as Size };
    return exchangeTurn({ ...ctx, text: `换成${v.slice(5)}` }, false);
  }
  if (/^QM\d{10}$/.test(v)) {
    ctx.slots = { ...ctx.slots, orderId: v };
    const intent = task?.intent ?? ctx.seed.conversation.state.lastIntent;
    const c2 = { ...ctx, context: { ...ctx.context, orderId: v } };
    switch (intent) {
      case "refund_progress":
        return refundProgressTurn(c2, false);
      case "exchange":
      case "multi_step_complex":
        return exchangeTurn(c2, false);
      case "refund_apply":
        return refundApplyTurn(c2);
      case "order_status":
        return orderStatusTurn(c2);
      default:
        return logisticsTurn(c2, false);
    }
  }
  return l2("other", 0.5, [{ text: "收到～请问还有什么可以帮您？", quickReplies: QUICK_MENU }]);
}

// ───────────────────────── 对外：mock API ─────────────────────────

/** 演示「接口失败 → 可重试的错误气泡」：发送「模拟故障」，第一次必定失败，点重试后恢复。 */
let faultArmed = true;

export async function mockSendChat(req: ChatRequest): Promise<ChatResponse> {
  const buyer = MOCK_BUYERS.find((b) => b.id === req.buyerId);
  if (!buyer) throw new MockApiError("NOT_FOUND", "没有找到这位买家", 404);
  if (!req.text?.trim() && !req.action) throw new MockApiError("BAD_REQUEST", "请输入想咨询的内容", 400);
  if (req.text?.trim() === "模拟故障") {
    if (faultArmed) {
      faultArmed = false;
      await sleep(400);
      throw new MockApiError("UPSTREAM_ERROR", "客服系统暂时开小差了，请点击重试", 503);
    }
    faultArmed = true;
  }

  let seed = req.conversationId ? findSeed(req.conversationId) : undefined;
  if (seed && seed.conversation.buyerId !== req.buyerId) throw new MockApiError("FORBIDDEN", "这个会话不属于当前买家", 403);
  if (!seed || seed.conversation.status === "closed") seed = latestSeedOf(req.buyerId) ?? createSeed(req.buyerId);

  const conv = seed.conversation;
  const action = req.action;
  const context = req.context ?? {};

  // 买家消息的文字
  let buyerText = req.text?.trim() ?? "";
  if (action) {
    if (action.type === "quick_action") buyerText = QUICK_LABEL[action.name];
    else if (action.type === "text") buyerText = action.text;
    else if (action.type === "confirm") buyerText = action.confirm ? "确认办理" : "取消";
    else if (action.type === "select_option") {
      const opt = lastOptions(seed)?.options.find((o) => o.value === action.value);
      buyerText = opt ? `${opt.label}${opt.sublabel ? `（${opt.sublabel}）` : ""}` : action.value;
    }
  }
  const textForRouting = action?.type === "text" ? action.text : (req.text?.trim() ?? "");
  const buyerMsg = addMessage(seed, "buyer", buyerText);
  if (conv.mode === "human") {
    // 人工模式：AI 不回复，只通知卖家
    conv.unreadForSeller += 1;
    await sleep(120);
    return { conversation: clone(conv), messages: [clone(buyerMsg)] };
  }

  const ctx: Ctx = { seed, buyerId: buyer.id, nickname: buyer.nickname, text: textForRouting, context, slots: { ...conv.state.slots } };
  let turn: Turn;
  if (action?.type === "confirm") turn = confirmTurn(ctx, action);
  else if (action?.type === "quick_action" || action?.type === "select_option") turn = routeAction(ctx, action);
  else turn = routeText(ctx);

  await sleep(turn.delayMs);
  const replies = commitTurn(ctx, buyerMsg, turn);
  const trace = seed.traces[seed.traces.length - 1];
  return {
    conversation: clone(conv),
    messages: [clone(buyerMsg), ...replies.map(clone)],
    trace: req.debug ? clone(trace) : undefined,
  };
}

export async function mockGetConversationMessages(conversationId: string, after?: string) {
  await sleep(60);
  const seed = findSeed(conversationId);
  if (!seed) throw new MockApiError("NOT_FOUND", "没有找到这个会话", 404);
  let list = seed.messages;
  if (after) {
    const idx = seed.messages.findIndex((m) => m.id === after);
    if (idx >= 0) list = seed.messages.slice(idx + 1);
  }
  return { messages: clone(list), conversation: clone(seed.conversation) };
}

export async function mockGetLatestConversation(buyerId: string) {
  await sleep(100);
  const seed = latestSeedOf(buyerId);
  if (!seed) return { conversation: null, messages: [] as ChatMessage[] };
  return { conversation: clone(seed.conversation), messages: clone(seed.messages) };
}

// ───────────────────────── 单标签页演示辅助 ─────────────────────────
//
// mock 模式下，买家端和卖家端是两个标签页，各自有一份内存数据，互相看不到。
// 想在只有一个标签页的情况下演示「剧本第 5 步：卖家接管 → 买家实时收到」，可以在浏览器控制台里运行：
//   __qimuMock.takeover()            // 阿栖接管最近一个买家会话
//   __qimuMock.reply("您好，我是阿栖") // 阿栖回复（买家聊天窗 2 秒内收到）
//   __qimuMock.release()             // 交还 AI
// 真实后端（NEXT_PUBLIC_USE_MOCK=0）下不会挂载。

function latestBuyerSeedAny(): Seed | undefined {
  return mockSellerStore()
    .filter((s) => buyerConvIds.has(s.conversation.id))
    .sort((a, b) => Date.parse(b.conversation.updatedAt) - Date.parse(a.conversation.updatedAt))[0];
}

if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_USE_MOCK !== "0") {
  const need = () => {
    const seed = latestBuyerSeedAny();
    if (!seed) throw new Error("还没有买家会话：先在聊天窗里发一条消息");
    return seed.conversation.id;
  };
  (window as unknown as { __qimuMock?: unknown }).__qimuMock = {
    takeover: () => mockTakeover(need()),
    reply: (text: string) => mockReply(need(), text),
    release: () => mockRelease(need()),
  };
}
