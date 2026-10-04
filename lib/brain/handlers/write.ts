import type { PendingAction } from '../../types';
import { addHistory } from '../state';
import type { HandlerContext, HandlerResult } from './context';
import { ask } from './context';
import { isReply, resolveItem, resolveOrder } from './resolve';

export async function writeIntent(ctx: HandlerContext): Promise<HandlerResult> {
  const order = await resolveOrder(ctx);
  if (isReply(order)) return order;
  const args: Record<string, unknown> = { orderId: order.id };
  let tool: PendingAction['tool'];
  if (ctx.intent === 'cancel_order') tool = 'cancel_order';
  else if (ctx.intent === 'modify_order') {
    tool = 'modify_address';
    const address = ctx.state.slots.address;
    if (!address?.name || !address.phone || !address.region || !address.detail) return ask('请补充新收货地址，例如：姓名：林小满，电话：138****0001，地区：浙江省 杭州市 西湖区，地址：示例路1号。我会先给您确认，再修改。');
    args.address = address;
  } else {
    const item = resolveItem(ctx, order);
    if (isReply(item)) return item;
    args.itemId = item.itemId;
    if (ctx.intent === 'exchange') {
      tool = 'request_exchange';
      const { size, color } = ctx.state.slots;
      if (!size && !color) return ask('您希望换成什么尺码或颜色？告诉我后，我先帮您确认库存。');
      if (size) args.newSize = size;
      if (color) args.newColor = color;
      await ctx.call('check_stock', { productId: item.productId, ...(size ? { size } : {}), ...(color ? { color } : {}) });
    } else {
      tool = 'apply_refund';
      const reason = ctx.state.slots.reason;
      if (!reason) return ask('可以的，请告诉我退款或退货原因，我先帮您核实是否符合申请条件。');
      args.reason = reason;
      args.type = ['paid', 'pending_payment'].includes(order.status) || /仅退款|只退款/.test(ctx.text) ? 'refund_only' : 'return_refund';
    }
  }
  const action = await ctx.call<PendingAction>(tool, args);
  ctx.state.pendingActionId = action.id;
  addHistory(ctx.state, 'pending_action', action.id, action.summary);
  return { status: 'awaiting_confirm', messages: [{ role: 'ai', text: '请核对下面的信息，确认后我再为您办理。', card: { kind: 'confirm', pendingAction: action } }] };
}
