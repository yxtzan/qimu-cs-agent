/**
 * 种子流量（T17，ARCHITECTURE §7）：生成"虚构的统计样本"，让看板打开就有内容。
 *
 * - 约 60 个历史会话、295 条买家消息，每条买家消息配一条 AI（或转人工系统）回复和一条 RouteTrace。
 * - 全部 `isSimulated: true`；会话 id 为 S1001…，不会出现在卖家会话列表，只能从看板样本点进去。
 * - 层级占比（精确计数）：风险 12 / L1 65 / L2 165 / L3 35 / 人工 18 = 4% / 22% / 56% / 12% / 6%。
 * - 延迟：L1 20–50ms，L2 300–600ms，L3 3–9s。
 * - 成本：每条消息都有后台风险检查费 `decideUsd = $0.000059`（T01b / T04-3，含 L1）。
 *   L3 的 `agentUsd` 取 $0.00008–$0.0002，不沿用早期编的 $0.002–0.005。
 *   依据：T05 两条验收样本平均 agentUsd $0.000112（加分类后约 $0.00017，约为只有分类费的 L2 的 2–3 倍）；
 *   T05b 评测里多数 L3 trace 的 agentUsd 约 $0.00007–$0.00019（`docs/reports/T05b-latency.json`）。
 *   个别六轮样本到 $0.0007，不拿来拉高演示带。从 L3 失败转人工的那几条用同一档 agent 成本。
 *   L3 延迟按 T05b 整轮样本（约 2.1–9.8s，热态 decide 约 360–400ms）取 3–9s。
 * - 时间：DEMO_NOW 前 7 天（含今天 00:00–10:00），白天多、夜里少。
 * - 固定随机种子，同一份代码每次生成的结果逐字节一致。
 * - 通过 registerResetHook("traffic", …) 接入"重置演示数据"（登记入口见 lib/store/reset-hooks.ts）。
 */
import { DEMO_NOW } from "../demo-clock";
import { readCollection, StoreError } from "../store";
import { replaceSimulatedHistory } from "../store/conversations";
import { registerResetHook } from "../store/reset";
import type {
  ChatMessage,
  Conversation,
  IntentId,
  Layer,
  RiskKey,
  RouteTrace,
} from "../types";
import { STAGE_OF_INTENT } from "./intents";

// ───────────────────────── 配置 ─────────────────────────

const SEED = 20261005;
/** Jev 实测单次决策成本（T01b：$0.000058968）。 */
const JEV_DECIDE_USD = 0.000059;

type FunnelLayer = Exclude<Layer, "action">;

/** 每层的意图精确计数（总和 = 295）。 */
const PLAN: Record<FunnelLayer, [IntentId, number][]> = {
  risk_gate: [
    ["quality_issue", 6],
    ["other", 3],
    ["refund_apply", 2],
    ["order_status", 1],
  ],
  L1: [
    ["logistics_track", 28],
    ["human_request", 12],
    ["greeting", 10],
    ["refund_progress", 7],
    ["invoice", 4],
    ["return_policy", 3],
    ["size_recommend", 1],
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

/** 从今天往前数 6 天…今天（今天只到 10:00）每天的买家消息数，合计 295。 */
const PER_DAY = [38, 44, 41, 52, 40, 48, 32];

/** 一天里各小时的相对热度（夜里很少，上午 10–12、下午 14–17、晚上 20–22 是高峰）。 */
const HOUR_WEIGHT = [1, 0.5, 0.3, 0.2, 0.2, 0.4, 1, 2, 4, 6, 8, 7, 5, 5, 7, 8, 8, 7, 6, 6, 8, 9, 7, 3];

/** L1 规则命中：意图 → 规则编号（对应 data/seed/rules.json 里的 R001–R007）。 */
const L1_RULE: Partial<Record<IntentId, string>> = {
  human_request: "R001",
  logistics_track: "R002",
  refund_progress: "R003",
  greeting: "R004",
  invoice: "R005",
  return_policy: "R006",
  size_recommend: "R007",
};

const RISK_OF_INTENT: Partial<Record<IntentId, RiskKey>> = {
  quality_issue: "health_safety",
  other: "fraud_security",
  refund_apply: "legal_threat",
  order_status: "emotion",
};

// ───────────────────────── 买家话术 ─────────────────────────

/** 每个意图的多种说法（L2 默认用这些；L1 另有更短、能被规则命中的说法）。 */
const TEXTS: Record<IntentId, string[]> = {
  logistics_track: ["我的快递到哪了呀", "帮我查下物流", "发货了吗？快递单号多少", "昨天买的什么时候能到"],
  human_request: ["转人工", "找人工客服", "我要真人", "人工在吗"],
  greeting: ["你好", "在吗", "谢谢啦", "好的，没事了"],
  order_status: ["我的订单什么状态", "订单付款成功了吗", "昨天下的单现在怎么样了", "帮我看下最近那单"],
  promotion: ["有优惠码吗", "现在有什么活动", "满减券怎么用", "新人有优惠吗"],
  invoice: ["可以开发票吗", "发票抬头怎么填", "开票要多久"],
  shipping_policy: ["多久发货", "运费怎么算", "默认发什么快递", "能发顺丰吗"],
  product_consult: ["这件能机洗吗", "面料是什么材质的", "会不会起球", "羊毛大衣怎么保养", "这条裙子会透吗"],
  size_recommend: ["我160cm 50kg穿什么码", "165 55kg 选M还是L", "胯宽一点选什么码", "身高170体重60kg，选哪个码"],
  stock_check: ["燕麦色L码还有货吗", "这款还会补货吗", "S码什么时候有", "黑色M码有现货吗"],
  return_policy: ["能七天无理由退货吗", "退货运费谁出", "拆了吊牌还能退吗", "穿过一次还能退吗"],
  refund_progress: ["退款到哪一步了", "我的退款多久到账", "退款申请通过了吗"],
  urge_shipping: ["怎么还没发货，能快点吗", "今天能发出吗", "催一下发货", "能加急发货吗"],
  modify_order: ["地址填错了能改吗", "想换个收货地址", "改一下收件人手机号"],
  cancel_order: ["我想取消订单", "不想要了，怎么取消", "拍错了能取消吗"],
  refund_apply: ["我要退款", "这件想退货，尺码不合适", "申请退货退款"],
  exchange: ["想把M换成L", "可以换个颜色吗", "换货怎么操作"],
  quality_issue: ["袖口开线了", "收到的衣服有污渍", "衣服有色差，质量不行"],
  other: ["随便问问", "你们是真人吗", "店铺在哪个城市"],
  multi_step_complex: [
    "上周买的那件外套换成L，顺便看看有没有券",
    "帮我查下订单，不合适的话换大一码，再看有没有优惠",
    "退掉那条裙子，再帮我推荐个尺码买另一件",
  ],
};

/** L1 规则能直接命中的说法（短句，贴合 data/seed/rules.json 里的正则）。 */
const L1_TEXTS: Partial<Record<IntentId, string[]>> = {
  logistics_track: ["到哪了", "查物流", "快递到哪了", "物流", "发货了吗？"],
  human_request: ["转人工", "找人工客服", "我要真人", "人工在吗", "转客服"],
  greeting: ["你好", "在吗", "您好", "在不在", "hi"],
  refund_progress: ["退款到哪了", "退款什么时候到", "退款进度怎么样", "退款到账了吗"],
  invoice: ["可以开发票吗", "发票怎么开"],
  return_policy: ["有运费险吗", "运费险怎么赔"],
  size_recommend: ["尺码怎么选"],
};

/** 触发风险闸门的话。 */
const RISK_TEXTS: Record<RiskKey, string[]> = {
  health_safety: ["穿了以后皮肤起红疹，很痒", "衣服有刺鼻的味道，孩子穿了有点过敏", "穿上脖子一圈红了，是不是面料有问题"],
  fraud_security: ["我账号好像被盗了，有人在乱下单", "收到一个自称客服的人让我转账，是你们的人吗", "有人冒充你们要我的验证码"],
  legal_threat: ["再不处理我就去消协投诉你们", "我要找律师，这事没完"],
  emotion: ["等了这么久都没人管，太让人生气了"],
  abuse_extreme: ["你们这是什么垃圾服务"],
};

/** 进入人工队列的话（按意图）。 */
const HUMAN_TEXTS: Partial<Record<IntentId, string[]>> = {
  human_request: ["我不想跟机器人聊，帮我转人工", "你解决不了，换个真人客服吧", "这个问题我要和人工客服说"],
  quality_issue: ["衣服有质量问题，要人工来处理", "收到的衣服有破洞，我要找人工"],
  refund_apply: ["退款一直没处理，要人工跟进", "我要退款，你们别自动回复了，找人工"],
  other: ["你们老板在吗，我要反馈个事情"],
};

/** 复杂诉求（L3）里非"多步"意图的说法。 */
const L3_TEXTS: Partial<Record<IntentId, string[]>> = {
  exchange: ["我想把这件M换成L，顺便看看能不能用券", "上周买的裙子颜色不喜欢，换个别的颜色，差价怎么算"],
  refund_apply: ["先帮我查下那单到哪了，没到的话直接退款", "这单我想退一件留一件，能操作吗"],
  quality_issue: ["衣服缩水了，帮我看看订单能不能走售后，再推荐个大一码的"],
};

/** 低置信度样本：意思含糊、模型拿不准的话（共 10 条，一条一用）。 */
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
const LOW_CONFIDENCE_COUNT = VAGUE_TEXTS.length;

/** AI 回复（模板，按意图）。 */
const REPLIES: Record<IntentId, string[]> = {
  logistics_track: ["您的包裹已由中通快递揽收，预计明天送达，路上会有更新哦～"],
  human_request: ["好的，已为您转接人工客服，请稍等～"],
  greeting: ["您好，我是阿栖，有什么可以帮您的吗？"],
  order_status: ["我帮您查到了，订单已付款，正在安排发货～"],
  promotion: ["目前全场满 299 减 30，下单时会自动抵扣，您可以在购物车里看看～"],
  invoice: ["可以开具电子发票，订单完成后在「我的订单」里申请就行～"],
  shipping_policy: ["付款后 48 小时内发货，默认中通快递，满 99 元包邮～"],
  product_consult: ["这款面料柔软亲肤，建议冷水轻柔手洗，详情页里有完整的洗护说明哦～"],
  size_recommend: ["按您的身高体重，建议选 M 码；如果喜欢宽松一点可以选 L 码～"],
  stock_check: ["我帮您查了，这个规格目前有现货，可以放心下单～"],
  return_policy: ["支持 7 天无理由退货，吊牌完好、不影响二次销售即可～"],
  refund_progress: ["您的退款已进入处理中，预计 1–3 个工作日原路退回～"],
  urge_shipping: ["已帮您催促仓库优先处理，今天内会安排发出～"],
  modify_order: ["订单还没发货，可以修改，已帮您提交地址修改申请～"],
  cancel_order: ["订单尚未发货，可以取消，请确认是否取消～"],
  refund_apply: ["已为您发起退款申请，审核通过后会通知您寄回商品～"],
  exchange: ["可以换货，请确认要换的尺码，库存充足的话马上为您办理～"],
  quality_issue: ["很抱歉给您带来不好的体验，请上传一下问题照片，我们会尽快处理～"],
  other: ["收到～这个问题我先记下，有进一步消息会告诉您。"],
  multi_step_complex: ["我先帮您查了订单，再看了库存和优惠，建议这样处理：先申请换货，再用券下单，您确认一下～"],
};
const HANDOFF_REPLY = "已为您转接人工客服，阿栖正在赶来";

// ───────────────────────── 小工具 ─────────────────────────

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

const pad = (n: number) => String(n).padStart(2, "0");
const round = (n: number, d = 5) => Math.round(n * 10 ** d) / 10 ** d;

/** 毫秒时间戳 → "YYYY-MM-DDTHH:mm:ss+08:00"（东八区，去掉毫秒）。 */
function isoCst(ms: number): string {
  return new Date(ms + 8 * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, "+08:00");
}

/** DEMO_NOW 所在日期往前 daysAgo 天的日期（YYYY-MM-DD）。 */
function dateStr(daysAgo: number): string {
  const base = Date.parse(`${DEMO_NOW.slice(0, 10)}T00:00:00Z`);
  return new Date(base - daysAgo * 86400000).toISOString().slice(0, 10);
}

function pickWeighted(rng: () => number, weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

/** 买家 id：优先读种子里的买家，读不到就用 B001–B012。 */
function buyerIds(): string[] {
  try {
    const ids = readCollection<{ id: string }>("buyers").map((b) => b.id);
    if (ids.length > 0) return ids;
  } catch (err) {
    if (!(err instanceof StoreError)) throw err;
  }
  return Array.from({ length: 12 }, (_, i) => `B${pad(i + 1).padStart(3, "0")}`);
}

// ───────────────────────── 生成 ─────────────────────────

export interface SeedTraffic {
  conversations: Conversation[];
  messages: ChatMessage[];
  traces: RouteTrace[];
}

interface Slot {
  layer: FunnelLayer;
  intent: IntentId;
  lowConfidence: boolean;
}

/** 生成全部种子流量（纯函数：不碰磁盘，固定随机种子，结果可复现）。 */
export function buildSeedTraffic(buyers: string[] = buyerIds()): SeedTraffic {
  const rng = mulberry32(SEED);
  const between = (lo: number, hi: number) => lo + rng() * (hi - lo);
  const int = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
  const pick = <T>(items: T[]): T => items[Math.floor(rng() * items.length)];

  // 1) 会话骨架：每天拆成若干个 3–7 条消息的会话；会话内消息间隔 20–150 秒（今天的会话在 09:40 前开始，保证都早于 10:00）
  const skeleton: { conv: number; ms: number }[] = [];
  const convStarts: number[] = [];
  PER_DAY.forEach((count, idx) => {
    const daysAgo = PER_DAY.length - 1 - idx;
    const dayStart = Date.parse(`${dateStr(daysAgo)}T00:00:00+08:00`);
    const maxHour = daysAgo === 0 ? 9 : 23;
    const weights = HOUR_WEIGHT.slice(0, maxHour + 1);
    const sizes: number[] = [];
    for (let rest = count; rest > 0; ) {
      let size = Math.min(rest, int(3, 7));
      if (rest - size > 0 && rest - size < 3) size = rest; // 剩 1–2 条就并进这一个会话
      sizes.push(size);
      rest -= size;
    }
    for (const size of sizes) {
      const hour = pickWeighted(rng, weights);
      const minute = daysAgo === 0 && hour === 9 ? int(0, 39) : int(0, 59);
      let ms = dayStart + (hour * 3600 + minute * 60 + int(0, 59)) * 1000;
      const conv = convStarts.length;
      convStarts.push(ms);
      for (let i = 0; i < size; i++) {
        skeleton.push({ conv, ms });
        ms += int(20, 150) * 1000;
      }
    }
  });
  // 会话编号按开始时间排（S1001 最早）
  const order = convStarts.map((ms, i) => ({ ms, i })).sort((a, b) => a.ms - b.ms || a.i - b.i);
  const convNo = new Map(order.map((o, rank) => [o.i, 1001 + rank]));
  skeleton.sort((a, b) => a.ms - b.ms || a.conv - b.conv);

  // 2) 精确计数的 (layer, intent) 槽位。每层先打乱，再均匀撒在整条时间轴上，
  //    这样"今天"和"每一天"的层级占比都接近总体占比，而不是随机抖动。
  const keyed: { key: number; layer: FunnelLayer; intent: IntentId }[] = [];
  for (const [layer, plan] of Object.entries(PLAN) as [FunnelLayer, [IntentId, number][]][]) {
    const intents: IntentId[] = [];
    for (const [intent, n] of plan) for (let i = 0; i < n; i++) intents.push(intent);
    for (let i = intents.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [intents[i], intents[j]] = [intents[j], intents[i]];
    }
    intents.forEach((intent, i) => keyed.push({ key: (i + rng()) / intents.length, layer, intent }));
  }
  keyed.sort((a, b) => a.key - b.key);
  const slots: Slot[] = keyed.map((k) => ({ layer: k.layer, intent: k.intent, lowConfidence: false }));

  // 3) 在 L2 / L3 的槽位里均匀挑出 10 条做"低置信度样本"
  const eligible = slots.filter((s) => s.layer === "L2" || s.layer === "L3");
  for (let j = 0; j < LOW_CONFIDENCE_COUNT; j++) {
    eligible[Math.floor(((j + 0.5) * eligible.length) / LOW_CONFIDENCE_COUNT)].lowConfidence = true;
  }

  // 4) 逐条生成消息 + 回复 + trace
  const perConv = new Map<number, number>();
  const convMessages = new Map<number, ChatMessage[]>();
  const convTraces = new Map<number, RouteTrace[]>();
  let vagueIdx = 0;
  let escalated = 0;

  skeleton.forEach((entry, i) => {
    const slot = slots[i];
    const { layer, intent } = slot;
    const no = convNo.get(entry.conv)!;
    const convId = `S${no}`;
    const k = (perConv.get(entry.conv) ?? 0) + 1;
    perConv.set(entry.conv, k);
    const at = isoCst(entry.ms);

    let confidence: number;
    let latency: RouteTrace["latency"];
    let decideUsd = JEV_DECIDE_USD;
    let agentUsd = 0;
    let escalatedFrom: Layer | undefined;

    if (layer === "L1") {
      confidence = 1;
      latency = { totalMs: int(20, 50) };
      // 规则匹配本身免费，但仍支付与真实 trace 相同的风险检查费（约 ¥0.4 / 千条）
      decideUsd = JEV_DECIDE_USD;
    } else if (layer === "L2") {
      confidence = slot.lowConfidence ? round(between(0.5, 0.69), 2) : round(between(0.72, 0.98), 2);
      const decideMs = int(170, 215); // Jev 热状态，p50 约 384ms 的前半段
      latency = { totalMs: decideMs + int(130, 385), decideMs };
      latency.handlerMs = latency.totalMs - decideMs;
    } else if (layer === "L3") {
      confidence = slot.lowConfidence
        ? round(between(0.42, 0.69), 2)
        : intent === "multi_step_complex"
          ? round(between(0.72, 0.9), 2)
          : round(between(0.72, 0.85), 2);
      // T05b：热态 decide 约 360–400ms；整轮取实测中间带 3–9s（样本约 2.1–9.8s）
      const decideMs = int(360, 400);
      const agentMs = int(2640, 8600);
      latency = { totalMs: decideMs + agentMs, decideMs, agentMs };
      // T05 平均 agentUsd $0.000112；区间 $0.00008–$0.0002，见文件头
      agentUsd = round(between(0.00008, 0.0002), 6);
    } else if (layer === "risk_gate") {
      confidence = round(between(0.5, 0.94), 2);
      const decideMs = int(175, 230);
      latency = { totalMs: decideMs + int(2, 12), decideMs };
    } else {
      confidence = round(between(0.5, 0.95), 2);
      const decideMs = int(175, 215);
      if (intent !== "human_request" && escalated < 4) {
        // 少数是 L3 跑失败后转人工：记为 human，escalatedFrom = "L3"
        escalated += 1;
        escalatedFrom = "L3";
        // 转人工的 L3 与成功的 L3 同一档：agent 成本 $0.00008–$0.0002，整轮约 3–9s
        const agentMs = int(2800, 8800);
        latency = { totalMs: decideMs + agentMs, decideMs, agentMs };
        agentUsd = round(between(0.00008, 0.0002), 6);
      } else {
        latency = { totalMs: decideMs + int(80, 300), decideMs };
        latency.handlerMs = latency.totalMs - decideMs;
      }
    }

    // 买家原话
    let text: string;
    let riskKey: RiskKey | undefined;
    if (slot.lowConfidence) text = VAGUE_TEXTS[vagueIdx++ % VAGUE_TEXTS.length];
    else if (layer === "risk_gate") {
      riskKey = RISK_OF_INTENT[intent] ?? "emotion";
      text = pick(RISK_TEXTS[riskKey]);
    } else if (layer === "human") text = pick(HUMAN_TEXTS[intent] ?? TEXTS[intent]);
    else if (layer === "L1") text = pick(L1_TEXTS[intent] ?? TEXTS[intent]);
    else if (layer === "L3") text = pick(L3_TEXTS[intent] ?? TEXTS[intent]);
    else text = pick(TEXTS[intent]);

    const handoff = layer === "risk_gate" || layer === "human";
    const altIntents = (Object.keys(STAGE_OF_INTENT) as IntentId[]).filter((id) => id !== intent);
    const trace: RouteTrace = {
      id: `${convId}-T${k}`,
      conversationId: convId,
      messageId: `${convId}-M${2 * k - 1}`,
      at,
      layer,
      intent,
      stage: STAGE_OF_INTENT[intent],
      confidence,
      ...(layer === "L1"
        ? { ruleId: L1_RULE[intent] }
        : {
            decideProvider: "jev" as const,
            topIntents: [
              { id: intent, p: confidence },
              { id: pick(altIntents), p: round((1 - confidence) * 0.6, 2) },
            ],
          }),
      ...(riskKey
        ? { riskHit: [riskKey], riskScores: { [riskKey]: round(between(0.82, 0.97), 2) } as Partial<Record<RiskKey, number>> }
        : {}),
      ...(escalatedFrom ? { escalatedFrom } : {}),
      ...(handoff
        ? { handoffReason: riskKey ? `风险闸门：${riskKey}` : escalatedFrom ? "复杂诉求处理失败，转人工" : "买家要求或需要人工处理" }
        : {}),
      toolCalls:
        layer === "L3" || escalatedFrom
          ? [
              { name: "get_order", ok: true, ms: int(40, 90) },
              { name: "check_refund_eligibility", ok: !escalatedFrom, ms: int(50, 120) },
            ]
          : layer === "L2" && ["order_status", "logistics_track", "refund_progress", "urge_shipping", "modify_order", "cancel_order"].includes(intent)
            ? [{ name: "get_order", ok: true, ms: int(30, 80) }]
            : [],
      usedGeneration: false,
      latency,
      cost: {
        decideUsd,
        generationUsd: 0,
        agentUsd,
        totalUsd: round(decideUsd + agentUsd, 7),
        estimated: true,
      },
      isSimulated: true,
    };

    const buyerMsg: ChatMessage = {
      id: trace.messageId,
      conversationId: convId,
      role: "buyer",
      text,
      createdAt: at,
    };
    const replyAt = isoCst(entry.ms + Math.max(1, Math.ceil(latency.totalMs / 1000)) * 1000);
    const replyMsg: ChatMessage = {
      id: `${convId}-M${2 * k}`,
      conversationId: convId,
      role: handoff ? "system" : "ai",
      text: handoff ? HANDOFF_REPLY : pick(REPLIES[intent]),
      traceId: trace.id,
      createdAt: replyAt,
    };
    (convMessages.get(entry.conv) ?? convMessages.set(entry.conv, []).get(entry.conv)!).push(buyerMsg, replyMsg);
    (convTraces.get(entry.conv) ?? convTraces.set(entry.conv, []).get(entry.conv)!).push(trace);
  });

  // 5) 汇总成会话
  const conversations: Conversation[] = [];
  const messages: ChatMessage[] = [];
  const traces: RouteTrace[] = [];
  for (const { i: convIdx } of order) {
    const ms = convMessages.get(convIdx)!;
    const ts = convTraces.get(convIdx)!;
    const first = ts[0];
    const last = ts[ts.length - 1];
    const handoffTrace = ts.find((t) => t.layer === "risk_gate" || t.layer === "human");
    const riskFlags = [...new Set(ts.flatMap((t) => t.riskHit ?? []))];
    const lastBuyer = [...ms].reverse().find((m) => m.role === "buyer")!;
    conversations.push({
      id: first.conversationId,
      buyerId: buyers[convNo.get(convIdx)! % buyers.length],
      mode: "ai",
      status: "closed",
      ...(handoffTrace ? { handoffReason: handoffTrace.handoffReason, handoffAt: handoffTrace.at } : {}),
      lastLayer: last.layer,
      riskFlags,
      tags: ["模拟历史数据"],
      state: {
        currentTask: null,
        slots: {},
        history: [],
        lastIntent: last.intent,
        turnCount: ts.length,
        unresolvedTurns: 0,
        riskFlags,
      },
      createdAt: first.at,
      updatedAt: ms[ms.length - 1].createdAt,
      lastMessagePreview: lastBuyer.text,
      unreadForSeller: 0,
      isSimulated: true,
    });
    messages.push(...ms);
    traces.push(...ts);
  }
  return { conversations, messages, traces };
}

/** 生成种子流量并写入数据层（会替换旧的模拟数据，保留演示中产生的真实会话）。 */
export function generateSeedTraffic(): SeedTraffic {
  const data = buildSeedTraffic();
  replaceSimulatedHistory(data);
  return data;
}

registerResetHook("traffic", () => {
  generateSeedTraffic();
});
