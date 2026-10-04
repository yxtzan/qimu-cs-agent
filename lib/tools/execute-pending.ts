import { randomUUID } from 'node:crypto';
import { nowIso } from '../demo-clock';
import { readCollection, writeCollection } from '../store';
import { getBuyer, getOrder, updateOrder, updateProduct } from '../store/collections';
import type { AfterSale, ChatCard, PendingAction } from '../types';
import { ToolError, type ToolContext, type ToolResult } from './types';
import { refundableAmount, validateWrite } from './write-rules';

export interface PendingExecution { pendingAction: PendingAction; card?: ChatCard }
export const listPendingActions = () => readCollection<PendingAction>('pending_actions');
export const getPendingAction = (id: string) => listPendingActions().find(a => a.id === id);

export function createPendingAction(tool: PendingAction['tool'], input: Record<string, unknown>, ctx: ToolContext): PendingAction {
  if (!ctx.buyerId || !ctx.conversationId || !getBuyer(ctx.buyerId)) throw new ToolError('请提供有效买家和会话上下文');
  const valid = validateWrite(tool, input, ctx);
  const action: PendingAction = {
    id: `PA-${randomUUID()}`, conversationId: ctx.conversationId, tool,
    args: { ...valid.args, buyerId: ctx.buyerId }, summary: valid.summary, status: 'pending', createdAt: nowIso(),
  };
  writeCollection('pending_actions', [...listPendingActions(), action]);
  return action;
}

function scopedAction(id: string, ctx: ToolContext): PendingAction {
  const action = getPendingAction(id);
  if (!action) throw new ToolError('没有找到这个待确认操作');
  if (!ctx.buyerId || !ctx.conversationId || action.conversationId !== ctx.conversationId || action.args.buyerId !== ctx.buyerId) throw new ToolError('这个待确认操作不属于当前买家或会话，拒绝访问');
  return action;
}
function resolveAction(action: PendingAction, status: PendingAction['status'], result: string): PendingAction {
  const next = { ...action, status, result, resolvedAt: nowIso() };
  writeCollection('pending_actions', listPendingActions().map(a => a.id === next.id ? next : a));
  return next;
}

/** 售后单号：`AS` + 演示当天 `YYYYMMDD` + 当天三位序号（已有同日前缀里的最大序号 + 1）。`reserved` 用来避开同一次确认里还没写盘的单号。 */
function nextAfterSaleId(at: string, reserved: Iterable<string> = []): string {
  const prefix = `AS${at.slice(0, 10).replaceAll('-', '')}`;
  let max = 0;
  const take = (id: string) => {
    if (!id.startsWith(prefix)) return;
    const tail = id.slice(prefix.length);
    if (!/^\d+$/.test(tail)) return;
    const seq = Number(tail);
    if (seq > max) max = seq;
  };
  for (const order of readCollection<{ afterSales: { id: string }[] }>('orders')) {
    for (const sale of order.afterSales) take(sale.id);
  }
  for (const pending of listPendingActions()) {
    const saved = pending.args.afterSaleId;
    if (typeof saved === 'string') take(saved);
  }
  for (const id of reserved) take(id);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

/** 写盘前把单号记在这个 PendingAction 上。确认中断后重试仍用这一张，不再按新序号另开。 */
function savedAfterSaleId(action: PendingAction): string | undefined {
  const id = action.args.afterSaleId;
  return typeof id === 'string' && /^AS\d{11}$/.test(id) ? id : undefined;
}
function rememberAfterSaleId(action: PendingAction, afterSaleId: string): PendingAction {
  const next = { ...action, args: { ...action.args, afterSaleId } };
  writeCollection('pending_actions', listPendingActions().map(a => a.id === next.id ? next : a));
  return next;
}
function linkedAfterSale(action: PendingAction): AfterSale | undefined {
  if (action.tool !== 'apply_refund' && action.tool !== 'request_exchange') return undefined;
  const id = savedAfterSaleId(action);
  const orderId = action.args.orderId;
  if (!id || typeof orderId !== 'string') return undefined;
  return getOrder(orderId)?.afterSales.find(sale => sale.id === id);
}

// Deliberately synchronous between validation and persistence: parallel confirmations
// in the same server process cannot reserve the same final unit or execute twice.
export function confirmPendingAction(id: string, ctx: ToolContext): ToolResult<PendingExecution> {
  let action: PendingAction;
  try { action = scopedAction(id, ctx); }
  catch (error) { if (error instanceof ToolError) return { ok: false, reason: error.message }; throw error; }
  if (action.status === 'confirmed') return { ok: true, data: { pendingAction: action } };
  if (action.status !== 'pending') return { ok: false, reason: action.result ?? '这个操作已经处理，不能再次确认' };
  const linked = linkedAfterSale(action);
  if (linked) {
    const resolved = resolveAction(action, 'confirmed', action.tool === 'request_exchange' ? '换货申请已提交，等待审核和退回商品' : '退款申请已办理，请查看售后进度');
    return { ok: true, data: { pendingAction: resolved, card: { kind: 'aftersale', afterSale: linked } } };
  }
  try {
    const valid = validateWrite(action.tool, action.args, ctx);
    const at = nowIso();
    let card: ChatCard;
    if (action.tool === 'modify_address') {
      const order = updateOrder(valid.order.id, { address: valid.args.address as typeof valid.order.address })!;
      card = { kind: 'order', order };
    } else if (action.tool === 'cancel_order') {
      const afterSales = [...valid.order.afterSales];
      if (valid.order.status === 'paid') {
        for (const item of valid.order.items) {
          if (afterSales.some(a => a.itemId === item.itemId && a.status === 'refunded')) continue;
          afterSales.push({ id: nextAfterSaleId(at, afterSales.map(a => a.id)), orderId: valid.order.id, itemId: item.itemId, type: 'refund_only', reason: '买家确认取消已付款订单', amount: refundableAmount(valid.order, item), status: 'refunded', createdAt: at, timeline: [{ at, status: 'refunded', note: '订单取消，演示全额退款已完成，原路退回' }] });
        }
      }
      card = { kind: 'order', order: updateOrder(valid.order.id, { status: 'cancelled', afterSales })! };
    } else {
      const item = valid.item!;
      // 单号仍是演示日期 + 当天三位序号。先记在这个动作上，写盘中断后重试找回同一张。
      let afterSaleId = savedAfterSaleId(action);
      if (!afterSaleId) {
        afterSaleId = nextAfterSaleId(at);
        action = rememberAfterSaleId(action, afterSaleId);
      }
      const existing = valid.order.afterSales.find(a => a.id === afterSaleId);
      if (existing) {
        card = { kind: 'aftersale', afterSale: existing };
      } else {
        const exchange = action.tool === 'request_exchange';
        const immediate = valid.args.type === 'refund_only';
        const status = immediate ? 'refunded' : 'pending_review';
        const afterSale: AfterSale = {
          id: afterSaleId, orderId: valid.order.id, itemId: item.itemId,
          type: exchange ? 'exchange' : valid.args.type as AfterSale['type'],
          reason: exchange ? `同款换成 ${valid.target!.color} ${valid.target!.size}` : valid.args.reason as string,
          amount: exchange ? 0 : refundableAmount(valid.order, item),
          ...(exchange ? { newSize: valid.target!.size, newColor: valid.target!.color } : {}),
          status, createdAt: at,
          timeline: [{ at, status, note: immediate ? '未发货仅退款，演示退款已完成，原路退回' : exchange ? '换货申请已提交，待审核吊牌和洗涤状态；收到退件后 24 小时内发新件' : `退货退款已提交，${valid.quality ? '请提供照片，待质量问题审核；商家承担退货运费' : `待核实吊牌完好、未洗涤；${getBuyer(ctx.buyerId)?.memberLevel === '金卡' ? '金卡会员免退货运费' : '非质量问题退货运费由买家承担'}`}；收到退货后 24 小时内发起退款，1–3 个工作日原路退回` }],
        };
        const afterSales = [...valid.order.afterSales, afterSale];
        const allRefunded = valid.order.items.every(i => afterSales.some(a => a.itemId === i.itemId && a.status === 'refunded'));
        // Reserve target stock only after the buyer confirms. The returned item is not
        // added to sellable inventory until a future warehouse workflow inspects it.
        if (exchange) updateProduct(valid.product!.id, { skus: valid.product!.skus.map(s => s.skuId === valid.target!.skuId ? { ...s, stock: s.stock - item.quantity } : s) });
        updateOrder(valid.order.id, { afterSales, ...(immediate && allRefunded ? { status: 'cancelled' as const } : {}) });
        card = { kind: 'aftersale', afterSale };
      }
    }
    const resolved = resolveAction(action, 'confirmed', action.tool === 'request_exchange' ? '换货申请已提交，等待审核和退回商品' : action.tool === 'apply_refund' ? '退款申请已办理，请查看售后进度' : action.tool === 'modify_address' ? '收货地址已修改' : valid.order.status === 'paid' ? '订单已取消，尚未退还的已付款金额自动全额退款' : '未付款订单已取消，无需退款');
    return { ok: true, data: { pendingAction: resolved, card } };
  } catch (error) {
    if (!(error instanceof ToolError)) throw error;
    resolveAction(action, 'failed', error.message);
    return { ok: false, reason: error.message };
  }
}

export function cancelPendingAction(id: string, ctx: ToolContext): ToolResult<PendingExecution> {
  try {
    const action = scopedAction(id, ctx);
    if (action.status === 'cancelled') return { ok: true, data: { pendingAction: action } };
    if (action.status !== 'pending') return { ok: false, reason: '这个操作已经处理，不能取消' };
    return { ok: true, data: { pendingAction: resolveAction(action, 'cancelled', '已取消办理，订单和库存未改变') } };
  } catch (error) { if (error instanceof ToolError) return { ok: false, reason: error.message }; throw error; }
}
