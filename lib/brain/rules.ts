import { nowIso } from '../demo-clock';
import { listRules, updateRule } from '../store/collections';
import { incrementMisfire } from '../rules';
import { getConversation, isMisfireMarked, listMessages, listTraces, markMisfire } from '../store/conversations';
import type { ChatAction, IntentId } from '../types';
export const quickIntents: Record<string, IntentId> = { track_logistics: 'logistics_track', refund_progress: 'refund_progress', size_recommend: 'size_recommend', human: 'human_request' };
export const quickLabels: Record<string, string> = { track_logistics: '查物流', refund_progress: '退款进度', size_recommend: '尺码推荐', human: '转人工' };
export interface RuleMatch { intent: IntentId; confidence: number; ruleId?: string }
export function matchRule(text: string, action?: ChatAction): RuleMatch | undefined {
  if (action?.type === 'quick_action') return { intent: quickIntents[action.name], confidence: 1 };
  for (const rule of listRules()) {
    if (!rule.enabled || Array.from(text).length > rule.maxLen) continue;
    try {
      if (new RegExp(rule.pattern, 'i').test(text.trim())) return { intent: rule.intent, confidence: 1, ruleId: rule.id };
    } catch { /* Ignore an invalid stored pattern without stopping chat. */ }
  }
}
export function recordRuleHit(match?: RuleMatch): void {
  if (!match?.ruleId) return;
  const rule = listRules().find(r => r.id === match.ruleId);
  if (rule) updateRule(rule.id, { hitCount: rule.hitCount + 1, lastHitAt: nowIso() });
}
export function recordNegativeFeedback(conversationId: string, text: string): void {
  if (!/^(不是|不对|答非所问|我问的是)/.test(text.trim())) return;
  const messages = listMessages(conversationId);
  const previousBuyer = messages.filter(m => m.role === 'buyer').at(-1);
  const last = listTraces({ conversationId }).find(t => t.messageId === previousBuyer?.id);
  const conversation = getConversation(conversationId);
  const lastIntent = conversation?.state.history.filter(h => h.type === 'intent').at(-1);
  const earlyRuleId = /^L1 (R\d+)：/.exec(lastIntent?.summary ?? '')?.[1];
  const traceId = last?.id ?? messages.filter(m => m.traceId).at(-1)?.traceId;
  const ruleId = last?.layer === 'L1' ? last.ruleId : !last && conversation?.lastLayer === 'L1' ? earlyRuleId : undefined;
  if (ruleId && traceId && !isMisfireMarked(traceId)) {
    incrementMisfire(ruleId);
    markMisfire(traceId);
  }
}
