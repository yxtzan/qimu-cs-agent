import { nowIso } from '../demo-clock';
import { getBuyer } from '../store/collections';
import { getConversation, getMessage, listMessages, listTraces, updateConversation } from '../store/conversations';
import type { NewMessage } from '../store/conversations';
import type { RiskKey, RouteTrace } from '../types';
import { readCollection, writeCollection } from '../store';
import { registerResetHook } from '../store/reset';
import { addHistory } from './state';
import { chatCompletion, hasApiKey, type LlmResult, type ChatCompletionData } from '../llm/openrouter';
import { HANDOFF_SYSTEM_PROMPT } from './prompts/handoff';
import { scheduleBackground } from './background';

const globalState = globalThis as unknown as { __qimuHandoffSummaries?: { epoch: number; tokens: Map<string, symbol> } };
const summaries = globalState.__qimuHandoffSummaries ??= { epoch: 0, tokens: new Map<string, symbol>() };
registerResetHook('handoff-summary', () => { summaries.epoch++; summaries.tokens.clear(); });

// Snapshot costs before the callback: a pending trace can share its cost object
// with the store. Replace matching rows in place; never append a second trace.
function recordUsage(conversationId: string, messageId: string | undefined, result: LlmResult<ChatCompletionData>, onUsage?: (result: LlmResult<ChatCompletionData>) => void): void {
  const costs = new Map(listTraces({ conversationId }).filter(t => t.messageId === messageId).map(t => [t.id, { ...t.cost }]));
  onUsage?.(result);
  if (!costs.size) return; // The callback updates the trace awaiting decide().
  const all = readCollection<RouteTrace>('traces');
  writeCollection('traces', all.map(t => {
    const before = costs.get(t.id);
    return before ? { ...t, usedGeneration: true, cost: { ...t.cost,
      generationUsd: before.generationUsd + result.costUsd,
      totalUsd: before.totalUsd + result.costUsd,
      estimated: before.estimated || result.estimated,
    } } : t;
  }));
}

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
    const recent = listMessages(conversationId).slice(-12);
    const origin = recent.filter(m => m.role === 'buyer').at(-1);
    const epoch = summaries.epoch;
    const key = `${process.cwd()}:${conversationId}`;
    const token = Symbol();
    summaries.tokens.set(key, token);
    const input = JSON.stringify({ 昵称: getBuyer(current.buyerId)?.nickname, 需求: state.lastIntent ? intentNames[state.lastIntent] : '待核实需求', 原因: reason, 最近对话: recent.map(m => ({ role: m.role, text: m.text })) });
    scheduleBackground(async () => {
      const started = Date.now();
      try {
        const result = await chatCompletion({ model: process.env.GENERATION_MODEL, maxTokens: 160, temperature: 0, reasoning: { enabled: false },
          messages: [{ role: 'system', content: HANDOFF_SYSTEM_PROMPT }, { role: 'user', content: input }],
        });
        const message = origin ? getMessage(origin.id) : undefined;
        const originExists = !origin || (message?.createdAt === origin.createdAt && message.text === origin.text);
        // A reset can reuse deterministic conversation/message IDs and demo time.
        if (summaries.epoch === epoch && originExists) {
          try { recordUsage(conversationId, origin?.id, result, onUsage); }
          catch (error) { console.error('[handoff-summary-usage]', { error: error instanceof Error ? error.name : 'UnknownError', costUsd: result.costUsd }); }
          const fresh = getConversation(conversationId);
          // Release, close or a subsequent handoff must keep its newer summary.
          if (summaries.tokens.get(key) === token && fresh?.mode === 'human' && fresh.status !== 'closed' && fresh.handoffAt === handoffAt && result.data.finishReason === 'stop' && result.data.content.trim()) {
            updateConversation(conversationId, { handoffSummary: result.data.content.trim().replace(/\s+/g, ' ').slice(0, 100) });
          }
        }
        console.info('[handoff-summary]', { latencyMs: result.latencyMs, costUsd: result.costUsd, estimated: result.estimated });
      } catch (error) {
        console.info('[handoff-summary]', { latencyMs: Date.now() - started, error: error instanceof Error ? error.name : 'UnknownError' });
        // The persisted template remains usable on timeout or failure.
      } finally { if (summaries.tokens.get(key) === token) summaries.tokens.delete(key); }
    });
  }
  return [{ role: 'system', text: '我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。' }];
}
