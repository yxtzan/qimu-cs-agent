/**
 * Yellow zone handling (D011 §4, T08).
 *
 * A turn is "yellow" when a risk score is above the flag line but below the handoff line
 * (four risk items 0.5–threshold; emotion 1.5–2.5), or a keyword hit was overruled by a real model.
 * For such turns answered by L2 / L3 we:
 *   1. put one fixed reassurance line (no model call) before the first AI message,
 *   2. make sure a "转人工" quick reply is available,
 *   3. hand off when the previous buyer message in the same conversation was yellow too.
 */
import { listMessages, listTraces } from '../store/conversations';
import type { ChatMessage, RiskKey } from '../types';
import type { HandlerResult } from './handlers/context';
import { yellowKeys, type RiskResult } from './risk';

export const CONSECUTIVE_YELLOW_REASON = '连续两轮情绪或风险偏高';
// Fixed templates; the order below is also the priority when several items are yellow at once.
const CAUTION_PRIORITY: RiskKey[] = ['health_safety', 'fraud_security', 'legal_threat', 'abuse_extreme', 'emotion'];
export const CAUTION_TEXT: Record<RiskKey, string> = {
  health_safety: '您的使用安全我们很重视。如果有任何不适，请先停止使用，必要时及时就医。',
  fraud_security: '账户和资金安全我们很重视，请先不要向任何人透露验证码或密码。',
  legal_threat: '您的反馈我们很重视，如有需要会认真核实，并给您明确的答复。',
  abuse_extreme: '我理解您现在心情不好，我们会尽力帮您把问题解决。',
  emotion: '非常抱歉给您带来不好的体验，我理解您的着急，会尽快帮您处理。',
};
const humanReply = { label: '转人工', action: { type: 'quick_action' as const, name: 'human' as const } };

export function cautionText(keys: RiskKey[]): string | undefined {
  const key = CAUTION_PRIORITY.find(k => keys.includes(k));
  return key ? CAUTION_TEXT[key] : undefined;
}

/** Yellow items of the buyer message right before `current`, computed with the same thresholds from its trace. */
export function previousYellow(conversationId: string, current: ChatMessage): RiskKey[] {
  const all = listMessages(conversationId);
  const index = all.findIndex(m => m.id === current.id);
  const previous = all.slice(0, index < 0 ? all.length : index).filter(m => m.role === 'buyer').at(-1);
  if (!previous) return [];
  const trace = listTraces({ conversationId }).filter(t => t.messageId === previous.id).at(-1);
  return yellowKeys(trace?.riskScores);
}

function withHumanReply(messages: HandlerResult['messages']): HandlerResult['messages'] {
  if (messages.some(m => m.quickReplies?.some(q => q.action.type === 'quick_action' && q.action.name === 'human'))) return messages;
  const last = messages.length - 1;
  return messages.map((m, i) => (i === last ? { ...m, quickReplies: [...(m.quickReplies ?? []), humanReply] } : m));
}

/**
 * Call once per L2 / L3 turn, after the handler returned and before its messages are stored.
 * Never called for L1. Does nothing when the turn is not yellow or the handler already wants a handoff.
 */
export function applyCaution(input: { conversationId: string; buyer: ChatMessage; risk: RiskResult; result: HandlerResult }): HandlerResult {
  const { conversationId, buyer, risk, result } = input;
  const yellow = risk.flags.filter(k => !risk.hits.includes(k));
  if (!yellow.length || risk.handoff || result.handoffReason) return result;
  if (previousYellow(conversationId, buyer).length) return { ...result, handoffReason: CONSECUTIVE_YELLOW_REASON };
  const text = cautionText(yellow);
  if (!text) return result;
  return { ...result, messages: [{ role: 'ai', text }, ...withHumanReply(result.messages)] };
}
