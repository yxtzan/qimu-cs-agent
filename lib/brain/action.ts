import { cancelPendingAction, confirmPendingAction, getPendingAction } from '../tools/execute-pending';
import type { ChatAction, DialogState } from '../types';
import type { ToolContext } from '../tools/types';
import { addHistory } from './state';
import type { HandlerResult } from './handlers/context';
export interface ConfirmationResult extends HandlerResult { ok: boolean }
export function handleConfirmation(action: Extract<ChatAction, { type: 'confirm' }>, ctx: ToolContext, state: DialogState): ConfirmationResult {
  const result = action.confirm ? confirmPendingAction(action.pendingActionId, ctx) : cancelPendingAction(action.pendingActionId, ctx);
  const pending = getPendingAction(action.pendingActionId);
  const scoped = pending?.conversationId === ctx.conversationId && pending.args.buyerId === ctx.buyerId;
  if (scoped && pending.status !== 'pending' && state.pendingActionId === pending.id) {
    delete state.pendingActionId;
    if (state.currentTask) state.currentTask.status = 'done';
  }
  addHistory(state, action.confirm ? 'confirm' : 'cancel', action.pendingActionId, result.ok ? result.data.pendingAction.result ?? '操作已处理' : result.reason);
  if (!result.ok) return { ok: false, status: scoped && pending?.status === 'pending' ? 'awaiting_confirm' : 'done', messages: [{ role: 'ai', text: result.reason }] };
  const { pendingAction, card } = result.data;
  return { ok: true, status: 'done', messages: [{ role: 'ai', text: card?.kind === 'aftersale' ? `${pendingAction.result}。售后单号 ${card.afterSale.id}。` : pendingAction.result ?? '操作已处理', ...(card ? { card } : {}) }] };
}
