import { DEMO_NOW } from '../demo-clock';
import { getBuyer, getOrder, getProduct } from '../store/collections';
import type { Address, Order, OrderItem, PendingAction, Product, Sku } from '../types';
import { textArg, ToolError, type ToolContext } from './types';

export function ownedOrder(orderId: string, ctx: ToolContext): Order {
  const order = getOrder(orderId);
  if (!order) throw new ToolError('没有找到这个订单');
  if (order.buyerId !== ctx.buyerId) throw new ToolError('这个订单不属于当前买家，拒绝访问', { kind: 'access' });
  return order;
}
export interface ValidatedWrite { order: Order; item?: OrderItem; product?: Product; target?: Sku; args: Record<string, unknown>; summary: string; quality?: boolean }
const qualityPattern = /质量|破损|开线|起球|色差|瑕疵|异味|过敏|红疹|破洞|掉色/;
const active = (status: string) => !['rejected', 'closed', 'refunded'].includes(status);

function checkWindow(order: Order, days: number): void {
  if (!['delivered', 'completed'].includes(order.status) || !order.deliveredAt) throw new ToolError('订单尚未签收，请签收后申请退换货', { kind: 'business' });
  const elapsed = Date.parse(DEMO_NOW) - Date.parse(order.deliveredAt);
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > days * 86400000) throw new ToolError(`已超出签收后 ${days} 天的申请期限，建议转人工确认`, { kind: 'business', handoff: true });
}
function readAddress(value: unknown): Address {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ToolError('请提供完整收货地址');
  const args = value as Record<string, unknown>;
  return { name: textArg(args, 'name'), phone: textArg(args, 'phone'), region: textArg(args, 'region'), detail: textArg(args, 'detail') };
}

/** 已发货 / 已签收不能仅退款。普通业务拒绝，不强制转人工（D011：把原因告诉买家）。 */
export function refundOnlyBlockedMessage(status: Order['status']): string {
  const when = status === 'shipped' ? '发货' : '签收';
  return `这件已经${when}了，本店不支持仅退款，需要把商品寄回办理退货退款；如果是质量问题，可以转人工核实。`;
}

export function validateWrite(tool: PendingAction['tool'], input: Record<string, unknown>, ctx: ToolContext): ValidatedWrite {
  const order = ownedOrder(textArg(input, 'orderId'), ctx);
  if (tool === 'modify_address') {
    if (order.status !== 'paid') throw new ToolError('仅已付款未发货（paid）的订单可以修改地址', { kind: 'business' });
    const address = readAddress(input.address);
    return { order, args: { orderId: order.id, address }, summary: `将订单 ${order.id} 的收货地址改为：${address.name}，${address.phone}，${address.region} ${address.detail}` };
  }
  if (tool === 'cancel_order') {
    if (!['pending_payment', 'paid'].includes(order.status)) throw new ToolError('仅待付款或已付款未发货的订单可以取消', { kind: 'business' });
    if (order.afterSales.some(a => active(a.status))) throw new ToolError('订单已有处理中售后，请先核对售后进度', { kind: 'business' });
    const refunded = order.afterSales.filter(a => a.status === 'refunded').reduce((sum, a) => sum + a.amount, 0);
    const remaining = Math.max(0, Math.round((order.payAmount - refunded) * 100) / 100);
    return { order, args: { orderId: order.id }, summary: `取消订单 ${order.id}${order.status === 'paid' ? `，自动退还${refunded ? '剩余' : '全部'}已付款金额 ¥${remaining.toFixed(2)}` : '（尚未付款，无需退款）'}` };
  }
  const item = order.items.find(i => i.itemId === textArg(input, 'itemId'));
  if (!item) throw new ToolError('没有找到这个订单中的商品');
  if (order.afterSales.some(a => a.itemId === item.itemId && active(a.status))) throw new ToolError('这件商品已有处理中售后，请先查询售后进度', { kind: 'business' });
  if (order.afterSales.some(a => a.itemId === item.itemId && a.status === 'refunded')) throw new ToolError('这件商品已退款，不能重复办理', { kind: 'business' });
  if (tool === 'request_exchange') {
    if (order.afterSales.some(a => a.itemId === item.itemId && a.type === 'exchange' && a.status !== 'rejected')) throw new ToolError('每单每件限换货 1 次，这件商品已经办理过换货', { kind: 'business' });
    checkWindow(order, 7);
    const product = getProduct(item.productId);
    if (!product) throw new ToolError('没有找到这件商品');
    const size = input.newSize === undefined ? item.size : textArg(input, 'newSize');
    const color = input.newColor === undefined ? item.color : textArg(input, 'newColor');
    if (size === item.size && color === item.color) throw new ToolError('请选择不同的尺码或颜色', { kind: 'business' });
    const target = product.skus.find(s => s.size === size && s.color === color);
    if (!target) throw new ToolError('这件商品没有所选颜色或尺码', { kind: 'business' });
    if (target.stock < item.quantity) throw new ToolError(`缺货${target.restockDate ? `，预计 ${target.restockDate.slice(5, 10)} 补货` : '，补货时间请咨询人工客服'}`, { kind: 'business' });
    const args = { orderId: order.id, itemId: item.itemId, newSize: size, newColor: color };
    return { order, item, product, target, args, summary: `为订单 ${order.id} 的「${item.productName} ${item.color} ${item.size}」换成 ${color} ${size}，共 ${item.quantity} 件；请确认吊牌完好、未洗涤，收到退件后 24 小时内发新件` };
  }
  const reason = textArg(input, 'reason');
  const type = textArg(input, 'type');
  if (!['refund_only', 'return_refund'].includes(type)) throw new ToolError('退款类型必须为仅退款或退货退款');
  if (['pending_payment', 'cancelled'].includes(order.status)) throw new ToolError('这个订单尚未付款或已取消，不能申请退款', { kind: 'business' });
  const quality = qualityPattern.test(reason);
  if (type === 'refund_only' && order.status !== 'paid') throw new ToolError(refundOnlyBlockedMessage(order.status), { kind: 'business', handoff: false });
  if (type === 'return_refund') {
    checkWindow(order, quality ? 15 : 7);
    if (!quality && /已(?:经)?(?:洗|剪)|洗过|洗了|吊牌(?:不在|没了|丢|已拆|已剪)|没有吊牌/.test(reason)) throw new ToolError('无理由退货要求吊牌完好、未洗涤；如有质量问题请说明并提供照片', { kind: 'business' });
  }
  if (quality && item.unitPrice * item.quantity > 500) throw new ToolError('金额 > ¥500 的质量问题需要转人工审核，请提供照片', { kind: 'manual_review', handoff: true });
  const shipping = quality || getBuyer(ctx.buyerId)?.memberLevel === '金卡' ? '商家承担退货运费' : '非质量问题退货运费由买家承担';
  return { order, item, quality, args: { orderId: order.id, itemId: item.itemId, type, reason }, summary: `为订单 ${order.id} 的「${item.productName}」申请${type === 'refund_only' ? '仅退款' : '退货退款'}，原因：${reason}；${type === 'refund_only' ? '未发货确认后即退' : `${shipping}；${quality ? '需提供照片，等待审核' : '请确认吊牌完好、未洗涤'}`}` };
}

export function refundableAmount(order: Order, item: OrderItem): number {
  const paidCents = Math.round(order.payAmount * 100);
  const shares = order.items.map(i => i.unitPrice * i.quantity / order.totalAmount * paidCents);
  const amounts = shares.map(Math.floor);
  const remainder = paidCents - amounts.reduce((a, b) => a + b, 0);
  const ranked = shares.map((share, index) => ({ index, fraction: share - amounts[index] })).sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let n = 0; n < remainder; n++) amounts[ranked[n].index]++;
  return amounts[order.items.findIndex(i => i.itemId === item.itemId)] / 100;
}
