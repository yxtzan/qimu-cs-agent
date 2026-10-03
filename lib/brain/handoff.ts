import { nowIso } from '../demo-clock';
import { getBuyer } from '../store/collections';
import { getConversation, updateConversation } from '../store/conversations';
import type { NewMessage } from '../store/conversations';
import type { RiskKey } from '../types';
import { addHistory } from './state';

export function enterHandoff(conversationId: string, reason: string, flags: RiskKey[] = []): NewMessage[] {
  const current = getConversation(conversationId);
  if (!current || current.status === 'closed' || current.mode === 'human') return [];
  const state = structuredClone(current.state);
  state.riskFlags = [...new Set([...state.riskFlags, ...flags])];
  addHistory(state, 'handoff', reason, `转人工：${reason}`);
  updateConversation(conversationId, {
    mode: 'human', status: 'waiting_human', handoffAt: nowIso(), handoffReason: reason,
    handoffSummary: `买家${getBuyer(current.buyerId)?.nickname ?? current.buyerId}，${state.lastIntent ?? '待核实需求'}，${reason}`,
    unreadForSeller: current.unreadForSeller + 1,
    riskFlags: [...new Set([...current.riskFlags, ...flags])], state,
  });
  return [{ role: 'system', text: '我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。' }];
}
