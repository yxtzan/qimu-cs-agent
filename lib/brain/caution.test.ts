/**
 * T08 end-to-end checks of the new edge-case rules, driven through the real pipeline with a stubbed
 * decide() so the verdicts are deterministic (no network, no model quality involved).
 * Uses a temporary copy of data/seed so the working data/runtime is untouched.
 */
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { clearStoreCache } from '../store';
import { getConversation, listTraces } from '../store/conversations';
import type { ChatAction, DecideResult, IntentId, RiskKey } from '../types';
import { drainBackgroundTasks } from './background';
import { CAUTION_TEXT, CONSECUTIVE_YELLOW_REASON } from './caution';
import { decideWithMock } from './decide/mock';
import { handleMessage, type ChatResponse } from './pipeline';

const originalCwd = process.cwd();
const temp = mkdtempSync(join(tmpdir(), 'qimu-t08-'));
cpSync(join(originalCwd, 'data/seed'), join(temp, 'data/seed'), { recursive: true });
process.chdir(temp); clearStoreCache();
process.env.OPENROUTER_API_KEY = ''; process.env.CLASSIFIER_PROVIDER = 'mock'; process.env.JEV_KEEPALIVE_MS = '0';
after(() => { process.chdir(originalCwd); rmSync(temp, { recursive: true, force: true }); });

interface Fake { provider?: DecideResult['provider']; confidence?: number; multiStep?: number; emotion?: number; risk?: Partial<Record<Exclude<RiskKey, 'emotion'>, number>> }
function fake(intent: IntentId, o: Fake = {}): DecideResult {
  const base = decideWithMock('你好');
  const confidence = o.confidence ?? 0.9;
  return { ...base, provider: o.provider ?? 'jev', intent: { id: intent, confidence, probabilities: { [intent]: confidence } }, multiStep: o.multiStep ?? 0.05,
    risk: { ...base.risk, ...o.risk, emotion: { score: o.emotion ?? 0, confidence: 0.9 } }, latencyMs: 5, costUsd: 0.00006 };
}
async function send(buyerId: string, text: string | undefined, decision: DecideResult, extra: { conversationId?: string; context?: { orderId?: string; productId?: string }; action?: ChatAction } = {}): Promise<ChatResponse> {
  const response = await handleMessage({ buyerId, ...(text ? { text } : {}), ...extra, debug: true }, { decide: async () => decision });
  await drainBackgroundTasks();
  return response;
}
const aiTexts = (r: ChatResponse) => r.messages.filter(m => m.role === 'ai').map(m => m.text);
const labels = (r: ChatResponse) => r.messages.flatMap(m => m.quickReplies ?? []).map(q => q.label);

test('E40: signed within 7 days → apologise and offer options, no automatic handoff', async () => {
  const r = await send('B001', '有点小失望，外套比图片颜色深一点', fake('quality_issue', { confidence: 1 }), { context: { orderId: 'QM2026092801' } });
  assert.equal(r.trace!.layer, 'L2'); assert.equal(r.conversation.mode, 'ai');
  assert.match(aiTexts(r).join(''), /7 天无理由/);
  assert.match(aiTexts(r).join(''), /金卡/);
  assert.deepEqual(labels(r), ['换个颜色', '申请退货', '是质量问题，转人工']);
  assert.equal(r.trace!.multiStep, 0.05, 'multiStep is written into the trace');
});
test('quality issue past 7 days: over ¥500 still goes to a human; the rule is by order state, not by wording', async () => {
  const over = await send('B008', '衣服有点问题', fake('quality_issue'), { context: { orderId: 'QM2026092541' } }); // signed 7.1 days ago, ¥757
  assert.equal(over.trace!.layer, 'human'); assert.equal(over.trace!.escalatedFrom, 'L2'); assert.equal(over.conversation.mode, 'human');
  const same = await send('B008', '有点小失望，外套比图片颜色深一点', fake('quality_issue'), { context: { orderId: 'QM2026092541' } });
  assert.equal(same.trace!.layer, 'human', 'same sentence, different order state → different outcome');
  const inside = await send('B008', '衣服有点问题', fake('quality_issue'), { context: { orderId: 'QM2026093050' } }); // 2.2 days ago, ¥528
  assert.equal(inside.trace!.layer, 'L2'); assert.equal(inside.conversation.mode, 'ai');
  assert.match(aiTexts(inside).join(''), /7 天无理由/);
});
test('E59: size beyond the chart → state the chart limit, offer a button, transfer only when clicked', async () => {
  const r = await send('B004', '身高185体重90kg有合适的吗', fake('size_recommend'));
  assert.equal(r.trace!.layer, 'L2'); assert.equal(r.conversation.mode, 'ai'); assert.equal(r.trace!.handoffReason, undefined);
  assert.match(aiTexts(r).join(''), /XL/); assert.match(aiTexts(r).join(''), /175cm/); assert.match(aiTexts(r).join(''), /70kg/);
  assert.deepEqual(labels(r), ['转人工']);
  const clicked = await handleMessage({ buyerId: 'B004', conversationId: r.conversation.id, action: { type: 'quick_action', name: 'human' }, debug: true });
  await drainBackgroundTasks();
  assert.equal(clicked.conversation.mode, 'human');
});

test('keyword hit + real model clearly denies (< 0.3) → no handoff, yellow flag + reassurance + 转人工 button', async () => {
  for (const provider of ['jev', 'llm'] as const) {
    const r = await send('B001', '我闺蜜是律师，她说这件挺好看', fake('other', { provider, risk: { legal_threat: 0.05 } }));
    assert.equal(r.trace!.layer, 'L2', provider); assert.equal(r.conversation.mode, 'ai');
    assert.deepEqual(r.trace!.riskHit, []); assert.equal(r.trace!.riskScores!.legal_threat, 1);
    assert.equal(aiTexts(r)[0], CAUTION_TEXT.legal_threat); assert(labels(r).includes('转人工'));
  }
});
test('keyword hit is kept when the model is unsure, unavailable, or mock; real threats still go to risk_gate', async () => {
  const unsure = await send('B001', '我闺蜜是律师', fake('other', { risk: { legal_threat: 0.3 } }));
  assert.equal(unsure.trace!.layer, 'risk_gate'); assert.equal(unsure.conversation.mode, 'human');
  const mock = await send('B001', '我闺蜜是律师', fake('other', { provider: 'mock' }));
  assert.equal(mock.trace!.layer, 'risk_gate');
  const real = await send('B002', '穿了全身起红疹 不处理就去12315', fake('quality_issue', { risk: { health_safety: 0.95, legal_threat: 0.9 } }));
  assert.equal(real.trace!.layer, 'risk_gate'); assert.equal(real.conversation.mode, 'human');
  assert.equal(real.trace!.decideProvider, 'jev', 'the gate now records the decide result it waited for');
});
test('B001 with a product page: 「防过敏面料吗」 is a question, not a health complaint', async () => {
  const r = await send('B001', '这件是防过敏面料吗', fake('other', { risk: { health_safety: 0.1 } }), { context: { productId: 'P013' } });
  assert.equal(r.conversation.mode, 'ai'); assert.notEqual(r.trace!.layer, 'risk_gate');
});
test('L1 + keyword waits for decide and is downgraded too; L1 without a keyword never waits', async () => {
  const r = await send('B001', '退款进度 律师', fake('other', { risk: { legal_threat: 0.05 } }));
  assert.equal(r.trace!.layer, 'L1'); assert.equal(r.conversation.mode, 'ai');
  assert.equal(aiTexts(r)[0] === CAUTION_TEXT.legal_threat, false, 'L1 replies get no reassurance line');
  assert.equal(r.trace!.decideProvider, 'jev');
  let started = false;
  let release!: (value: DecideResult) => void;
  const quick = await Promise.race([
    handleMessage({ buyerId: 'B001', text: '到哪了', debug: true }, { decide: () => { started = true; return new Promise<DecideResult>(r => { release = r; }); } }),
    new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new Error('L1 waited for decide')), 1000); timer.unref(); }),
  ]);
  assert(started); assert.equal(quick.trace!.layer, 'L1');
  release(fake('logistics_track')); await drainBackgroundTasks(); // let the background trace finish
});

test('yellow zone: reassurance first, 转人工 button last; two yellow turns in a row → handoff', async () => {
  const yellow = () => fake('logistics_track', { emotion: 2 });
  const first = await send('B001', '什么破快递，三天了还没动', yellow());
  assert.equal(first.trace!.layer, 'L2'); assert.equal(first.conversation.mode, 'ai');
  assert.equal(aiTexts(first)[0], CAUTION_TEXT.emotion); assert(labels(first).includes('转人工'));
  assert.equal(first.messages.filter(m => m.role === 'ai').at(-1)!.quickReplies!.at(-1)!.label, '转人工');
  const second = await send('B001', '还是没动，太慢了', yellow(), { conversationId: first.conversation.id });
  assert.equal(second.conversation.mode, 'human'); assert.equal(second.trace!.layer, 'human'); assert.equal(second.trace!.escalatedFrom, 'L2');
  assert.equal(second.trace!.handoffReason, CONSECUTIVE_YELLOW_REASON);
  assert.equal(getConversation(first.conversation.id)!.handoffReason, CONSECUTIVE_YELLOW_REASON);
});
test('a calm turn between two yellow turns resets the count', async () => {
  const first = await send('B001', '什么破快递，三天了还没动', fake('logistics_track', { emotion: 2 }));
  const calm = await send('B001', '那帮我看看物流吧', fake('logistics_track', { emotion: 0.3 }), { conversationId: first.conversation.id });
  assert.equal(calm.conversation.mode, 'ai'); assert.equal(aiTexts(calm).some(t => Object.values(CAUTION_TEXT).includes(t)), false);
  const third = await send('B001', '怎么还是这样', fake('logistics_track', { emotion: 2 }), { conversationId: first.conversation.id });
  assert.equal(third.conversation.mode, 'ai'); assert.equal(aiTexts(third)[0], CAUTION_TEXT.emotion);
});
test('previous turn answered by L1 still counts when its background trace has a yellow score', async () => {
  const first = await send('B001', '到哪了', fake('logistics_track', { emotion: 2 }));
  assert.equal(first.trace!.layer, 'L1');
  const stored = listTraces({ conversationId: first.conversation.id }).at(-1)!;
  assert.equal(stored.riskScores!.emotion, 2);
  const second = await send('B001', '怎么这么慢', fake('logistics_track', { emotion: 2 }), { conversationId: first.conversation.id });
  assert.equal(second.trace!.handoffReason, CONSECUTIVE_YELLOW_REASON);
});
test('a handler that already hands off keeps its own reason (no extra reassurance)', async () => {
  const r = await send('B001', '我要找人工客服', fake('human_request', { emotion: 2 }));
  assert.equal(r.conversation.mode, 'human');
  assert.equal(aiTexts(r).some(t => Object.values(CAUTION_TEXT).includes(t)), false);
});
