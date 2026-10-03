import { DEMO_NOW } from '../../demo-clock';
import type { AfterSale, Coupon, Logistics, Order, Product, Sku } from '../../types';
import type { HandlerContext, HandlerResult } from './context';
import { ask, say } from './context';
import { consult } from './consult';
import { isReply, resolveOrder, resolveProduct } from './resolve';

export async function sizeRecommend(ctx: HandlerContext): Promise<HandlerResult> {
  const { heightCm, weightKg, productId } = ctx.state.slots;
  if (heightCm === undefined || weightKg === undefined) return ask(`为了推荐合适的尺码，请告诉我${heightCm === undefined && weightKg === undefined ? '身高和体重（例如160cm、50kg）' : heightCm === undefined ? '身高（厘米）' : '体重（公斤或斤）'}。`);
  const result = await ctx.call<{ size: 'XS' | 'S' | 'M' | 'L' | 'XL'; basis: string }>('recommend_size', { heightCm, weightKg, ...(productId ? { productId } : {}) });
  const messages: HandlerResult['messages'] = [{ role: 'ai', text: `建议您选 ${result.size} 码，供您参考。`, card: { kind: 'size_result', ...result, ...(productId ? { productId } : {}) } }];
  const product = productId ? await ctx.call<Product>('get_product', { productId }) : undefined;
  const care = /机洗|洗护|怎么洗|水洗/.test(ctx.text);
  const reference = await consult(ctx, product, !care);
  return { ...reference, messages: [...messages, ...reference.messages] };
}
export async function logisticsTrack(ctx: HandlerContext, selected?: Order): Promise<HandlerResult> {
  const order = selected ?? await resolveOrder(ctx);
  if (isReply(order)) return order;
  if (!order.logistics) return { ...say('这单还没有物流信息，您可以查看订单状态。'), messages: [{ role: 'ai', text: '这单还没有物流信息，您可以查看订单状态。', card: { kind: 'order', order } }] };
  const result = await ctx.call<{ orderId: string; logistics: Logistics }>('track_logistics', { orderId: order.id });
  return { status: 'done', messages: [{ role: 'ai', text: result.logistics.status === 'delivered' ? '包裹已签收，物流记录在这里。' : `包裹正在配送中${result.logistics.estimatedDelivery ? `，预计 ${result.logistics.estimatedDelivery.slice(5, 10)} 送达` : ''}。`, card: { kind: 'logistics', ...result } }] };
}
export async function orderStatus(ctx: HandlerContext): Promise<HandlerResult> {
  const order = await resolveOrder(ctx);
  return isReply(order) ? order : { status: 'done', messages: [{ role: 'ai', text: '已找到您的订单，详情在这里。', card: { kind: 'order', order } }] };
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
  if (order.logistics) return logisticsTrack(ctx, order);
  if (order.status !== 'paid') return say(order.status === 'pending_payment' ? '这单还未付款，付款后才会安排发货。' : '这单目前无法催发货，请查看订单状态或转人工核实。');
  // The trace/history is a request record, not a promise of a warehouse integration.
  const due = order.paidAt ? new Date(Date.parse(order.paidAt) + 48 * 3600000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '付款后48小时内';
  if (Date.parse(DEMO_NOW) > Date.parse(order.paidAt ?? DEMO_NOW) + 48 * 3600000) return { ...say('已记录您希望尽快发货的诉求。这单已超过常规发货时间，我帮您转人工核实。'), handoffReason: '订单超过常规48小时发货时间' };
  return say(`已记录您的催发货诉求。常规预计发货时间为 ${due}，实际安排请以订单更新为准。`);
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
