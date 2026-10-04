import { nowIso } from '../demo-clock';
import { getBuyer } from '../store/collections';
import { getConversation, listMessages, updateConversation } from '../store/conversations';
import type { NewMessage } from '../store/conversations';
import type { RiskKey } from '../types';
import { addHistory } from './state';
import { chatCompletion, hasApiKey, type LlmResult, type ChatCompletionData } from '../llm/openrouter';
import { HANDOFF_SYSTEM_PROMPT } from './prompts/handoff';

const intentNames: Partial<Record<import('../types').IntentId, string>> = { product_consult: '商品咨询', size_recommend: '尺码推荐', stock_check: '库存咨询', promotion: '优惠咨询', shipping_policy: '发货政策', order_status: '订单查询', logistics_track: '物流查询', urge_shipping: '催发货', modify_order: '修改订单', cancel_order: '取消订单', refund_apply: '退款申请', refund_progress: '退款进度', exchange: '换货申请', quality_issue: '质量问题', return_policy: '退换政策', invoice: '发票咨询', human_request: '请求人工', greeting: '问候', multi_step_complex: '多步需求', other: '待核实需求' };

export async function enterHandoff(conversationId: string, reason: string, flags: RiskKey[] = [], onUsage?: (result: LlmResult<ChatCompletionData>) => void): Promise<NewMessage[]> {
  const current = getConversation(conversationId);
  if (!current || current.status === 'closed' || current.mode === 'human') return [];
  const state = structuredClone(current.state);
  state.riskFlags = [...new Set([...state.riskFlags, ...flags])];
  addHistory(state, 'handoff', reason, `转人工：${reason}`);
  updateConversation(conversationId, {
    mode: 'human', status: 'waiting_human', handoffAt: nowIso(), handoffReason: reason,
    handoffSummary: `买家${getBuyer(current.buyerId)?.nickname ?? current.buyerId}，${state.lastIntent ? intentNames[state.lastIntent] : '待核实需求'}，${reason}`,
    unreadForSeller: current.unreadForSeller + 1,
    riskFlags: [...new Set([...current.riskFlags, ...flags])], state,
  });
  const handoffAt = getConversation(conversationId)?.handoffAt;
  if (hasApiKey() && process.env.CLASSIFIER_PROVIDER !== 'mock') {
    try {
      const result = await chatCompletion({ model: process.env.GENERATION_MODEL, timeoutMs: 2500, maxTokens: 160, temperature: 0, reasoning: { enabled: false },
        messages: [{ role: 'system', content: HANDOFF_SYSTEM_PROMPT }, { role: 'user', content: JSON.stringify({ 昵称: getBuyer(current.buyerId)?.nickname, 需求: state.lastIntent ? intentNames[state.lastIntent] : '待核实需求', 原因: reason, 最近对话: listMessages(conversationId).slice(-12).map(m => ({ role: m.role, text: m.text })) }) }],
      });
      onUsage?.(result);
      const fresh = getConversation(conversationId);
      // A seller release/reset during generation must not overwrite a new state.
      if (fresh?.mode === 'human' && fresh.handoffAt === handoffAt && result.data.finishReason === 'stop' && result.data.content.trim()) updateConversation(conversationId, { handoffSummary: result.data.content.trim().replace(/\s+/g, ' ').slice(0, 100) });
    } catch { /* The persisted template remains usable on timeout or failure. */ }
  }
  return [{ role: 'system', text: '我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。' }];
}
