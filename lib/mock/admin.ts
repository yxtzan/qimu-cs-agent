/**
 * 卖家端「知识库」与「规则」的 mock（CONTRACTS §4 §5）。形状严格符合 lib/types.ts。
 * 数据放在模块级变量里：同一次页面会话内，导入文档 / 开关规则会保留；刷新页面后重置。
 * 买家端聊天 mock（lib/mock/chat.ts）会读取规则开关，所以在同一个标签页里关闭 R007 能看到买家端路由变化。
 * 内容与 docs/DATA_SPEC.md §5 §6 §7 保持一致（7 天无理由、15 天质量问题、¥500 转人工等）。
 */
import { DEMO_NOW, nowIso } from "@/lib/demo-clock";
import type { IntentId, KbChunk, KbDoc, KbSearchHit, Rule } from "@/lib/types";
import { MockApiError } from "./index";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const delay = (ms = 120) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ───────────────────────── 知识库 ─────────────────────────

/** 简化版分块（ARCHITECTURE §5）：按 Markdown 标题切，再按 ~300 字切，重叠 50 字。 */
export function chunkMarkdown(docId: string, docTitle: string, content: string): KbChunk[] {
  const sections: { heading?: string; text: string }[] = [];
  let heading: string | undefined;
  let buf: string[] = [];
  const flush = () => {
    const text = buf.join("\n").trim();
    if (text) sections.push({ heading, text });
    buf = [];
  };
  for (const line of content.replace(/\r\n/g, "\n").split("\n")) {
    const m = /^#{1,3}\s+(.+?)\s*$/.exec(line);
    if (m) {
      flush();
      heading = m[1];
    } else {
      buf.push(line);
    }
  }
  flush();

  const chunks: KbChunk[] = [];
  for (const s of sections) {
    const parts: string[] = [];
    if (s.text.length <= 340) parts.push(s.text);
    else {
      for (let i = 0; i < s.text.length; i += 250) {
        parts.push(s.text.slice(i, i + 300));
        if (i + 300 >= s.text.length) break;
      }
    }
    for (const text of parts) {
      chunks.push({ id: `${docId}-K${chunks.length + 1}`, docId, docTitle, heading: s.heading, text });
    }
  }
  return chunks;
}

const SEED_DOCS: { id: string; title: string; day: string; content: string }[] = [
  {
    id: "KB001",
    title: "退换货政策",
    day: "09-20",
    content: `## 7 天无理由
签收后 7 天内（含第 7 天），吊牌完好、未洗涤、未穿着，可申请无理由退货或换货。
## 退货运费
非质量问题的退货运费由买家承担；金卡会员免退货运费；质量问题的运费由商家承担。
## 换货规则
同款换码或换色，每单每件限换 1 次，目标尺码必须有库存。商家收到退回件后 24 小时内发出换货新件。`,
  },
  {
    id: "KB002",
    title: "尺码指南",
    day: "09-20",
    content: `## 尺码对照表
S 码：身高 155–160cm，体重 45–50kg。M 码：身高 158–165cm，体重 48–56kg。L 码：身高 162–170cm，体重 54–62kg。身高体重分属两个码时取较大的一个。
## 版型说明
宽松款可以选小一码；修身款如果体重在区间上沿，建议大一码。羊毛大衣建议里面留出针织衫的空间。
## 量体方法
胸围沿最丰满处水平测量，腰围测量肚脐上方最细处，臀围测量最丰满处。`,
  },
  {
    id: "KB003",
    title: "洗护指南",
    day: "09-20",
    content: `## 羊毛与羊绒
羊毛混纺大衣建议干洗；如需手洗，请用冷水加中性洗涤剂轻柔按压，不要拧干，平铺阴干。
## 真丝
真丝面料请冷水（30°C 以下）手洗，使用中性洗涤剂，切勿拧干或暴晒，阴凉处挂干，熨烫温度不超过 110°C。
## 棉与聚酯纤维
棉质和聚酯纤维可以机洗，水温 30°C 以下，建议装入洗衣袋，避免与深色衣物同洗。`,
  },
  {
    id: "KB004",
    title: "发货与物流",
    day: "09-21",
    content: `## 发货时间
订单付款后 48 小时内发货，预售款以商品页标注的发货日期为准。
## 默认快递
默认使用顺丰速运，江浙沪一般 1–2 天送达，其他地区 2–4 天。偏远地区可能延长。
## 物流异常
如果物流 48 小时没有更新，请联系客服，我们会协助向快递公司核实。`,
  },
  {
    id: "KB005",
    title: "优惠与会员",
    day: "09-21",
    content: `## 会员权益
银卡会员享 95 折，金卡会员享 9 折，并免退货运费。
## 优惠券规则
优惠券不可叠加使用；满减券需订单金额满足门槛，仅限指定品类的券只对该品类商品生效，过期券不可使用。`,
  },
  {
    id: "KB006",
    title: "发票说明",
    day: "09-21",
    content: `## 开票流程
我们提供电子普通发票：确认收货后在订单详情页申请，1 个工作日内开具，发送到您预留的邮箱。
## 注意事项
发票抬头需与订单支付信息一致；已申请退款的订单无法开具发票。`,
  },
  {
    id: "KB007",
    title: "质量问题处理",
    day: "09-22",
    content: `## 申请条件
签收后 15 天内发现质量问题，可以申请处理，请提供清晰的照片。
## 人工审核
金额超过 ¥500 的质量问题需要人工审核，审核通过后可选择退货退款或换货，运费由商家承担。
## 健康安全
如穿着后出现过敏、红疹等不适，请先停止穿着并及时就医，客服会优先为您处理。`,
  },
  {
    id: "KB008",
    title: "退款时效说明",
    day: "09-22",
    content: `## 到账时间
商家确认收到退货后 24 小时内发起退款，原路退回，一般 1–3 个工作日到账。
## 仅退款
未发货订单申请即退；已发货订单需要先拒收或退回后再处理。`,
  },
  {
    id: "KB009",
    title: "店铺介绍与客服时间",
    day: "09-22",
    content: `## 关于栖木
栖木 QIMU 是一家主打通勤与日常穿搭的女装店，以天然面料和舒适版型为主。
## 客服时间
智能客服 24 小时在线；人工客服服务时间为每天 9:00–22:00。`,
  },
  {
    id: "KB010",
    title: "常见问题 FAQ",
    day: "09-23",
    content: `## 订单相关
问：下单后能改地址吗？答：仅待发货订单可以修改地址。问：怎么取消订单？答：待付款和待发货订单可以取消，已付款订单取消后自动全额退款。
## 售后相关
问：退款多久到账？答：商家收到退货后 24 小时内发起退款，1–3 个工作日到账。问：洗过的衣服能退吗？答：洗涤后不支持无理由退货。`,
  },
];

const at = (md: string) => `2026-${md}T10:00:00+08:00`;

interface KbStore {
  docs: KbDoc[];
  chunks: KbChunk[];
}

function seedKb(): KbStore {
  const docs: KbDoc[] = [];
  const chunks: KbChunk[] = [];
  for (const d of SEED_DOCS) {
    const cs = chunkMarkdown(d.id, d.title, d.content);
    chunks.push(...cs);
    docs.push({
      id: d.id,
      title: d.title,
      source: "seed",
      chunkCount: cs.length,
      charCount: d.content.length,
      createdAt: at(d.day),
      indexMode: "bigram",
    });
  }
  return { docs, chunks };
}

let kb: KbStore = seedKb();

function bigrams(s: string): Set<string> {
  const t = s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}

function scoreOf(query: Set<string>, text: string): number {
  if (query.size === 0) return 0;
  const target = bigrams(text);
  let hit = 0;
  for (const g of query) if (target.has(g)) hit++;
  return hit / query.size;
}

export async function mockListKbDocs(): Promise<KbDoc[]> {
  await delay();
  return clone([...kb.docs].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
}

export type MockKbImportInput = { title?: string; content: string; source: "upload" | "paste"; fallbackTitle?: string };

export async function mockImportKbDoc(input: MockKbImportInput): Promise<KbDoc> {
  await delay(1400); // 模拟「解析 → 分块 → 建立索引」
  const content = input.content.trim();
  if (!content) throw new MockApiError("BAD_REQUEST", "文档内容不能为空", 400);
  if (content.length > 1_000_000) throw new MockApiError("BAD_REQUEST", "文件太大了，请控制在 1MB 以内", 400);
  const heading = /^#\s+(.+)$/m.exec(content)?.[1];
  const title = input.title?.trim() || heading || input.fallbackTitle?.trim() || "未命名文档";
  const id = `KB${String(kb.docs.length + 1).padStart(3, "0")}`;
  const chunks = chunkMarkdown(id, title, content);
  const doc: KbDoc = {
    id,
    title,
    source: input.source,
    chunkCount: chunks.length,
    charCount: content.length,
    createdAt: nowIso(),
    indexMode: "bigram",
  };
  kb.docs.push(doc);
  kb.chunks.push(...chunks);
  return clone(doc);
}

export async function mockDeleteKbDoc(id: string): Promise<{ ok: true }> {
  await delay(80);
  if (!kb.docs.some((d) => d.id === id)) throw new MockApiError("NOT_FOUND", "没有找到这篇文档", 404);
  kb.docs = kb.docs.filter((d) => d.id !== id);
  kb.chunks = kb.chunks.filter((c) => c.docId !== id);
  return { ok: true };
}

export async function mockGetKbChunks(id: string): Promise<KbChunk[]> {
  await delay(80);
  if (!kb.docs.some((d) => d.id === id)) throw new MockApiError("NOT_FOUND", "没有找到这篇文档", 404);
  return clone(kb.chunks.filter((c) => c.docId === id));
}

export async function mockSearchKb(query: string, topK = 4): Promise<KbSearchHit[]> {
  await delay(150);
  const q = bigrams(query);
  const hits = kb.chunks
    .map((chunk) => ({ chunk, score: Math.round(scoreOf(q, `${chunk.heading ?? ""}${chunk.text}`) * 100) / 100 }))
    .filter((h) => h.score >= 0.35) // RAG_MIN_SCORE
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  return clone(hits);
}

// ───────────────────────── 规则 ─────────────────────────

export type RuleSeed = Omit<Rule, "suggestion">;

/** 含 +08:00 的 ISO：直接用 DEMO_NOW 的毫秒数减去小时数，再格式化为北京时间。 */
function bjIso(ms: number): string {
  return new Date(ms + 8 * 3600_000).toISOString().replace("Z", "+08:00");
}

function seedRules(): RuleSeed[] {
  const base = (
    id: string,
    name: string,
    pattern: string,
    intent: IntentId,
    maxLen: number,
    hitCount: number,
    misfireCount: number,
    lastHitHoursAgo: number | null,
  ): RuleSeed => ({
    id,
    name,
    pattern,
    intent,
    maxLen,
    enabled: true,
    hitCount,
    misfireCount,
    lastHitAt: lastHitHoursAgo === null ? undefined : bjIso(demoMs - lastHitHoursAgo * 3600_000),
    createdAt: at("09-18"),
  });
  return [
    base("R001", "转人工", "人工|真人|转客服", "human_request", 12, 41, 0, 0.4),
    base("R002", "查物流", "^(到哪了|物流|查物流|快递到哪了?|发货了吗)[?？!！。]*$", "logistics_track", 10, 63, 2, 1.2),
    base("R003", "退款进度", "退款(进度|到哪|到账|什么时候到)", "refund_progress", 12, 37, 1, 3.5),
    base("R004", "打招呼", "^(你好|您好|在吗|在不在|hi|hello)[?？!！~。]*$", "greeting", 8, 88, 0, 0.2),
    base("R005", "发票", "发票", "invoice", 10, 12, 1, 27),
    base("R006", "运费险", "运费险", "return_policy", 12, 9, 0, 52),
    base("R007", "尺码（宽泛）", "尺码", "size_recommend", 20, 23, 9, 5),
    base("R008", "优惠码", "优惠码", "promotion", 10, 0, 0, null),
  ];
}

const demoMs = Date.parse(DEMO_NOW);

/** ARCHITECTURE §4.4：hitCount ≥ 5 且 misfire/hit ≥ 30% → delete；7 天内无命中 → delete；misfire/hit ≥ 15% → review。 */
function suggest(r: RuleSeed): Rule["suggestion"] {
  if (r.hitCount >= 5 && r.misfireCount / r.hitCount >= 0.3) return "delete";
  // 新建不满 7 天的规则还没机会命中，不能因此被建议删除
  if (r.hitCount === 0 && demoMs - Date.parse(r.createdAt) >= 7 * 24 * 3600_000) return "delete";
  if (r.hitCount >= 5 && r.misfireCount / r.hitCount >= 0.15) return "review";
  return "keep";
}

let rules: RuleSeed[] = seedRules();

function withSuggestion(r: RuleSeed): Rule {
  return { ...r, suggestion: suggest(r) };
}

function validatePattern(pattern: string) {
  if (!pattern.trim()) throw new MockApiError("BAD_REQUEST", "正则不能为空", 400);
  try {
    new RegExp(pattern);
  } catch {
    throw new MockApiError("BAD_REQUEST", "正则表达式不合法，请检查括号和转义", 400);
  }
}

export async function mockListRules(): Promise<Rule[]> {
  await delay();
  return clone(rules.map(withSuggestion));
}

export async function mockCreateRule(
  input: Omit<Rule, "id" | "hitCount" | "misfireCount" | "lastHitAt" | "createdAt" | "suggestion">,
): Promise<Rule> {
  await delay(100);
  validatePattern(input.pattern);
  const nextNo = rules.reduce((max, r) => Math.max(max, Number(r.id.slice(1)) || 0), 0) + 1;
  const rule: RuleSeed = {
    ...input,
    id: `R${String(nextNo).padStart(3, "0")}`,
    hitCount: 0,
    misfireCount: 0,
    createdAt: nowIso(),
  };
  rules.push(rule);
  return clone(withSuggestion(rule));
}

export async function mockUpdateRule(
  id: string,
  patch: Partial<Pick<Rule, "name" | "pattern" | "intent" | "maxLen" | "enabled">>,
): Promise<Rule> {
  await delay(80);
  const r = rules.find((x) => x.id === id);
  if (!r) throw new MockApiError("NOT_FOUND", "没有找到这条规则", 404);
  if (patch.pattern !== undefined) validatePattern(patch.pattern);
  Object.assign(r, patch);
  return clone(withSuggestion(r));
}

export async function mockDeleteRule(id: string): Promise<{ ok: true }> {
  await delay(80);
  if (!rules.some((r) => r.id === id)) throw new MockApiError("NOT_FOUND", "没有找到这条规则", 404);
  rules = rules.filter((r) => r.id !== id);
  return { ok: true };
}

// ───────────────────────── 给买家端聊天 mock 用 ─────────────────────────

/** 规则是否开启（不存在的规则视为开启，避免误关闭其他逻辑）。 */
export function mockRuleEnabled(id: string): boolean {
  const r = rules.find((x) => x.id === id);
  return r ? r.enabled : true;
}

/** 买家端 mock 命中 L1 规则时调用：命中数 +1、更新最后命中时间。 */
export function mockRuleHit(id: string) {
  const r = rules.find((x) => x.id === id);
  if (!r) return;
  r.hitCount += 1;
  r.lastHitAt = nowIso();
}

/** 跨标签页同步用（lib/mock/sync.ts）。 */
export function exportRules(): RuleSeed[] {
  return clone(rules);
}

export function importRules(next: RuleSeed[]) {
  rules = clone(next);
}

export function resetAdminMock() {
  kb = seedKb();
  rules = seedRules();
}
