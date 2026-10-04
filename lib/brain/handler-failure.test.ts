import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { clearStoreCache } from '../store';
import { runHandler } from './handlers';
import { createHandlerContext, HandlerFailure } from './handlers/context';
import { runTool } from '../tools/registry';
import { getOrder, updateOrder } from '../store/collections';
import type { DialogState } from '../types';

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
test('L2 preserves wording and handoff for expired, shipped-only-refund and mandatory review', async () => {
  const old = getOrder('QM2026091501')!;
  updateOrder(old.id, { afterSales: [] });
  try {
    for (const [orderId, itemId, text, reason, expected] of [
      [old.id, 'QM2026091501-1', '退货', '尺寸不合适', '已超出签收后 7 天的申请期限，建议转人工确认'],
      ['QM2026100201', 'QM2026100201-2', '仅退款', '尺寸不合适', '已发货仅退款需先拒收或退回，请申请退货退款或转人工核实'],
      ['QM2026092801', 'QM2026092801-1', '退货', '质量问题', '金额 > ¥500 的质量问题需要转人工审核，请提供照片'],
    ]) {
      const state: DialogState = { currentTask: null, slots: { orderId, itemId, reason }, history: [], unresolvedTurns: 0, turnCount: 0, riskFlags: [] };
      const ctx = createHandlerContext({ buyerId: 'B001', conversationId: 'fixture' }, state, text, 'refund_apply');
      const result = await runHandler(ctx);
      assert.equal(result.messages[0].text, expected); assert.equal(result.handoffReason, expected);
    }
  } finally { updateOrder(old.id, { afterSales: old.afterSales }); }
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
