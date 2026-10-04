import type { DialogState, PendingAction } from '../../types';
import { refundOnlyBlockedMessage } from '../../tools/write-rules';
import { addHistory } from '../state';
import type { HandlerContext, HandlerResult } from './context';
import { ask } from './context';
import { isReply, resolveItem, resolveOrder } from './resolve';

const REFUND_ONLY_WISH = /仅退款|只退款|不用退货|不想寄回|只退钱|不退货/;
const SWITCH_TO_RETURN = /改为退货退款/;
const WISH_MARK = 'wants_refund_only';

function remembersRefundOnly(state: DialogState): boolean {
  return state.history.some((item) => item.name === WISH_MARK);
}
function rememberRefundOnly(state: DialogState): void {
  if (!remembersRefundOnly(state)) addHistory(state, 'intent', WISH_MARK, '买家想仅退款');
}
function forgetRefundOnly(state: DialogState): void {
  if (remembersRefundOnly(state)) state.history = state.history.filter((item) => item.name !== WISH_MARK);
}
/** 去掉「仅退款」说法和客套后，还剩至少两个字，才当成买家已经给了原因。 */
function hasConcreteReason(text: string): boolean {
  const rest = text
    .replace(/仅退款|只退款|不用退货|不想寄回|只退钱|不退货/g, '')
    .replace(/帮我|请你|请|我想|我要|希望|申请|办理|一下|退款|退货|这单|这件|这个/g, '')
    .replace(/[，,。！!？?\s、~～]/g, '');
  return [...rest].length >= 2;
}
function refuseRefundOnly(status: 'shipped' | 'delivered' | 'completed'): HandlerResult {
  return {
    status: 'done',
    messages: [{
      role: 'ai',
      text: refundOnlyBlockedMessage(status),
      quickReplies: [
        { label: '改为退货退款', action: { type: 'text', text: '改为退货退款' } },
        { label: '转人工', action: { type: 'quick_action', name: 'human' } },
      ],
    }],
  };
}

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
      const switching = SWITCH_TO_RETURN.test(ctx.text);
      if (switching) forgetRefundOnly(ctx.state);
      const phrase = REFUND_ONLY_WISH.test(ctx.text);
      const followUp = !switching && remembersRefundOnly(ctx.state) && ctx.state.currentTask?.status === 'collecting' && ctx.state.currentTask.intent === 'refund_apply';
      const wantsOnly = !switching && (phrase || followUp);
      if (wantsOnly && !ctx.state.slots.reason && hasConcreteReason(ctx.text)) ctx.state.slots.reason = ctx.text.trim();
      const reason = ctx.state.slots.reason;
      if (!reason) {
        if (phrase) rememberRefundOnly(ctx.state);
        return ask('可以的，请告诉我退款或退货原因，我先帮您核实是否符合申请条件。');
      }
      args.reason = reason;
      if (wantsOnly) {
        rememberRefundOnly(ctx.state);
        if (order.status === 'paid') args.type = 'refund_only';
        else if (order.status === 'shipped' || order.status === 'delivered' || order.status === 'completed') return refuseRefundOnly(order.status);
        else args.type = 'refund_only';
      } else args.type = ['paid', 'pending_payment'].includes(order.status) ? 'refund_only' : 'return_refund';
    }
  }
  const action = await ctx.call<PendingAction>(tool, args);
  ctx.state.pendingActionId = action.id;
  addHistory(ctx.state, 'pending_action', action.id, action.summary);
  return { status: 'awaiting_confirm', messages: [{ role: 'ai', text: '请核对下面的信息，确认后我再为您办理。', card: { kind: 'confirm', pendingAction: action } }] };
}
