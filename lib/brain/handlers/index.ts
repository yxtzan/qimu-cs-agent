import { DEMO_NOW } from '../../demo-clock';
import type { IntentId, Order, Product } from '../../types';
import { getBuyer, getOrder } from '../../store/collections';
import type { HandlerContext, HandlerResult } from './context';
import { HandlerFailure, ask, say } from './context';
import { consult } from './consult';
import { isReply, resolveOrder } from './resolve';
import { logisticsTrack, orderStatus, promotion, refundProgress, sizeRecommend, stockCheck, urgeShipping } from './read';
import { writeIntent } from './write';

async function productConsult(ctx: HandlerContext): Promise<HandlerResult> {
  const product = ctx.state.slots.productId ? await ctx.call<Product>('get_product', { productId: ctx.state.slots.productId }) : undefined;
  return consult(ctx, product);
}
const DAY_MS = 86400000;
/** Signed for and still inside the 7-day no-reason window (DATA_SPEC §6: day 7 included), measured on the demo clock. */
function withinNoReasonWindow(order: Order): boolean {
  if (!['delivered', 'completed'].includes(order.status) || !order.deliveredAt) return false;
  const elapsed = Date.parse(DEMO_NOW) - Date.parse(order.deliveredAt);
  return Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= 7 * DAY_MS;
}
// D011 §5: ">¥500 quality issues go to a human" is about the refund request step, not about every complaint.
// Inside the 7-day window we give the buyer options first; only past it (and over ¥500) do we transfer.
async function qualityIssue(ctx: HandlerContext): Promise<HandlerResult> {
  const order = await resolveOrder(ctx);
  if (isReply(order)) return { ...order, quality: true };
  if (withinNoReasonWindow(order)) {
    const gold = getBuyer(ctx.toolContext.buyerId)?.memberLevel === '金卡';
    const shipping = gold ? '您是金卡会员，退货运费由我们承担' : '非质量问题的退货运费由买家承担（金卡会员免退货运费）';
    return { status: 'done', quality: true, messages: [{ role: 'ai',
      text: `很抱歉这件商品没能让您满意。这单签收还在 7 天无理由退换期内，您可以直接申请退货或换货，${shipping}。如果是商品质量问题，也可以转人工客服核实。`,
      quickReplies: [
        { label: '换个颜色', action: { type: 'text', text: '想换颜色' } },
        { label: '申请退货', action: { type: 'text', text: '申请退货' } },
        { label: '是质量问题，转人工', action: { type: 'quick_action', name: 'human' } },
      ] }] };
  }
  if (order.payAmount > 500) return { ...say('很抱歉给您带来困扰，这单需要人工核实质量问题，我帮您转接。'), handoffReason: '质量问题金额超过500元，需人工审核', quality: true };
  const reference = await consult(ctx);
  return { ...reference, quality: true, messages: [{ role: 'ai', text: '很抱歉给您带来困扰。请保留商品问题照片，我们会先核实，再协助您申请退换。', quickReplies: [{ label: '申请退货退款', action: { type: 'text', text: '质量问题想申请退货退款' } }] }, ...reference.messages] };
}
const handlers: Record<IntentId, (ctx: HandlerContext) => Promise<HandlerResult>> = {
  product_consult: productConsult,
  size_recommend: sizeRecommend,
  stock_check: stockCheck,
  promotion,
  shipping_policy: consult,
  order_status: orderStatus,
  logistics_track: logisticsTrack,
  urge_shipping: urgeShipping,
  modify_order: writeIntent,
  cancel_order: writeIntent,
  refund_apply: writeIntent,
  refund_progress: refundProgress,
  exchange: writeIntent,
  quality_issue: qualityIssue,
  return_policy: consult,
  invoice: consult,
  human_request: async () => ({ messages: [], status: 'done', handoffReason: '买家要求人工客服' }),
  greeting: async ctx => say(/谢谢|感谢/.test(ctx.text) ? '不客气，很高兴能帮到您。还有问题随时找我。' : '您好，我是栖木智能客服。有什么可以帮您？'),
  multi_step_complex: async () => ({ ...say('这个问题我需要再确认一下。'), unresolved: true }),
  other: async ctx => {
    const order = ctx.state.slots.orderId ? getOrder(ctx.state.slots.orderId) : undefined;
    return { status: 'done', messages: [{ role: 'ai', text: order?.buyerId === ctx.toolContext.buyerId ? `找到订单 ${order.id}（${order.items.map(i => i.productName).join('、')}）。您想办理什么？` : '我可以帮您查物流、推荐尺码、查询退款或办理退换。请告诉我具体需要。', quickReplies: [{ label: '查物流', action: { type: 'quick_action', name: 'track_logistics' } }, { label: '退款进度', action: { type: 'quick_action', name: 'refund_progress' } }, { label: '转人工', action: { type: 'quick_action', name: 'human' } }] }] };
  },
};
export function collectRefundReason(ctx: HandlerContext): void {
  if (ctx.intent === 'refund_apply' && /不合适|太紧|偏小|偏大|质量|破损|色差|不喜欢|开线|起球|已洗|洗过/.test(ctx.text)) ctx.state.slots.reason = ctx.text;
  // A follow-up such as “腰太紧了” completes the previously collected refund reason.
  if (ctx.intent === 'refund_apply' && ctx.state.currentTask?.status === 'collecting' && ctx.state.currentTask.intent === 'refund_apply' && !/退款|退货/.test(ctx.text)) ctx.state.slots.reason = ctx.text;
}
export async function runHandler(ctx: HandlerContext): Promise<HandlerResult> {
  collectRefundReason(ctx);
  try { return await handlers[ctx.intent](ctx); }
  catch (error) {
    if (!(error instanceof HandlerFailure)) throw error;
    return { ...ask(error.message), ...(error.handoff ? { handoffReason: error.message } : {}) };
  }
}
// T04-1: this finite, read-only combination has no write or general agent loop.
export function isSizeCareCombination(ctx: { state: HandlerContext['state']; text: string }): boolean {
  return Boolean(ctx.state.slots.productId && ctx.state.slots.heightCm !== undefined && ctx.state.slots.weightKg !== undefined && /穿什么码|什么尺码|选什么码/.test(ctx.text) && /机洗|洗护|怎么洗|水洗/.test(ctx.text) && !/退|换|取消|地址|券|人工|发票|快递|物流|另外.*(?:件|单)/.test(ctx.text));
}
