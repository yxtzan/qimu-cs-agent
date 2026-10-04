import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { clearStoreCache } from '../store';
import { runHandler } from './handlers';
import { createHandlerContext, HandlerFailure } from './handlers/context';
import { handleMessage } from './pipeline';
import { decideWithMock } from './decide/mock';
import { runTool } from '../tools/registry';
import { getOrder, updateOrder } from '../store/collections';
import type { ChatMessage, DialogState } from '../types';

const root = process.cwd(); const temp = mkdtempSync(join(tmpdir(), 'qimu-t09-handler-'));
cpSync(join(root, 'data/seed'), join(temp, 'data/seed'), { recursive: true });
process.chdir(temp); clearStoreCache();
after(() => { process.chdir(root); clearStoreCache(); rmSync(temp, { recursive: true, force: true }); });

test('handler handoff follows the structured flag, independently of message wording', async () => {
  for (const [handoff, text] of [[true, '需要核实您的问题'], [false, '转人工、人工审核、人工确认均可由您选择']] as const) {
    const state: DialogState = { currentTask: null, slots: { productId: 'P007' }, history: [], unresolvedTurns: 0, turnCount: 0, riskFlags: [] };
    const ctx = createHandlerContext({ buyerId: 'B001', conversationId: 'fixture' }, state, '商品问题', 'product_consult');
    ctx.call = async () => { throw new HandlerFailure(text, { handoff }); };
    const result = await runHandler(ctx);
    assert.equal(result.messages[0].text, text); assert.equal(result.handoffReason, handoff ? text : undefined);
  }
});
test('L2 preserves wording and handoff for expired window and mandatory review', async () => {
  const old = getOrder('QM2026091501')!;
  updateOrder(old.id, { afterSales: [] });
  try {
    for (const [orderId, itemId, text, reason, expected] of [
      [old.id, 'QM2026091501-1', '退货', '尺寸不合适', '已超出签收后 7 天的申请期限，建议转人工确认'],
      ['QM2026092801', 'QM2026092801-1', '退货', '质量问题', '金额 > ¥500 的质量问题需要转人工审核，请提供照片'],
    ]) {
      const state: DialogState = { currentTask: null, slots: { orderId, itemId, reason }, history: [], unresolvedTurns: 0, turnCount: 0, riskFlags: [] };
      const ctx = createHandlerContext({ buyerId: 'B001', conversationId: 'fixture' }, state, text, 'refund_apply');
      const result = await runHandler(ctx);
      assert.equal(result.messages[0].text, expected); assert.equal(result.handoffReason, expected);
    }
  } finally { updateOrder(old.id, { afterSales: old.afterSales }); }
});
const REFUSAL = {
  shipped: '这件已经发货了，本店不支持仅退款，需要把商品寄回办理退货退款；如果是质量问题，可以转人工核实。',
  signed: '这件已经签收了，本店不支持仅退款，需要把商品寄回办理退货退款；如果是质量问题，可以转人工核实。',
};
function mockDecide(_state: unknown, message: string) {
  return Promise.resolve(decideWithMock(message));
}
function confirmType(messages: ChatMessage[]) {
  const card = messages.find(m => m.card?.kind === 'confirm');
  return card?.card?.kind === 'confirm' ? card.card.pendingAction.args.type : undefined;
}
test('shipped refund-only explains the rule and does not hand off', async () => {
  const state: DialogState = { currentTask: null, slots: { orderId: 'QM2026100201', itemId: 'QM2026100201-2', reason: '尺寸不合适' }, history: [], unresolvedTurns: 0, turnCount: 0, riskFlags: [] };
  const ctx = createHandlerContext({ buyerId: 'B001', conversationId: 'fixture' }, state, '仅退款', 'refund_apply');
  const result = await runHandler(ctx);
  assert.equal(result.messages[0].text, REFUSAL.shipped);
  assert.equal(result.handoffReason, undefined);
  assert.deepEqual(result.messages[0].quickReplies?.map(q => q.label), ['改为退货退款', '转人工']);
  assert.equal(confirmType(result.messages as ChatMessage[]), undefined);
});
test('stored refund-only wish still applies when the next turn only gives a reason', async () => {
  const state: DialogState = {
    currentTask: { intent: 'refund_apply', status: 'collecting', startedAt: '2026-10-05T10:00:00+08:00' },
    slots: { orderId: 'QM2026092801', itemId: 'QM2026092801-1' },
    history: [{ type: 'intent', name: 'wants_refund_only', summary: '买家想仅退款', at: '2026-10-05T10:00:00+08:00' }],
    unresolvedTurns: 0, turnCount: 1, riskFlags: [],
  };
  const ctx = createHandlerContext({ buyerId: 'B001', conversationId: 'fixture' }, state, '颜色不喜欢', 'refund_apply');
  const result = await runHandler(ctx);
  assert.equal(result.messages[0].text, REFUSAL.signed);
  assert.equal(result.handoffReason, undefined);
  assert.equal(confirmType(result.messages as ChatMessage[]), undefined);
});
test('refund-only four acceptance scenes', async () => {
  const paid = await handleMessage({ buyerId: 'B003', text: '这单我不要了，只退款', context: { orderId: 'QM2026100401', page: 'order_detail' } }, { decide: mockDecide });
  assert.equal(confirmType(paid.messages), 'refund_only');
  assert.match(paid.messages.find(m => m.card?.kind === 'confirm')?.text ?? '', /核对/);
  assert.equal(paid.messages.filter(m => m.role === 'ai').some(m => m.text.includes('不支持仅退款')), false);

  const signed = await handleMessage({ buyerId: 'B001', text: '我要退款不退货，颜色不喜欢', context: { orderId: 'QM2026092801', page: 'order_detail' } }, { decide: mockDecide });
  const signedAi = signed.messages.filter(m => m.role === 'ai');
  assert.equal(signedAi.at(-1)?.text, REFUSAL.signed);
  assert.deepEqual(signedAi.at(-1)?.quickReplies?.map(q => q.label), ['改为退货退款', '转人工']);
  assert.equal(confirmType(signed.messages), undefined);

  const changed = await handleMessage({
    buyerId: 'B001', conversationId: signed.conversation.id,
    action: { type: 'text', text: '改为退货退款' },
    context: { orderId: 'QM2026092801', page: 'order_detail' },
  }, { decide: mockDecide });
  assert.equal(confirmType(changed.messages), 'return_refund');
  assert.match(changed.messages.find(m => m.card?.kind === 'confirm')?.card?.kind === 'confirm' ? String(changed.messages.find(m => m.card?.kind === 'confirm')?.text) : '', /核对/);

  const asked = await handleMessage({ buyerId: 'B001', text: '我想退款不退货', context: { orderId: 'QM2026092801', page: 'order_detail' } }, { decide: mockDecide });
  assert.equal(confirmType(asked.messages), undefined);
  assert.match(asked.messages.filter(m => m.role === 'ai').at(-1)?.text ?? '', /原因/);
  assert.equal(asked.conversation.state.history.some(h => h.summary === '买家想仅退款'), true);

  const followed = await handleMessage({
    buyerId: 'B001', conversationId: asked.conversation.id, text: '腰太紧了',
    context: { orderId: 'QM2026092801', page: 'order_detail' },
  }, { decide: mockDecide });
  const followedAi = followed.messages.filter(m => m.role === 'ai');
  assert.equal(followedAi.at(-1)?.text, REFUSAL.signed);
  assert.equal(confirmType(followed.messages), undefined);
  assert.deepEqual(followedAi.at(-1)?.quickReplies?.map(q => q.label), ['改为退货退款', '转人工']);
});
test('existing review messages keep handoff=true; normal refusals and bad input differ', async () => {
  const args = { orderId: 'QM2026092801', itemId: 'QM2026092801-1', reason: '质量问题', type: 'return_refund' };
  const review = await runTool('apply_refund', args, { buyerId: 'B001', conversationId: 'fixture' });
  assert(!review.ok); assert.equal(review.handoff, true); assert.equal(review.kind, 'manual_review');
  assert.equal(review.reason, '金额 > ¥500 的质量问题需要转人工审核，请提供照片');
  const missing = await runTool('apply_refund', { ...args, itemId: 'bad' }, { buyerId: 'B001', conversationId: 'fixture' });
  assert(!missing.ok); assert.equal(missing.handoff, false); assert.equal(missing.kind, 'input');
  const pending = await runTool('apply_refund', { ...args, orderId: 'QM2026091501', itemId: 'QM2026091501-1' }, { buyerId: 'B001', conversationId: 'fixture' });
  assert(!pending.ok); assert.equal(pending.handoff, false); assert.equal(pending.kind, 'business');
});
