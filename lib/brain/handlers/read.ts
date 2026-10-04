import { DEMO_NOW } from '../../demo-clock';
import type { AfterSale, Coupon, Logistics, Order, Product, Sku } from '../../types';
import type { HandlerContext, HandlerResult } from './context';
import { ask, say } from './context';
import { consult } from './consult';
import { isReply, resolveOrder, resolveProduct } from './resolve';
import type { SizeOutOfRange, SizeRecommendation } from '../../tools/recommend-size';

// D011: an out-of-range size is a suggestion to the buyer, never an automatic transfer; the button transfers.
function outOfRangeReply(result: SizeOutOfRange, height: number, weight: number): HandlerResult {
  let text: string;
  if (result.reason === 'product_sizes') text = `按尺码表，您适合 ${result.missingSize} 码，但这件商品暂时没有这个尺码，可能没有合适您的尺码。`;
  else {
    const { size, heightCm, weightKg } = result.limit;
    const limit = result.bound === 'max' ? `本店尺码表最大到 ${size}（身高 ${heightCm}cm、体重 ${weightKg}kg 以内）` : `本店尺码表最小到 ${size}（身高 ${heightCm}cm、体重 ${weightKg}kg 起）`;
    text = result.reason === 'slim_fit'
      ? `这款是修身版型，按您的身高体重（${height}cm / ${weight}kg）需要比 ${size} 更大的尺码，但${limit}，这款可能没有合适您的尺码。`
      : `您的身高体重（${height}cm / ${weight}kg）超出了尺码表范围，${limit}，这款可能没有合适您的尺码。`;
  }
  return { status: 'done', messages: [{ role: 'ai', text: `${text}如需进一步确认，可以让人工客服帮您看看。`, quickReplies: [{ label: '转人工', action: { type: 'quick_action', name: 'human' } }] }] };
}

export async function sizeRecommend(ctx: HandlerContext): Promise<HandlerResult> {
  const { heightCm, weightKg, productId } = ctx.state.slots;
  if (heightCm === undefined || weightKg === undefined) return ask(`为了推荐合适的尺码，请告诉我${heightCm === undefined && weightKg === undefined ? '身高和体重（例如160cm、50kg）' : heightCm === undefined ? '身高（厘米）' : '体重（公斤或斤）'}。`);
  const result = await ctx.call<SizeRecommendation | SizeOutOfRange>('recommend_size', { heightCm, weightKg, ...(productId ? { productId } : {}) });
  if (result.outOfRange) return outOfRangeReply(result, heightCm, weightKg);
  const messages: HandlerResult['messages'] = [{ role: 'ai', text: `建议您选 ${result.size} 码，供您参考。`, card: { kind: 'size_result', ...result, ...(productId ? { productId } : {}) } }];
  const product = productId ? await ctx.call<Product>('get_product', { productId }) : undefined;
  const care = /机洗|洗护|怎么洗|水洗/.test(ctx.text);
  const reference = await consult(ctx, product, !care);
  return { ...reference, messages: [...messages, ...reference.messages] };
}
type TrackResult =
  | { orderId: string; shipped: true; logistics: Logistics }
  | { orderId: string; shipped: false; status: string; expectedShipBy?: string };

function shipClock(iso: string): string {
  const parts = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(Date.parse(iso)));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('month')}月${get('day')}日 ${get('hour')}:${get('minute')}`;
}

function unshippedCopy(result: Extract<TrackResult, { shipped: false }>, urge: boolean): { text: string; handoff?: string } {
  if (result.status === 'pending_payment') return { text: '这单还未付款，付款后才会安排发货。' };
  if (result.expectedShipBy) {
    const when = shipClock(result.expectedShipBy);
    if (urge && Date.parse(DEMO_NOW) > Date.parse(result.expectedShipBy)) {
      return { text: '已记录您希望尽快发货的诉求。这单已超过常规发货时间，我帮您转人工核实。', handoff: '订单超过常规48小时发货时间' };
    }
    return {
      text: urge
        ? `已记录您的催发货诉求。常规预计发货时间为 ${when} 前，实际安排请以订单更新为准。`
        : `这单已付款，还没发货，预计 ${when} 前发出。`,
    };
  }
  return { text: urge ? '这单目前无法催发货，请查看订单状态或转人工核实。' : '这单目前没有物流信息，您可以查看订单状态。' };
}

function shippedCopy(logistics: Logistics): string {
  return logistics.status === 'delivered' ? '包裹已签收，物流记录在这里。' : `包裹正在配送中${logistics.estimatedDelivery ? `，预计 ${logistics.estimatedDelivery.slice(5, 10)} 送达` : ''}。`;
}

export async function logisticsTrack(ctx: HandlerContext, selected?: Order, known?: TrackResult): Promise<HandlerResult> {
  const order = selected ?? await resolveOrder(ctx);
  if (isReply(order)) return order;
  const result = known ?? await ctx.call<TrackResult>('track_logistics', { orderId: order.id });
  if (!result.shipped) {
    const copy = unshippedCopy(result, false);
    return { status: 'done', ...(copy.handoff ? { handoffReason: copy.handoff } : {}), messages: [{ role: 'ai', text: copy.text, card: { kind: 'order', order } }] };
  }
  return { status: 'done', messages: [{ role: 'ai', text: shippedCopy(result.logistics), card: { kind: 'logistics', orderId: result.orderId, logistics: result.logistics } }] };
}
export async function orderStatus(ctx: HandlerContext): Promise<HandlerResult> {
  const order = await resolveOrder(ctx);
  if (isReply(order)) return order;
  const result = await ctx.call<TrackResult>('track_logistics', { orderId: order.id });
  const text = result.shipped ? '已找到您的订单，详情在这里。' : unshippedCopy(result, false).text;
  return { status: 'done', messages: [{ role: 'ai', text, card: { kind: 'order', order } }] };
}
export async function refundProgress(ctx: HandlerContext): Promise<HandlerResult> {
  const order = await resolveOrder(ctx);
  if (isReply(order)) return order;
  const sales = await ctx.call<AfterSale[]>('get_aftersale', { orderId: order.id });
  if (!sales.length) return say('这单暂时还没有售后申请。您可以告诉我需要退款还是换货。');
  return { status: 'done', messages: sales.map(afterSale => ({ role: 'ai', text: afterSale.status === 'refunding' ? '退款处理中，商家确认收到退货后24小时内发起，预计1–3个工作日原路退回，请您留意到账通知。' : '已查到售后进度，处理记录在这里。', card: { kind: 'aftersale', afterSale } })) };
}
export async function urgeShipping(ctx: HandlerContext): Promise<HandlerResult> {
  const order = await resolveOrder(ctx);
  if (isReply(order)) return order;
  const result = await ctx.call<TrackResult>('track_logistics', { orderId: order.id });
  if (result.shipped) return logisticsTrack(ctx, order, result);
  const copy = unshippedCopy(result, true);
  return { ...say(copy.text), ...(copy.handoff ? { handoffReason: copy.handoff } : {}) };
}
export async function stockCheck(ctx: HandlerContext): Promise<HandlerResult> {
  const product = await resolveProduct(ctx);
  if (isReply(product)) return product;
  const { size, color } = ctx.state.slots;
  const skus = await ctx.call<Sku[]>('check_stock', { productId: product.id, ...(size ? { size } : {}), ...(color ? { color } : {}) });
  return say(skus.length ? skus.map(s => `${s.color} ${s.size}：${s.stock > 0 ? `有货（${s.stock}件）` : `暂时缺货${s.restockDate ? `，预计 ${s.restockDate.slice(5, 10)} 补货` : ''}`}`).join('\n') : '这件商品没有您选的颜色或尺码，请换一个规格试试。');
}
export async function promotion(ctx: HandlerContext): Promise<HandlerResult> {
  const coupons = await ctx.call<Coupon[]>('list_coupons', {});
  const reference = await consult(ctx);
  return { ...reference, messages: [{ role: 'ai', text: coupons.length ? '这是您目前可用的优惠券，一单限用一张。' : '目前没有可用优惠券，我帮您看看活动说明。', card: { kind: 'coupons', coupons } }, ...reference.messages] };
}
