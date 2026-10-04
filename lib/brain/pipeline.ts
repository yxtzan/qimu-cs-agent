import { nowIso } from '../demo-clock';
import { appendMessages, createConversation, getConversation, listMessages, updateConversation } from '../store/conversations';
import type { ChatMessage, Conversation, DecideResult, IntentId, RouteTrace } from '../types';
import { decide, decideWithMock } from './decide';
import { INTENTS } from './decide/questions';
import { noteJevActivity } from './decide/warmup';
import { describeInput, parseChatRequest, validateIdentity, type ChatRequest } from './input';
import { addHistory, serializeStateForModel, updateState } from './state';
import { checkRisk, waitForKeywordDecision, type RiskResult } from './risk';
import { applyCaution } from './caution';
import { matchRule, recordNegativeFeedback, recordRuleHit } from './rules';
import { createHandlerContext, type HandlerResult } from './handlers/context';
import { isSizeCareCombination, runHandler } from './handlers';
import { runAgent } from './agent';
import { handleConfirmation } from './action';
import { enterHandoff } from './handoff';
import { makeTrace, originStillExists, persistTrace, recordLateDecisionCost, withDecision, withHandler } from './trace';
import { scheduleBackground, serializeConversation, type Schedule } from './background';

export interface ChatResponse { conversation: Conversation; messages: ChatMessage[]; trace?: RouteTrace }
export interface PipelineOptions { decide?: typeof decide; schedule?: Schedule }
const riskReason = (risk: RiskResult) => `风险闸门：${risk.hits.map(k => `${k} ${risk.scores[k].toFixed(2)}`).join('；')}`;
function response(id: string, buyer: ChatMessage, debug: boolean | undefined, trace: RouteTrace): ChatResponse {
  return { conversation: getConversation(id)!, messages: [buyer, ...listMessages(id, { after: buyer.id })], ...(debug ? { trace } : {}) };
}
function mergeRiskFlags(id: string, risk: RiskResult): void {
  const current = getConversation(id);
  if (!current) return;
  const flags = [...new Set([...current.riskFlags, ...risk.flags])];
  updateConversation(id, { riskFlags: flags, state: { ...current.state, riskFlags: [...new Set([...current.state.riskFlags, ...risk.flags])] } });
}
function continueIntent(request: ChatRequest, state: Conversation['state'], classified: IntentId): IntentId {
  const task = state.currentTask;
  if (request.action?.type === 'select_option' && task) return task.intent;
  if (task?.status === 'collecting' && task.intent !== 'other' && task.intent !== 'multi_step_complex' && classified === 'other') return task.intent;
  return classified;
}
function threshold(): number {
  const n = Number(process.env.L2_CONFIDENCE_THRESHOLD ?? 0.7);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.7;
}

export async function handleMessage(input: unknown, options: PipelineOptions = {}): Promise<ChatResponse> {
  const request = parseChatRequest(input);
  const existing = validateIdentity(request);
  const conversation = existing ?? createConversation(request.buyerId);
  return serializeConversation(conversation.id, () => processMessage(request, conversation.id, options));
}
async function processMessage(request: ChatRequest, id: string, options: PipelineOptions): Promise<ChatResponse> {
  const started = Date.now();
  const conversation = getConversation(id)!;
  const { text, selected } = describeInput(request, conversation);
  const toolContext = { buyerId: request.buyerId, conversationId: id };
  const schedule = options.schedule ?? scheduleBackground;

  // ① Update deterministic state and record every buyer input, including actions.
  const state = updateState(conversation, text, request.context, selected);
  if (conversation.status === 'closed') updateConversation(id, { status: 'ai_active', mode: 'ai' });
  updateConversation(id, { state });
  recordNegativeFeedback(id, text);
  const buyer = appendMessages(id, [{ role: 'buyer', text }])[0];
  if (conversation.mode === 'human') {
    const trace = persistTrace(makeTrace(buyer, 'human', started));
    return response(id, buyer, request.debug, trace);
  }

  // ② Start decide and ③ synchronously match L1 in parallel (never await here).
  noteJevActivity();
  const decideStarted = Date.now();
  const decisionPromise = (options.decide ?? decide)(serializeStateForModel(getConversation(id)!, listMessages(id)), text).catch(() => ({ ...decideWithMock(text), error: '分类器异常，已降级到 mock' })).then(result => ({ ...result, latencyMs: Date.now() - decideStarted }));
  const rule = matchRule(text, request.action);

  // ④a Hard risks cover every input, including L1 and confirmation buttons.
  let hardRisk = checkRisk(text);
  let earlyDecision: DecideResult | undefined;
  if (hardRisk.handoff) {
    // D011: a keyword alone transfers only if the real model does not clearly deny it (< 0.3).
    // Only keyword arbitration waits up to KEYWORD_RISK_WAIT_MS; mock / timeout keeps the keyword verdict.
    earlyDecision = await waitForKeywordDecision(decisionPromise);
    hardRisk = checkRisk(text, earlyDecision);
  }
  if (hardRisk.handoff) {
    mergeRiskFlags(id, hardRisk);
    let trace: RouteTrace = { ...makeTrace(buyer, 'risk_gate', started, rule?.intent ?? earlyDecision?.intent.id), handoffReason: riskReason(hardRisk), riskScores: hardRisk.scores, riskHit: hardRisk.hits };
    if (earlyDecision) trace = withDecision(trace, earlyDecision, hardRisk);
    else {
      trace.handoffReason += '；关键词分类等待超时（decideProvider 缺失）';
      trace.cost.estimated = true;
    }
    appendMessages(id, (await handoffMessages(trace, id, trace.handoffReason!, hardRisk.flags)).map(m => ({ ...m, traceId: trace.id })));
    trace.latency.totalMs = Date.now() - started;
    persistTrace(trace);
    if (!earlyDecision) schedule(async () => recordLateDecisionCost(buyer, await decisionPromise));
    return response(id, buyer, request.debug, trace);
  }
  if (earlyDecision) mergeRiskFlags(id, hardRisk);

  // Confirmation is a deterministic action, not a fresh intent classification.
  if (request.action?.type === 'confirm') {
    // Model-only risk must also be checked before an irreversible confirmed write.
    const decision = await decisionPromise;
    const risk = checkRisk(text, decision);
    mergeRiskFlags(id, risk);
    if (risk.handoff) {
      const trace = withDecision({ ...makeTrace(buyer, 'risk_gate', started), handoffReason: riskReason(risk) }, decision, risk);
      appendMessages(id, (await handoffMessages(trace, id, riskReason(risk), risk.flags)).map(m => ({ ...m, traceId: trace.id })));
      trace.latency.totalMs = Date.now() - started;
      persistTrace(trace);
      return response(id, buyer, request.debug, trace);
    }
    const actionStart = Date.now();
    if (getConversation(id)?.mode === 'human') return forwardedResponse(id, buyer, request.debug, started, decision, risk);
    const result = handleConfirmation(request.action, toolContext, state);
    state.riskFlags = getConversation(id)!.state.riskFlags;
    updateConversation(id, { state });
    const trace = withDecision(makeTrace(buyer, 'action', started, state.lastIntent), decision, risk);
    trace.toolCalls = [{ name: request.action.confirm ? 'confirm_pending_action' : 'cancel_pending_action', ok: result.ok, ms: Date.now() - actionStart }];
    trace.latency.totalMs = Date.now() - started;
    persistTrace(trace);
    appendMessages(id, result.messages.map(m => ({ ...m, traceId: trace.id })));
    return response(id, buyer, request.debug, trace);
  }

  // ⑤ L1 replies without waiting; model risk and final trace finish in background.
  let decision: DecideResult | undefined;
  let intent: IntentId;
  let layer: 'L1' | 'L2' | 'L3';
  if (rule) {
    decision = earlyDecision; // only set when a keyword made us wait for decide()
    recordRuleHit(rule);
    intent = rule.intent;
    layer = 'L1';
  } else {
    decision = await decisionPromise;
    // ④b For non-L1 turns, the full risk gate runs before any handler.
    const risk = checkRisk(text, decision);
    mergeRiskFlags(id, risk);
    if (risk.handoff) {
      const trace = withDecision({ ...makeTrace(buyer, 'risk_gate', started, decision.intent.id), handoffReason: riskReason(risk) }, decision, risk);
      appendMessages(id, (await handoffMessages(trace, id, riskReason(risk), risk.flags)).map(m => ({ ...m, traceId: trace.id })));
      trace.latency.totalMs = Date.now() - started;
      persistTrace(trace);
      return response(id, buyer, request.debug, trace);
    }
    if (getConversation(id)?.mode === 'human') return forwardedResponse(id, buyer, request.debug, started, decision, risk);
    // ⑥ Route a confident single intent to its handler; T04-1 is a finite read combo.
    const sizeCare = isSizeCareCombination({ state, text });
    intent = sizeCare ? 'size_recommend' : continueIntent(request, state, decision.intent.id);
    const continuation = intent !== decision.intent.id && !sizeCare;
    layer = sizeCare || continuation || (decision.intent.confidence >= threshold() && decision.multiStep < 0.5 && intent !== 'multi_step_complex') ? 'L2' : 'L3';
  }
  const ctx = createHandlerContext(toolContext, state, text, intent, request.action, started + 9000);
  const handlerStart = Date.now();
  // ⑦ Bounded L3 shares tools and confirmation with L2.
  let result: HandlerResult;
  try { result = layer === 'L3' ? await runAgent(ctx) : await runHandler(ctx); }
  catch { result = { status: 'collecting', messages: [{ role: 'ai', text: '抱歉，暂时无法完成查询，我帮您转人工核实。' }], handoffReason: '执行查询异常，需要人工核实' }; }
  if (getConversation(id)?.mode === 'human') return forwardedResponse(id, buyer, request.debug, started, decision, checkRisk(text, decision));
  applyHandlerState(id, state, intent, result, rule?.ruleId);
  if (layer !== 'L1' && decision) result = applyCaution({ conversationId: id, buyer, risk: checkRisk(text, decision), result }); // yellow zone (T08)
  let trace: RouteTrace = { ...makeTrace(buyer, layer, started, intent), ruleId: rule?.ruleId, confidence: layer === 'L1' ? 1 : decision?.intent.confidence };
  trace = withHandler(trace, ctx.metrics, Date.now() - handlerStart, Date.now() - started);
  const reason = result.handoffReason ?? (state.unresolvedTurns >= 2 ? '连续两轮未能解决，需要人工协助' : undefined);
  if (reason) { trace = { ...trace, layer: 'human', escalatedFrom: layer, handoffReason: reason }; }
  const outgoing = [...result.messages, ...(reason ? await handoffMessages(trace, id, reason) : [])];
  // ⑧ One trace per buyer message, and one shared traceId for all replies this turn.
  appendMessages(id, outgoing.map(m => ({ ...m, traceId: trace.id })));
  trace.latency.totalMs = Date.now() - started;
  if (decision) trace = persistTrace(withDecision(trace, decision, checkRisk(text, decision)));
  else {
    updateConversation(id, { lastLayer: trace.layer });
    schedule(() => finishEarlyTrace(trace, buyer, text, decisionPromise, started));
  }
  return response(id, buyer, request.debug, trace);
}

function applyHandlerState(id: string, state: Conversation['state'], intent: IntentId, result: HandlerResult, ruleId?: string): void {
  state.currentTask = { intent, status: result.status, startedAt: state.currentTask?.intent === intent ? state.currentTask.startedAt : nowIso() };
  addHistory(state, 'intent', intent, `${ruleId ? `L1 ${ruleId}：` : ''}${result.messages[0]?.text ?? '准备转人工'}`);
  state.lastIntent = intent;
  state.unresolvedTurns = result.unresolved ? state.unresolvedTurns + 1 : 0;
  const current = getConversation(id)!;
  state.riskFlags = [...new Set([...current.state.riskFlags, ...state.riskFlags])];
  updateConversation(id, { state, ...(result.quality ? { tags: [...new Set([...current.tags, 'quality'])] } : {}) });
}
async function finishEarlyTrace(trace: RouteTrace, buyer: ChatMessage, text: string, pending: Promise<DecideResult>, started: number): Promise<void> {
  const decision = await pending;
  if (!originStillExists(buyer)) return;
  const risk = checkRisk(text, decision);
  mergeRiskFlags(buyer.conversationId, risk);
  let final = withDecision(trace, decision, risk);
  if (!final.intent) final = { ...final, intent: decision.intent.id, stage: INTENTS.find(i => i.id === decision.intent.id)?.stage };
  if (risk.handoff && trace.layer !== 'risk_gate') {
    const reason = riskReason(risk);
    final = { ...final, layer: 'risk_gate', escalatedFrom: trace.layer, handoffReason: reason };
    appendMessages(buyer.conversationId, (await handoffMessages(final, buyer.conversationId, reason, risk.flags)).map(m => ({ ...m, traceId: trace.id })));
    // totalMs for an asynchronous escalation includes the classifier wait.
    final.latency.totalMs = Date.now() - started;
  }
  persistTrace(final);
}

function forwardedResponse(id: string, buyer: ChatMessage, debug: boolean | undefined, started: number, decision?: DecideResult, risk = checkRisk('')): ChatResponse {
  const current = getConversation(id)!;
  updateConversation(id, { unreadForSeller: current.unreadForSeller + 1 });
  let trace = makeTrace(buyer, 'human', started);
  if (decision) trace = withDecision(trace, decision, risk);
  persistTrace(trace);
  return response(id, buyer, debug, trace);
}

async function handoffMessages(trace: RouteTrace, id: string, reason: string, flags: import('../types').RiskKey[] = []) {
  return enterHandoff(id, reason, flags, result => {
    trace.usedGeneration = true;
    trace.cost.generationUsd += result.costUsd;
    trace.cost.totalUsd += result.costUsd;
    trace.cost.estimated ||= result.estimated;
  });
}
