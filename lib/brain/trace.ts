import { randomUUID } from 'node:crypto';
import { appendTrace, getConversation, getMessage, listMessages } from '../store/conversations';
import { updateConversation } from '../store/conversations';
import type { ChatMessage, DecideResult, IntentId, Layer, RouteTrace } from '../types';
import { INTENTS } from './decide/questions';
import type { HandlerMetrics } from './handlers/context';
import type { RiskResult } from './risk';
export function makeTrace(message: ChatMessage, layer: Layer, started: number, intent?: IntentId): RouteTrace {
  return { id: `TR-${randomUUID()}`, conversationId: message.conversationId, messageId: message.id, at: message.createdAt, layer, intent,
    stage: INTENTS.find(i => i.id === intent)?.stage ?? 'other', toolCalls: [], usedGeneration: false,
    latency: { totalMs: Date.now() - started }, cost: { decideUsd: 0, generationUsd: 0, agentUsd: 0, totalUsd: 0 } };
}
export function withDecision(trace: RouteTrace, decision: DecideResult, risk: RiskResult): RouteTrace {
  return { ...trace, decideProvider: decision.provider, multiStep: decision.multiStep,
    topIntents: Object.entries(decision.intent.probabilities).map(([id, p]) => ({ id: id as IntentId, p: p! })).sort((a, b) => b.p - a.p).slice(0, 3),
    confidence: trace.layer === 'L1' ? trace.confidence : decision.intent.confidence,
    riskScores: risk.scores, riskHit: risk.hits,
    latency: { ...trace.latency, decideMs: decision.latencyMs },
    cost: { ...trace.cost, decideUsd: decision.costUsd, totalUsd: decision.costUsd + trace.cost.generationUsd + trace.cost.agentUsd, estimated: trace.cost.estimated || Boolean(decision.error) },
  };
}
export function withHandler(trace: RouteTrace, metrics: HandlerMetrics, handlerMs: number, totalMs: number): RouteTrace {
  return { ...trace, toolCalls: metrics.toolCalls, usedGeneration: metrics.usedGeneration, ragHits: metrics.ragHits,
    latency: { ...trace.latency, totalMs, ...(trace.layer === 'L3' ? { agentMs: handlerMs } : { handlerMs }) },
    cost: { ...trace.cost, generationUsd: metrics.generationUsd, agentUsd: metrics.agentUsd, totalUsd: trace.cost.decideUsd + metrics.generationUsd + metrics.agentUsd, estimated: trace.cost.estimated || metrics.estimated } };
}
export function originStillExists(message: ChatMessage): boolean {
  const fresh = getMessage(message.id);
  return fresh?.createdAt === message.createdAt && fresh.text === message.text;
}
export function persistTrace(trace: RouteTrace): RouteTrace {
  const current = getConversation(trace.conversationId);
  const newerBuyer = listMessages(trace.conversationId).filter(m => m.role === 'buyer').at(-1);
  const stored = appendTrace(trace);
  // A slow background result must not replace the layer of a newer turn.
  if (newerBuyer && newerBuyer.id !== trace.messageId && current) updateConversation(current.id, { lastLayer: current.lastLayer });
  return stored;
}
