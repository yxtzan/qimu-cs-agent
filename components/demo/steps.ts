export const STEP_ORDER = [
  "intro",
  "s1-send",
  "s1-reply",
  "s2-send",
  "s2-reply",
  "s3-send",
  "s3-wait",
  "s3-confirm",
  "s3-done",
  "s4-send",
  "s4-reply",
  "s5-go",
  "s5-list",
  "s5-detail",
  "s5-takeover",
  "s5-reply",
  "s5-back",
  "s6-go",
  "s6-board",
  "s6-eval",
  "end",
] as const;

export type StepId = (typeof STEP_ORDER)[number];

export function isStepId(value: unknown): value is StepId {
  return typeof value === "string" && (STEP_ORDER as readonly string[]).includes(value);
}

export interface ShopSetup {
  buyerId: string;
  /** 买家端要打开的页面。导航由导览层做，这里只告诉聊天窗上下文。 */
  target?: { productId?: string; orderId?: string };
  draft?: string;
  /** true：新开一段对话并填好话术。false：沿用当前会话（刷新时用来恢复）。 */
  fresh: boolean;
}

export type PrimaryKind = "start" | "seller" | "buyer" | "board" | "retry" | "exit";

export interface StepDef {
  id: StepId;
  /** 卡片上的进度，如 3/6。开场和结束单独写。 */
  progress: string;
  kicker: string;
  sentence: string;
  /** 目标还没出现时替换一句话。 */
  waitCopy: string;
  /** 展开详情里、真数据之外的补充说明。 */
  detail?: string;
  showFunnel?: boolean;
  /** 有 trace 时在展开详情里展示。 */
  showTrace?: boolean;
  /** 即使目标已经出现，也显示已等秒数（第 3 步等待）。 */
  showTimer?: boolean;
  /** data-tour 名。union：圈出所有已出现的；first：用第一个已经出现的。 */
  targets?: string[];
  pick?: "union" | "first";
  /** 屏幕中央卡片，不圈页面元素。 */
  center?: boolean;
  /** 进入这一步时要保证在的路径。null 表示先停在当前页，等观众点卡片按钮。 */
  path?: string | null;
  shop?: ShopSetup;
  primary?: { kind: PrimaryKind; label: string; testId: string };
}

const WAIT = "这一步的内容还在路上，已等一会儿就会圈出来。也可以点「下一步」继续。";

export const STEPS: Record<StepId, StepDef> = {
  intro: {
    id: "intro",
    progress: "开场",
    kicker: "先看一眼",
    sentence:
      "这是一个女装店的 AI 客服。它像一个漏斗：固定问题用规则秒回，大部分问题由便宜的判断模型 Jev 分流，只有复杂的多步问题才交给大模型；所有消息都会先过一道风险闸门。",
    waitCopy: WAIT,
    detail: "下面是漏斗的顺序。点「开始演示」会先把演示数据重置，再从第 1 步走。",
    showFunnel: true,
    center: true,
    path: null,
    primary: { kind: "start", label: "开始演示", testId: "demo-start" },
  },
  "s1-send": {
    id: "s1-send",
    progress: "1/6",
    kicker: "点这里",
    sentence: "一句话问了尺码和洗护两件事，点「发送」。",
    waitCopy: "正在打开商品页并填好话术。",
    targets: ["chat-send"],
    path: "/product/P002",
    shop: {
      buyerId: "B001",
      target: { productId: "P002" },
      draft: "我 160cm 50kg 穿什么码？这件能机洗吗",
      fresh: true,
    },
  },
  "s1-reply": {
    id: "s1-reply",
    progress: "1/6",
    kicker: "看这里",
    sentence: "尺码是按尺码表**算**出来的，不是模型猜的；洗护是从店铺知识库查到的，点「参考了 N 条资料」能看依据。",
    waitCopy: "正在等客服回复尺码和洗护。",
    detail: "模型只许按资料回答，查不到就说不确定、建议转人工。",
    showTrace: true,
    targets: ["size-card", "sources"],
    path: "/product/P002",
    shop: { buyerId: "B001", target: { productId: "P002" }, fresh: false },
  },
  "s2-send": {
    id: "s2-send",
    progress: "2/6",
    kicker: "点这里",
    sentence: "只说「到哪了」三个字：订单已经从页面带上，不用追问。",
    waitCopy: "正在打开订单页并填好话术。",
    targets: ["chat-send"],
    path: "/orders/QM2026100201",
    shop: {
      buyerId: "B001",
      target: { orderId: "QM2026100201" },
      draft: "到哪了",
      fresh: true,
    },
  },
  "s2-reply": {
    id: "s2-reply",
    progress: "2/6",
    kicker: "看这里",
    sentence: "这类说法固定的高频问题走第一层规则，毫秒级、几乎不花钱。",
    waitCopy: "正在等物流卡片。",
    detail: "规则只对短句生效，长句交给下一层，宁可漏给下一层也不误判。",
    showTrace: true,
    targets: ["logistics-card"],
    path: "/orders/QM2026100201",
    shop: { buyerId: "B001", target: { orderId: "QM2026100201" }, fresh: false },
  },
  "s3-send": {
    id: "s3-send",
    progress: "3/6",
    kicker: "点这里",
    sentence: "一句话两个诉求：换 L 码 + 找优惠券。这种多步问题交给大模型。",
    waitCopy: "正在打开上周那笔订单并填好话术。",
    targets: ["chat-send"],
    path: "/orders/QM2026092801",
    shop: {
      buyerId: "B001",
      target: { orderId: "QM2026092801" },
      draft: "上周买的那件外套换成 L，顺便看看有没有券",
      fresh: true,
    },
  },
  "s3-wait": {
    id: "s3-wait",
    progress: "3/6",
    kicker: "请稍等",
    sentence: "大模型正在一步步查：订单 → L 码库存 → 换货申请 → 优惠券，通常要 5–20 秒。",
    waitCopy: "正在等大模型开始查订单。",
    showTimer: true,
    showTrace: true,
    targets: ["chat-thread"],
    path: "/orders/QM2026092801",
    shop: { buyerId: "B001", target: { orderId: "QM2026092801" }, fresh: false },
  },
  "s3-confirm": {
    id: "s3-confirm",
    progress: "3/6",
    kicker: "点这里",
    sentence: "大模型**不能直接改订单**，只能生成一张确认卡。点「确认」才真正办理。",
    waitCopy: "确认卡还在生成，大模型通常要 5–20 秒。",
    detail: "退款、换货、改地址、取消订单都必须买家确认。",
    showTrace: true,
    targets: ["confirm-yes"],
    path: "/orders/QM2026092801",
    shop: { buyerId: "B001", target: { orderId: "QM2026092801" }, fresh: false },
  },
  "s3-done": {
    id: "s3-done",
    progress: "3/6",
    kicker: "看这里",
    sentence: "售后单已生成，左边订单页同步更新；过期的优惠券不会出现在这里。",
    waitCopy: "正在等售后单出现。",
    showTrace: true,
    targets: ["s3-done"],
    path: "/orders/QM2026092801",
    shop: { buyerId: "B001", target: { orderId: "QM2026092801" }, fresh: false },
  },
  "s4-send": {
    id: "s4-send",
    progress: "4/6",
    kicker: "点这里",
    sentence: "这句话里有健康问题，还有投诉威胁。",
    waitCopy: "正在切换买家并填好话术。",
    targets: ["chat-send"],
    path: "/orders/QM2026092902",
    shop: {
      buyerId: "B002",
      target: { orderId: "QM2026092902" },
      draft: "衣服穿了全身起红疹，你们不处理我就去 12315 投诉",
      fresh: true,
    },
  },
  "s4-reply": {
    id: "s4-reply",
    progress: "4/6",
    kicker: "看这里",
    sentence: "风险闸门拦下了：AI 不抢答、不解释政策，直接转人工。",
    waitCopy: "正在等风险闸门把这条转到人工。",
    detail:
      "闸门有两道网：关键词一定能抓住「12315」这种明确说法；Jev 能抓住换了说法的，比如「脖子痒得睡不着」。只提到别人是律师不会误判。",
    showTrace: true,
    targets: ["waiting-human"],
    path: "/orders/QM2026092902",
    shop: { buyerId: "B002", target: { orderId: "QM2026092902" }, fresh: false },
  },
  "s5-go": {
    id: "s5-go",
    progress: "5/6",
    kicker: "点这里",
    sentence: "这是商家后台，手机优先，可以加到手机主屏幕当 App 用。",
    waitCopy: WAIT,
    center: true,
    path: null,
    primary: { kind: "seller", label: "去商家后台", testId: "demo-go-seller" },
  },
  "s5-list": {
    id: "s5-list",
    progress: "5/6",
    kicker: "点这里",
    sentence: "转人工的会话排在最前面，点开它。",
    waitCopy: "正在等刚才那条转人工会话出现在列表里。",
    targets: ["handoff-row"],
    path: "/seller",
  },
  "s5-detail": {
    id: "s5-detail",
    progress: "5/6",
    kicker: "看这里",
    sentence: "AI 已经写好一句话摘要，客服不用翻聊天记录。",
    waitCopy: "正在等转人工原因和摘要加载出来。",
    targets: ["handoff-reason", "ai-context"],
    pick: "first",
    path: null,
  },
  "s5-takeover": {
    id: "s5-takeover",
    progress: "5/6",
    kicker: "点这里",
    sentence: "点「接管」。接管之后，回复会自动填进输入框。",
    waitCopy: "正在等「接管」按钮。",
    targets: ["takeover"],
    path: null,
  },
  "s5-reply": {
    id: "s5-reply",
    progress: "5/6",
    kicker: "点这里",
    sentence: "接管并回复买家。这句话已经填好，点「发送」。",
    waitCopy: "正在把回复填进输入框。",
    targets: ["seller-reply", "seller-send"],
    path: null,
  },
  "s5-back": {
    id: "s5-back",
    progress: "5/6",
    kicker: "点这里",
    sentence: "买家这边几秒内就收到了人工客服的回复。",
    waitCopy: "正在回到买家端。",
    center: true,
    path: null,
    shop: { buyerId: "B002", target: { orderId: "QM2026092902" }, fresh: false },
    primary: { kind: "buyer", label: "回到买家端", testId: "demo-go-buyer" },
  },
  "s6-go": {
    id: "s6-go",
    progress: "6/6",
    kicker: "点这里",
    sentence: "最后看成本：大部分消息应该挡在前面两层，又快又省。",
    waitCopy: WAIT,
    center: true,
    path: null,
    primary: { kind: "board", label: "看看成本", testId: "demo-go-board" },
  },
  "s6-board": {
    id: "s6-board",
    progress: "6/6",
    kicker: "看这里",
    sentence: "大部分消息在前两层就解决了；大模型层更慢也更贵，所以要尽量把消息挡在前面，又快又省。",
    waitCopy: "正在打开看板并切到「近 7 天」。",
    detail: "历史消息是模拟流量（看板底部有注明），今天新发的是真实消息。",
    targets: ["board-hero"],
    path: "/seller/dashboard",
  },
  "s6-eval": {
    id: "s6-eval",
    progress: "6/6",
    kicker: "看这里",
    sentence: "这是 60 条测试对话的真实跑分。另外还有 15 条系统从没见过的题，通过了 13 条。",
    waitCopy: "正在等评测成绩卡。",
    detail: "主评测有一部分是对着失败用例调过的，所以另留了一组没见过的题检验泛化能力（docs/reports/holdout-eval.md）。",
    targets: ["eval-card"],
    path: "/seller/dashboard",
  },
  end: {
    id: "end",
    progress: "结束",
    kicker: "演示结束",
    sentence: "演示结束。可以再演示一次（重置后从开场开始），或自由体验（退出演示，随便问）。",
    waitCopy: WAIT,
    center: true,
    path: null,
    primary: { kind: "exit", label: "自由体验", testId: "demo-free" },
  },
};

export function stepIndex(id: StepId): number {
  return STEP_ORDER.indexOf(id);
}

export function neighbor(id: StepId, dir: -1 | 1): StepId | null {
  const i = stepIndex(id) + dir;
  if (i < 0 || i >= STEP_ORDER.length) return null;
  return STEP_ORDER[i];
}

/** 卖家会话页：详情 / 接管 / 回复 都停在第 4 步产生的那条会话上。 */
export function sellerConversationPath(stepId: StepId, conversationId?: string): string | null {
  if (stepId !== "s5-detail" && stepId !== "s5-takeover" && stepId !== "s5-reply") return null;
  return conversationId ? `/seller/c/${conversationId}` : null;
}

export const SELLER_REPLY_DRAFT = "您好，我是阿栖，非常抱歉，马上为您处理";

export const TRY_SCRIPTS: { id: string; title: string; note: string; draft: string }[] = [
  {
    id: "emotion",
    title: "连续两句抱怨会转人工",
    note: "先发这句，再发一句更不满的，第二句会转人工。",
    draft: "什么破快递，三天了还没动",
  },
  {
    id: "lawyer",
    title: "「我老公是律师」不会被误判",
    note: "提到别人是律师，不等于买家在投诉。",
    draft: "我老公是做律师的，他说你家大衣版型挺正",
  },
  {
    id: "rule",
    title: "关掉 R007 再发这句",
    note: "规则页关掉 R007 后，这句话会被当成退货，而不是问尺码。",
    draft: "尺码不合适想退货",
  },
];
