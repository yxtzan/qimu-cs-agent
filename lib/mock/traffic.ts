/**
 * 看板 mock 用的"种子流量"（虚构的统计样本，对应后端 scripts/gen-traffic.ts）。
 *
 * - 约 295 条历史消息的 RouteTrace，时间分布在 DEMO_NOW 前 7 天（含今天 00:00–10:00）。
 * - 层级占比按 docs/ARCHITECTURE.md §7：风险 4% / L1 22% / L2 56% / L3 12% / 人工 6%（用精确计数 + 固定种子打乱，每次结果一致）。
 * - 点击看板里的低置信度样本会跳到 /seller/c/S1xxx，这里能按需还原出对应的模拟会话（isSimulated=true，不出现在会话列表）。
 * - 只依赖 lib/types.ts，不依赖其它 mock 文件，避免循环引用。
 */
import { DEMO_NOW } from "@/lib/demo-clock";
import type { ChatMessage, Conversation, IntentId, Layer, RiskKey, RouteTrace, Stage } from "@/lib/types";

// ───────────────────────── 可复现的随机数 ─────────────────────────

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ───────────────────────── 配置 ─────────────────────────

export const STAGE_OF_INTENT: Record<IntentId, Stage> = {
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
  human_request: "other",
  greeting: "other",
  multi_step_complex: "other",
  other: "other",
};

/** 每层的意图精确计数（总和 = 295）。 */
const PLAN: Record<Exclude<Layer, "action">, [IntentId, number][]> = {
  risk_gate: [
    ["quality_issue", 6],
    ["other", 3],
    ["refund_apply", 2],
    ["order_status", 1],
  ],
  L1: [
    ["logistics_track", 26],
    ["human_request", 11],
    ["greeting", 9],
    ["order_status", 6],
    ["promotion", 5],
    ["shipping_policy", 5],
    ["invoice", 3],
  ],
  L2: [
    ["size_recommend", 24],
    ["product_consult", 22],
    ["order_status", 14],
    ["logistics_track", 14],
    ["refund_progress", 14],
    ["stock_check", 10],
    ["return_policy", 10],
    ["shipping_policy", 8],
    ["urge_shipping", 8],
    ["modify_order", 8],
    ["refund_apply", 8],
    ["cancel_order", 6],
    ["promotion", 6],
    ["exchange", 6],
    ["invoice", 4],
    ["quality_issue", 3],
  ],
  L3: [
    ["multi_step_complex", 24],
    ["exchange", 5],
    ["refund_apply", 4],
    ["quality_issue", 2],
  ],
  human: [
    ["human_request", 9],
    ["quality_issue", 5],
    ["refund_apply", 3],
    ["other", 1],
  ],
};

/** 过去 6 天 + 今天（00:00–10:00）每天的消息数。 */
const PER_DAY = [38, 44, 41, 52, 40, 48, 32];

const TEXTS: Record<IntentId, string[]> = {
  logistics_track: ["到哪了", "我的快递怎么还没到", "查下物流", "发货了吗？快递单号多少"],
  human_request: ["转人工", "找人工客服", "我要真人", "人工在吗"],
  greeting: ["你好", "在吗", "谢谢啦", "好的，没事了"],
  order_status: ["我的订单什么状态", "订单付款成功了吗", "昨天下的单现在怎么样了"],
  promotion: ["有优惠码吗", "现在有什么活动", "满减券怎么用"],
  invoice: ["可以开发票吗", "发票抬头怎么填"],
  shipping_policy: ["多久发货", "运费怎么算", "默认发什么快递"],
  product_consult: ["这件能机洗吗", "面料是什么材质的", "会不会起球", "羊毛大衣怎么保养"],
  size_recommend: ["我160cm 50kg穿什么码", "165 55kg 选M还是L", "胯宽一点选什么码"],
  stock_check: ["燕麦色L码还有货吗", "这款还会补货吗", "S码什么时候有"],
  return_policy: ["能七天无理由退货吗", "退货运费谁出", "拆了吊牌还能退吗"],
  refund_progress: ["退款到哪一步了", "我的退款多久到账", "退款申请通过了吗"],
  urge_shipping: ["怎么还没发货，能快点吗", "今天能发出吗", "催一下发货"],
  modify_order: ["地址填错了能改吗", "想换个收货地址", "改一下收件人手机号"],
  cancel_order: ["我想取消订单", "不想要了，怎么取消", "拍错了能取消吗"],
  refund_apply: ["我要退款", "这件想退货，尺码不合适", "申请退货退款"],
  exchange: ["想把M换成L", "可以换个颜色吗", "换货怎么操作"],
  quality_issue: ["袖口开线了", "收到的衣服有污渍", "衣服有色差，质量不行"],
  other: ["我账号好像被盗了", "你们老板在吗", "随便问问"],
  multi_step_complex: [
    "上周买的那件外套换成L，顺便看看有没有券",
    "帮我查下订单，不合适的话换大一码，再看有没有优惠",
    "退掉那条裙子，再帮我推荐个尺码买另一件",
  ],
};

/** 低置信度样本：意思含糊、模型拿不准的话。 */
const VAGUE_TEXTS = [
  "那个能不能弄一下",
  "我上次说的那个事情处理得怎么样了",
  "帮我看看这个，还有之前那个",
  "这个和那个哪个好",
  "算了你们看着办吧",
  "我要的东西怎么还是这样",
  "就上次那个，你懂的",
  "可以便宜点吗，不然我就不要了",
  "怎么回事啊",
  "嗯？？",
];

const RISK_OF_INTENT: Partial<Record<IntentId, RiskKey>> = {
  quality_issue: "health_safety",
  other: "fraud_security",
  refund_apply: "legal_threat",
  order_status: "emotion",
};

const L1_RULES = ["R001", "R002", "R003", "R004", "R005", "R006"];

// ───────────────────────── 生成 ─────────────────────────

export interface SimTrace {
  trace: RouteTrace;
  /** 买家原话（看板低置信度列表要展示） */
  text: string;
}

function dateStr(daysAgo: number): string {
  const base = Date.parse(`${DEMO_NOW.slice(0, 10)}T00:00:00Z`);
  return new Date(base - daysAgo * 86400000).toISOString().slice(0, 10);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 一天里各小时的相对热度（夜里很少，上午 10–12、下午 14–17、晚上 20–22 是高峰）。 */
const HOUR_WEIGHT = [1, 0.5, 0.3, 0.2, 0.2, 0.4, 1, 2, 4, 6, 8, 7, 5, 5, 7, 8, 8, 7, 6, 6, 8, 9, 7, 3];

function pickWeighted(rng: () => number, weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

const round = (n: number, d = 5) => Math.round(n * 10 ** d) / 10 ** d;

let cache: SimTrace[] | null = null;

export function simulatedTraffic(): SimTrace[] {
  if (cache) return cache;
  const rng = mulberry32(20261005);
  const between = (lo: number, hi: number) => lo + rng() * (hi - lo);

  // 1) 精确计数的 (layer, intent) 列表。
  //    每一层的消息（意图先打乱）均匀撒在整个时间轴上，这样"今天"和"每一天"的层级占比都接近总体占比，而不是随机抖动。
  const keyed: { key: number; layer: Exclude<Layer, "action">; intent: IntentId }[] = [];
  for (const [layer, plan] of Object.entries(PLAN) as [Exclude<Layer, "action">, [IntentId, number][]][]) {
    const intents: IntentId[] = [];
    for (const [intent, n] of plan) for (let i = 0; i < n; i++) intents.push(intent);
    for (let i = intents.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [intents[i], intents[j]] = [intents[j], intents[i]];
    }
    intents.forEach((intent, i) => keyed.push({ key: (i + rng()) / intents.length, layer, intent }));
  }
  const slots = keyed.sort((a, b) => a.key - b.key);

  // 2) 时间戳：按天数量 + 小时热度，今天只到 09:59
  const stamps: string[] = [];
  PER_DAY.forEach((count, idx) => {
    const daysAgo = PER_DAY.length - 1 - idx;
    const date = dateStr(daysAgo);
    const maxHour = daysAgo === 0 ? 9 : 23;
    const weights = HOUR_WEIGHT.slice(0, maxHour + 1);
    for (let i = 0; i < count; i++) {
      const h = pickWeighted(rng, weights);
      const mi = Math.floor(rng() * 60);
      const s = Math.floor(rng() * 60);
      stamps.push(`${date}T${pad(h)}:${pad(mi)}:${pad(s)}+08:00`);
    }
  });
  stamps.sort();

  // 3) 逐条生成，并把相邻的几条归入同一会话
  const out: SimTrace[] = [];
  let convNo = 1000;
  let convId = "";
  let convDay = "";
  let convSize = 0;
  const perConv = new Map<string, number>();

  slots.forEach((slot, i) => {
    const at = stamps[i];
    const day = at.slice(0, 10);
    if (!convId || day !== convDay || convSize >= 3 || rng() < 0.55) {
      convNo += 1;
      convId = `S${convNo}`;
      convDay = day;
      convSize = 0;
    }
    convSize += 1;
    const k = (perConv.get(convId) ?? 0) + 1;
    perConv.set(convId, k);

    const { layer, intent } = slot;
    let confidence: number;
    let latency: RouteTrace["latency"];
    let decideUsd = 0;
    let generationUsd = 0;
    let agentUsd = 0;

    if (layer === "L1") {
      confidence = 1;
      latency = { totalMs: Math.round(between(3, 14)) };
    } else if (layer === "L2") {
      confidence = round(between(0.72, 0.98), 2);
      const decideMs = Math.round(between(170, 215));
      const handlerMs = Math.round(between(150, 430));
      latency = { totalMs: decideMs + handlerMs, decideMs, handlerMs };
      decideUsd = 0.00002;
      generationUsd = rng() < 0.5 ? round(between(0.00004, 0.00012)) : 0;
    } else if (layer === "L3") {
      confidence = intent === "multi_step_complex" ? round(between(0.55, 0.88), 2) : round(between(0.42, 0.78), 2);
      const decideMs = Math.round(between(175, 225));
      const agentMs = Math.round(between(3200, 6800));
      latency = { totalMs: decideMs + agentMs, decideMs, agentMs };
      decideUsd = 0.00002;
      agentUsd = round(between(0.0025, 0.0043));
    } else if (layer === "risk_gate") {
      confidence = round(between(0.5, 0.94), 2);
      const decideMs = Math.round(between(175, 230));
      latency = { totalMs: decideMs + Math.round(between(2, 12)), decideMs };
      decideUsd = 0.00002;
    } else {
      confidence = round(between(0.5, 0.95), 2);
      const decideMs = Math.round(between(175, 215));
      const handlerMs = Math.round(between(80, 300));
      latency = { totalMs: decideMs + handlerMs, decideMs, handlerMs };
      decideUsd = 0.00002;
      generationUsd = rng() < 0.3 ? round(between(0.00003, 0.00006)) : 0;
    }

    const vague = layer !== "L1" && confidence < 0.7;
    const pool = vague ? VAGUE_TEXTS : TEXTS[intent];
    const text = pool[Math.floor(rng() * pool.length)];

    const riskKey = RISK_OF_INTENT[intent] ?? "emotion";
    const trace: RouteTrace = {
      id: `${convId}-T${k}`,
      conversationId: convId,
      messageId: `${convId}-M${2 * k - 1}`,
      at,
      layer,
      intent,
      stage: STAGE_OF_INTENT[intent],
      confidence,
      decideProvider: layer === "L1" ? undefined : "jev",
      ruleId: layer === "L1" ? L1_RULES[Math.floor(rng() * L1_RULES.length)] : undefined,
      riskHit: layer === "risk_gate" ? [riskKey] : undefined,
      riskScores: layer === "risk_gate" ? { [riskKey]: round(between(0.82, 0.97), 2) } : undefined,
      handoffReason: layer === "risk_gate" ? `风险闸门：${riskKey}` : layer === "human" ? "需要人工处理" : undefined,
      toolCalls: layer === "L3" ? [{ name: "get_order", ok: true, ms: 70 }] : [],
      usedGeneration: generationUsd > 0,
      latency,
      cost: {
        decideUsd,
        generationUsd,
        agentUsd,
        totalUsd: round(decideUsd + generationUsd + agentUsd),
        estimated: true,
      },
      isSimulated: true,
    };
    out.push({ trace, text });
  });

  cache = out;
  return out;
}

// ───────────────────────── 还原模拟会话（让看板的样本能点进去） ─────────────────────────

const SIM_BUYERS = ["B001", "B002", "B003", "B004", "B005", "B006", "B007"];

export function buildSimulatedSeed(conversationId: string) {
  if (!/^S\d+$/.test(conversationId)) return null;
  const items = simulatedTraffic().filter((s) => s.trace.conversationId === conversationId);
  if (items.length === 0) return null;

  const messages: ChatMessage[] = [];
  items.forEach(({ trace, text }, idx) => {
    messages.push({
      id: trace.messageId,
      conversationId,
      role: "buyer",
      text,
      createdAt: trace.at,
    });
    const handoff = trace.layer === "risk_gate" || trace.layer === "human";
    messages.push({
      id: `${conversationId}-M${2 * (idx + 1)}`,
      conversationId,
      role: handoff ? "system" : "ai",
      text: handoff ? "已为您转接人工客服，阿栖正在赶来" : "（模拟历史数据）已为您处理，如还有疑问随时告诉我～",
      traceId: trace.id,
      createdAt: trace.at,
    });
  });

  const first = items[0].trace;
  const last = items[items.length - 1].trace;
  const conversation: Conversation = {
    id: conversationId,
    buyerId: SIM_BUYERS[Number(conversationId.slice(1)) % SIM_BUYERS.length],
    mode: "ai",
    status: "closed",
    riskFlags: [],
    tags: ["模拟历史数据"],
    lastLayer: last.layer,
    state: {
      currentTask: null,
      slots: {},
      history: [],
      lastIntent: last.intent,
      turnCount: items.length,
      unresolvedTurns: 0,
      riskFlags: [],
    },
    createdAt: first.at,
    updatedAt: last.at,
    lastMessagePreview: items[items.length - 1].text,
    unreadForSeller: 0,
    isSimulated: true,
  };

  return {
    conversation,
    messages,
    traces: items.map((s) => ({ ...s.trace })),
    pendingActions: [],
  };
}
