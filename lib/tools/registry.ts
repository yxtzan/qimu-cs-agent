import type { LlmTool } from '../llm/openrouter';
import { DEMO_NOW } from '../demo-clock';
import type { ProductCategory } from '../types';
import { getBuyer, getProduct, listCoupons, listOrders, listProducts, orderStatuses, productCategories } from '../store/collections';
import { searchKnowledge } from '../rag/search';
import { createPendingAction } from './execute-pending';
import { recommendSize } from './recommend-size';
import { trackLogistics } from './track-logistics';
import { ownedOrder } from './write-rules';
import { textArg, ToolError, type ToolContext, type ToolDefinition, type ToolResult } from './types';
export type { ToolContext, ToolResult } from './types';

type Schema = Record<string, unknown>;
const string = (description: string, values?: readonly string[]): Schema => ({ type: 'string', description, ...(values ? { enum: values } : {}) });
const number = (description: string, minimum?: number): Schema => ({ type: 'number', description, ...(minimum !== undefined ? { minimum } : {}) });
const orderId = string('要查询或办理的订单编号，例如 QM2026092801；只能访问当前买家的订单');
const itemId = string('订单商品行 itemId，从 list_orders 或 get_order 返回的商品行中取得，不是 productId 或 skuId');
const productId = string('商品编号，例如 P007');
const size = string('尺码：XS、S、M、L、XL', ['XS', 'S', 'M', 'L', 'XL']);
const schema = (properties: Record<string, Schema>, required: string[] = []): Schema => ({ type: 'object', properties, required, additionalProperties: false });
const definitions: ToolDefinition[] = [];

// Validate model-produced arguments at runtime as well as advertising their schema.
function validate(value: unknown, spec: Schema): boolean {
  if (spec.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const object = value as Record<string, unknown>;
    const properties = spec.properties as Record<string, Schema>;
    return (spec.required as string[]).every(k => object[k] !== undefined) && Object.entries(object).every(([k, v]) => properties[k] && validate(v, properties[k]));
  }
  if (spec.type === 'string') return typeof value === 'string' && Boolean(value.trim()) && (!spec.enum || (spec.enum as string[]).includes(value));
  if (spec.type === 'number') return typeof value === 'number' && Number.isFinite(value) && (spec.minimum === undefined || value >= (spec.minimum as number));
  return false;
}
function add(name: string, description: string, parameters: Schema, kind: ToolDefinition['kind'], handler: (args: Record<string, unknown>, ctx: ToolContext) => unknown | Promise<unknown>): void {
  definitions.push({ name, description, parameters, kind, async run(args, ctx) {
    try {
      if (!ctx?.buyerId || !ctx.conversationId || !getBuyer(ctx.buyerId)) throw new ToolError('请提供有效买家和会话上下文');
      if (!validate(args, parameters)) throw new ToolError('工具参数不完整或格式错误，请按参数说明补充');
      return { ok: true, data: await handler(args, ctx) };
    } catch (error) {
      if (error instanceof ToolError) return { ok: false, reason: error.message, handoff: error.handoff, kind: error.kind };
      console.error('[tools]', name, error instanceof Error ? error.name : 'UnknownError');
      return { ok: false, reason: '工具暂时无法执行，请稍后重试或转人工客服', handoff: true, kind: 'system' };
    }
  } });
}
function product(args: Record<string, unknown>) {
  const found = getProduct(textArg(args, 'productId'));
  if (!found) throw new ToolError('没有找到这件商品');
  return found;
}

add('list_orders', '查询当前买家的订单，按下单时间倒序；可筛选状态和最近天数，不能查询其他买家。', schema({ status: string('订单状态筛选', orderStatuses), sinceDays: number('最近多少天内下单，以演示时间为准', 0) }), 'read', (args, ctx) => listOrders(ctx.buyerId, args.status as Parameters<typeof listOrders>[1]).filter(o => args.sinceDays === undefined || Date.parse(o.createdAt) >= Date.parse(DEMO_NOW) - (args.sinceDays as number) * 86400000));
add('get_order', '查询当前买家的一张订单，获取商品行 itemId、状态、收货地址和售后单；自动校验归属。', schema({ orderId }, ['orderId']), 'read', (args, ctx) => ownedOrder(textArg(args, 'orderId'), ctx));
add('track_logistics', '查询当前买家订单的物流。已发货返回 shipped 为 true，以及物流公司和时间线。未发货不报错：返回 shipped 为 false 和订单 status。status 为 paid 时还有 expectedShipBy（付款时间加 48 小时），直接告诉买家预计该时间前发货，不要转人工，也不要当成查询失败。status 为 pending_payment 时没有预计时间，说明付款后才会发货。', schema({ orderId }, ['orderId']), 'read', (args, ctx) => trackLogistics(ownedOrder(textArg(args, 'orderId'), ctx)));
add('get_aftersale', '查询当前买家订单的全部售后单及进度时间线，包含退款和换货。', schema({ orderId }, ['orderId']), 'read', (args, ctx) => ownedOrder(textArg(args, 'orderId'), ctx).afterSales);
add('search_products', '按名称或标签搜索店内商品，可按品类筛选，返回按销量排序的商品列表。', schema({ query: string('商品名称或标签关键词，例如 大衣'), category: string('商品品类', productCategories) }, ['query']), 'read', args => listProducts({ q: textArg(args, 'query'), category: args.category as ProductCategory | undefined }));
add('get_product', '查询商品详情，包括材质、版型、洗护说明、颜色尺码和实时 SKU 库存。', schema({ productId }, ['productId']), 'read', args => product(args));
add('check_stock', '实时查询商品指定颜色和尺码的库存与补货日期；省略颜色或尺码时返回所有匹配 SKU。', schema({ productId, size, color: string('目标颜色，必须与商品颜色名称一致') }, ['productId']), 'read', args => product(args).skus.filter(s => (!args.size || s.size === args.size) && (!args.color || s.color === args.color)));
add('recommend_size', '按确定性尺码表推荐，身高体重取较大码并按商品版型修正；超出尺码表时返回 outOfRange 和尺码表上限，此时把上限告诉买家并提供转人工选项，不要自动转人工。体重必须先换算为公斤，100 斤等于 50kg。', schema({ heightCm: number('身高，单位厘米', 1), weightKg: number('体重，单位公斤；斤需先除以 2', 1), productId }, ['heightCm', 'weightKg']), 'read', args => recommendSize(args.heightCm as number, args.weightKg as number, args.productId as string | undefined));
add('list_coupons', '查询当前买家未使用且未过期的优惠券；不返回已用或过期券。', schema({}), 'read', (_args, ctx) => listCoupons(ctx.buyerId));
add('search_kb', '搜索店铺知识库，返回最相关的政策或洗护分块及来源；无资料时不要编造答案，应转人工。', schema({ query: string('自然语言问题，例如 真丝怎么洗') }, ['query']), 'read', args => searchKnowledge(textArg(args, 'query')));
add('apply_refund', '申请仅退款或退货退款，校验期限和资格，只生成待买家确认的 PendingAction，不立即退款。质量问题需照片，金额超过 500 元转人工；已签收应选退货退款。缺少买家说明的原因时先追问，不猜测原因或商品行。', schema({ orderId, itemId, type: string('退款种类：refund_only 仅退款（仅未发货），return_refund 退货退款（已签收）', ['refund_only', 'return_refund']), reason: string('直接复制买家消息中说明本次退款原因的原文片段，不改写、不从历史售后记录取原因；仅说想退货还没给原因，先追问。质量问题提醒提供照片') }, ['orderId', 'itemId', 'type', 'reason']), 'write', (args, ctx) => createPendingAction('apply_refund', args, ctx));
add('request_exchange', '同款换尺码或颜色，签收后 7 天内每件限一次且目标库存足够；只生成 PendingAction，买家确认后才提交售后和扣库存。', schema({ orderId, itemId, newSize: size, newColor: string('希望换成的颜色；省略则保留原颜色') }, ['orderId', 'itemId']), 'write', (args, ctx) => createPendingAction('request_exchange', args, ctx));
add('modify_address', '仅已付款未发货（paid）的订单可改地址；只生成 PendingAction，买家确认后才修改订单。', schema({ orderId, address: schema({ name: string('收件人姓名'), phone: string('收件电话，演示数据使用打码号码'), region: string('省、市、区'), detail: string('街道门牌等详细地址') }, ['name', 'phone', 'region', 'detail']) }, ['orderId', 'address']), 'write', (args, ctx) => createPendingAction('modify_address', args, ctx));
add('cancel_order', '仅待付款或已付款未发货订单可取消；只生成 PendingAction，确认后取消，已付款自动全额退款。', schema({ orderId }, ['orderId']), 'write', (args, ctx) => createPendingAction('cancel_order', args, ctx));
add('create_handoff', '请求转接人工客服：风险问题、资料不足、资格无法核实或复杂需求时调用；返回指令交由流水线切换会话并生成摘要。', schema({ reason: string('转人工的具体中文原因，说明还需人工处理什么') }, ['reason']), 'action', args => ({ handoff: true, reason: textArg(args, 'reason') }));

export const toolRegistry = new Map(definitions.map(tool => [tool.name, tool]));
export const toOpenAITools = (): LlmTool[] => definitions.map(({ name, description, parameters }) => ({ type: 'function', function: { name, description, parameters } }));
export async function runTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const tool = toolRegistry.get(name);
  return tool ? tool.run(args, ctx) : { ok: false, reason: '没有找到这个工具' };
}
