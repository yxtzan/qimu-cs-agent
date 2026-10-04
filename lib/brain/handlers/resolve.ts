import type { Order, OrderItem, Product } from '../../types';
import type { HandlerContext, HandlerResult } from './context';
import { ask } from './context';
const orderStatus: Record<string, string> = { pending_payment: '待付款', paid: '待发货', shipped: '已发货', delivered: '已签收', completed: '已完成', cancelled: '已取消' };
function suitable(order: Order, intent: HandlerContext['intent']): boolean {
  if (intent === 'logistics_track') return order.status === 'shipped';
  if (intent === 'refund_progress') return order.afterSales.length > 0;
  if (intent === 'cancel_order') return order.status === 'paid' || order.status === 'pending_payment';
  if (intent === 'modify_order' || intent === 'urge_shipping') return order.status === 'paid';
  if (intent === 'exchange' || intent === 'refund_apply' || intent === 'quality_issue') return ['delivered', 'completed', 'paid', 'shipped'].includes(order.status);
  return true;
}
export async function resolveOrder(ctx: HandlerContext): Promise<Order | HandlerResult> {
  if (ctx.state.slots.orderId) return ctx.call<Order>('get_order', { orderId: ctx.state.slots.orderId });
  const orders = (await ctx.call<Order[]>('list_orders', {})).filter(o => suitable(o, ctx.intent));
  if (orders.length === 1) {
    ctx.state.slots.orderId = orders[0].id;
    return orders[0];
  }
  if (!orders.length) return ask('暂时没有找到符合条件的订单。请提供订单号，我再帮您查一下。');
  return { status: 'collecting', messages: [{ role: 'ai', text: '您想查询或办理哪一单？', card: { kind: 'options', prompt: '请选择订单', options: orders.map(o => ({ label: `${o.id} · ${o.items.map(i => i.productName).join('、')}`, value: `order:${o.id}`, sublabel: orderStatus[o.status] })) } }] };
}
export function resolveItem(ctx: HandlerContext, order: Order): OrderItem | HandlerResult {
  let items = order.items;
  if (ctx.state.slots.itemId) items = items.filter(i => i.itemId === ctx.state.slots.itemId);
  else if (ctx.state.slots.productId) items = items.filter(i => i.productId === ctx.state.slots.productId);
  if (items.length === 1) {
    ctx.state.slots.itemId = items[0].itemId;
    ctx.state.slots.productId = items[0].productId;
    return items[0];
  }
  if (!items.length) return ask('没有找到这单里的对应商品，请重新选择商品。');
  return { status: 'collecting', messages: [{ role: 'ai', text: '这单有几件商品，您想处理哪一件？', card: { kind: 'options', prompt: '请选择商品', options: items.map(i => ({ label: `${i.productName} · ${i.color} ${i.size}`, value: `item:${i.itemId}` })) } }] };
}
export async function resolveProduct(ctx: HandlerContext): Promise<Product | HandlerResult> {
  if (ctx.state.slots.productId) return ctx.call<Product>('get_product', { productId: ctx.state.slots.productId });
  return ask('您想了解哪件商品？从商品页点「问客服」，或告诉我商品编号就可以。');
}
export function isReply(value: Order | OrderItem | Product | HandlerResult): value is HandlerResult { return 'messages' in value; }
