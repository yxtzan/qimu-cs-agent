import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { clearStoreCache } from '../store';
import { createConversation } from '../store/conversations';
import type { IntentId } from '../types';
import { runAgent } from './agent';
import { createHandlerContext } from './handlers/context';

const root = process.cwd();
const temp = mkdtempSync(join(tmpdir(), 'qimu-t09-agent-'));
const env = { ...process.env };
const originalFetch = globalThis.fetch;
cpSync(join(root, 'data/seed'), join(temp, 'data/seed'), { recursive: true });
process.chdir(temp); clearStoreCache();
process.env.OPENROUTER_API_KEY = 'fixture-key'; process.env.CLASSIFIER_PROVIDER = 'jev';
process.env.AGENT_MODEL = 'fixture-agent'; process.env.JEV_KEEPALIVE_MS = '0';
after(() => { globalThis.fetch = originalFetch; process.env = env; process.chdir(root); clearStoreCache(); rmSync(temp, { recursive: true, force: true }); });

type Step = { text?: string; calls?: { name: string; args: Record<string, unknown> }[]; finish?: string };
const requests: { tool_choice: string; messages: { role: string; content: string }[] }[] = [];
function fixture(steps: Step[]) {
  requests.length = 0;
  globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)));
    const step = steps[requests.length - 1]; assert(step, 'unexpected extra model call');
    return Response.json({ choices: [{ finish_reason: step.finish ?? (step.calls?.length ? 'tool_calls' : 'stop'), message: {
      content: step.text ?? null,
      ...(step.calls ? { tool_calls: step.calls.map((c, i) => ({ id: `call-${requests.length}-${i}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })) } : {}),
    } }], usage: { cost: 0.001 } });
  };
}
function context(intent: IntentId, text = '复杂咨询', buyerId = 'B001') {
  const c = createConversation(buyerId);
  return createHandlerContext({ buyerId, conversationId: c.id }, c.state, text, intent);
}

test('first factual model call requires a tool, even after prefetched orders', async () => {
  for (const text of ['复杂商品咨询', '查询历史订单']) {
    fixture([{ calls: [{ name: 'list_coupons', args: {} }] }, { text: '可用券见卡片。' }]);
    const result = await runAgent(context('product_consult', text));
    assert.equal(requests[0].tool_choice, 'required'); assert.equal(result.handoffReason, undefined);
    assert.equal(result.messages[0].text, '可用券见卡片。');
    assert(result.messages.some(m => m.card?.kind === 'coupons'));
  }
});
test('tool-free casual replies are allowed only for other/greeting, <=80 code points and no numbers', async () => {
  for (const intent of ['other', 'greeting'] as const) {
    fixture([{ text: '谢谢喜欢，穿出自己的风格就很美。' }]);
    assert.equal((await runAgent(context(intent))).handoffReason, undefined);
    assert.equal(requests[0].tool_choice, 'auto');
  }
  for (const text of ['价格是269元。', '只有２件。', '只需二百元。', '谢'.repeat(81), '']) {
    fixture([{ text }]); assert((await runAgent(context('other'))).handoffReason, text);
  }
  fixture([{ text: '无需查询就能确定。' }]); assert((await runAgent(context('product_consult'))).handoffReason);
});
test('order-status requests with known context pre-read facts independently of their wording', async () => {
  for (const text of ['无法完成操作，请看看状态', 'Help with my purchase']) {
    fixture([{ text: '可能是银行卡拦截，请换支付方式再试。' }]);
    const ctx = context('order_status', text, 'B003'); ctx.state.slots.orderId = 'QM2026100402';
    const result = await runAgent(ctx);
    assert.equal(result.handoffReason, undefined); assert.equal(requests[0].tool_choice, 'required');
    assert.deepEqual(ctx.metrics.toolCalls.map(t => t.name), ['get_order']);
    assert.equal(result.messages[0].text, '订单 QM2026100402 目前为待付款状态。具体问题原因尚不确定，请补充遇到的错误提示。');
    assert(requests[0].messages.some(m => m.role === 'tool' && m.content.includes('pending_payment')));
    assert.equal(requests[0].messages.filter(m => m.role === 'system').length, 1);
    assert(requests[0].messages[0].content.includes('无风险时不要仅因缺少这些买家信息而转人工'));
  }
});
test('generic loop preserves model summary alongside confirm/coupon cards', async () => {
  fixture([
    { calls: [{ name: 'list_coupons', args: {} }, { name: 'cancel_order', args: { orderId: 'QM2026100402' } }] },
    { text: '可用券见卡片；取消申请待您确认。' },
  ]);
  const result = await runAgent(context('multi_step_complex', '请查优惠并取消待付款订单', 'B003'));
  assert.equal(result.status, 'awaiting_confirm'); assert.equal(result.handoffReason, undefined);
  assert.equal(result.messages[0].text, '可用券见卡片；取消申请待您确认。');
  assert.deepEqual(result.messages.slice(1).map(m => m.card?.kind), ['coupons', 'confirm']);
});
test('normal business refusal is fed back to the model and explained without handoff', async () => {
  fixture([
    { calls: [{ name: 'apply_refund', args: { orderId: 'QM2026091501', itemId: 'QM2026091501-1', type: 'return_refund', reason: '尺寸不合适' } }, { name: 'list_coupons', args: {} }] },
    { text: '该商品已有售后处理中，不能重复申请；可用券见卡片。' },
  ]);
  const ctx = context('multi_step_complex', '尺寸不合适'); const result = await runAgent(ctx);
  assert.equal(result.handoffReason, undefined); assert.equal(result.status, 'done');
  assert(result.messages.some(m => m.text === '这件商品已有处理中售后，请先查询售后进度'));
  assert(requests[1].messages.some(m => m.role === 'tool' && m.content.includes('"kind":"business"')));
  assert.equal(ctx.metrics.toolCalls[0].ok, false);
});
test('invalid parameters, access errors and business rules requiring review still hand off', async () => {
  for (const call of [
    { name: 'get_order', args: { orderId: 'QM2026100401' } },
    { name: 'apply_refund', args: { orderId: 'QM2026092801', itemId: 'wrong', type: 'return_refund', reason: '尺寸不合适' } },
    { name: 'apply_refund', args: { orderId: 'QM2026092801', itemId: 'QM2026092801-1', type: 'return_refund', reason: '质量问题' } },
  ]) {
    fixture([{ calls: [call] }]); assert((await runAgent(context('multi_step_complex', '尺寸不合适，质量问题'))).handoffReason);
  }
});
test('generic L3 explains shipped refund refusal even when L2 requires handoff', async () => {
  fixture([
    { calls: [{ name: 'apply_refund', args: { orderId: 'QM2026100201', itemId: 'QM2026100201-2', type: 'refund_only', reason: '尺寸不合适' } }] },
    { text: '已发货仅退款需先拒收或退回，请申请退货退款或转人工核实。' },
  ]);
  const result = await runAgent(context('multi_step_complex', '尺寸不合适'));
  assert.equal(result.handoffReason, undefined);
  assert(result.messages.some(m => m.text === '已发货仅退款需先拒收或退回，请申请退货退款或转人工核实'));
  assert(requests[1].messages.some(m => m.role === 'tool' && m.content.includes('"kind":"business"')));
});
test('generic summaries must finish; truncated prose cannot silently omit questions', async () => {
  fixture([{ calls: [{ name: 'list_coupons', args: {} }] }, { text: '未完成的总结', finish: 'length' }]);
  assert((await runAgent(context('multi_step_complex'))).handoffReason);
});

test('refund reasons absent from buyer messages ask for input before creating a write', async () => {
  fixture([
    { calls: [{ name: 'apply_refund', args: { orderId: 'QM2026092801', itemId: 'QM2026092801-1', type: 'return_refund', reason: '腰有点紧' } }, { name: 'list_coupons', args: {} }] },
    { text: '请补充本次退货原因，可用券见卡片。' },
  ]);
  const ctx = context('multi_step_complex', '请退货并查优惠');
  const result = await runAgent(ctx);
  assert.equal(result.handoffReason, undefined);
  assert(!ctx.metrics.toolCalls.some(t => t.name === 'apply_refund'));
  assert(!result.messages.some(m => m.card?.kind === 'confirm'));
  assert(result.messages.some(m => m.text === '请说明这件商品本次退货的原因，我再帮您准备申请。'));
});

test('generic final summary receives single-item coupon eligibility from queried facts', async () => {
  fixture([
    { calls: [{ name: 'get_product', args: { productId: 'P030' } }, { name: 'list_coupons', args: {} }] },
    { text: '本次单件没有满足门槛及品类的券，价格仍为269元。' },
  ]);
  assert.equal((await runAgent(context('multi_step_complex'))).handoffReason, undefined);
  assert(requests[1].messages[0].content.includes('"eligibleCouponIds":[],"payable":269'));
});
test('quoting a bare refund request cannot substitute for the missing reason', async () => {
  fixture([
    { calls: [{ name: 'apply_refund', args: { orderId: 'QM2026092801', itemId: 'QM2026092801-1', type: 'return_refund', reason: '请把外套退了' } }] },
    { text: '请补充退货原因。' },
  ]);
  const ctx = context('multi_step_complex', '请把外套退了');
  const result = await runAgent(ctx);
  assert.equal(result.handoffReason, undefined); assert(!ctx.metrics.toolCalls.some(t => t.name === 'apply_refund'));
  assert(!result.messages.some(m => m.card?.kind === 'confirm'));
});
