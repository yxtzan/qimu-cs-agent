import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { clearStoreCache, writeCollection } from '../store';
import { getOrder, getProduct } from '../store/collections';
import type { PendingAction } from '../types';
import { confirmPendingAction, createPendingAction, getPendingAction, listPendingActions } from './execute-pending';

const root = process.cwd();
const temp = mkdtempSync(join(tmpdir(), 'qimu-t09b-pending-'));
cpSync(join(root, 'data/seed'), join(temp, 'data/seed'), { recursive: true });
process.chdir(temp);
clearStoreCache();
after(() => { process.chdir(root); clearStoreCache(); rmSync(temp, { recursive: true, force: true }); });

function rewindToPending(id: string) {
  const current = getPendingAction(id)!;
  const next: PendingAction = { ...current, status: 'pending' };
  delete next.result;
  delete next.resolvedAt;
  writeCollection('pending_actions', listPendingActions().map(a => a.id === id ? next : a));
}

test('confirming the same refund action twice keeps a single dated after-sale', () => {
  const ctx = { buyerId: 'B003', conversationId: 'C-refund-once' };
  const action = createPendingAction('apply_refund', {
    orderId: 'QM2026100401', itemId: 'QM2026100401-1', type: 'refund_only', reason: '不需要了',
  }, ctx);
  const first = confirmPendingAction(action.id, ctx);
  assert.equal(first.ok, true);
  const created = getOrder('QM2026100401')!.afterSales;
  assert.equal(created.length, 1);
  assert.match(created[0].id, /^AS\d{11}$/);
  const second = confirmPendingAction(action.id, ctx);
  assert.equal(second.ok, true);
  assert.equal(getOrder('QM2026100401')!.afterSales.length, 1);
  assert.equal(getOrder('QM2026100401')!.afterSales[0].id, created[0].id);

  // Order write landed, but the action was still pending (the old id lookup used to cover this retry).
  rewindToPending(action.id);
  const retried = confirmPendingAction(action.id, ctx);
  assert.equal(retried.ok, true);
  assert.equal(getOrder('QM2026100401')!.afterSales.length, 1);
  assert.equal(getOrder('QM2026100401')!.afterSales[0].id, created[0].id);
});

test('retrying the same exchange confirmation does not open a second after-sale or decrement stock again', () => {
  const ctx = { buyerId: 'B001', conversationId: 'C-exchange-once' };
  const sku = () => getProduct('P007')!.skus.find(s => s.size === 'L' && s.color === '燕麦色')!;
  const before = sku().stock;
  const action = createPendingAction('request_exchange', {
    orderId: 'QM2026092801', itemId: 'QM2026092801-1', newSize: 'L',
  }, ctx);
  assert.equal(confirmPendingAction(action.id, ctx).ok, true);
  const saleId = getOrder('QM2026092801')!.afterSales[0].id;
  assert.match(saleId, /^AS\d{11}$/);
  assert.equal(sku().stock, before - 1);
  rewindToPending(action.id);
  assert.equal(confirmPendingAction(action.id, ctx).ok, true);
  assert.equal(getOrder('QM2026092801')!.afterSales.length, 1);
  assert.equal(getOrder('QM2026092801')!.afterSales[0].id, saleId);
  assert.equal(sku().stock, before - 1);
});
