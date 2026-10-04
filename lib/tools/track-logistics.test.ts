import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { clearStoreCache } from '../store';
import { getOrder } from '../store/collections';
import { runHandler } from '../brain/handlers';
import { createHandlerContext } from '../brain/handlers/context';
import { runTool } from './registry';
import { expectedShipBy, trackLogistics } from './track-logistics';
import type { DialogState, Order } from '../types';

test('paid order gets expectedShipBy 48 hours after payment', () => {
  const order = {
    id: 'QM2026100401',
    status: 'paid',
    paidAt: '2026-10-04T21:00:00+08:00',
  } as Order;
  const result = trackLogistics(order);
  assert.equal(result.shipped, false);
  if (result.shipped) return;
  assert.equal(result.status, 'paid');
  assert.equal(result.expectedShipBy, '2026-10-06T21:00:00+08:00');
  assert.equal(expectedShipBy(order.paidAt!), result.expectedShipBy);
});

test('pending payment has no expected ship time', () => {
  const result = trackLogistics({ id: 'QM2026100402', status: 'pending_payment' } as Order);
  assert.equal(result.shipped, false);
  if (result.shipped) return;
  assert.equal(result.status, 'pending_payment');
  assert.equal(result.expectedShipBy, undefined);
});

const root = process.cwd();
const temp = mkdtempSync(join(tmpdir(), 'qimu-t21d-logistics-'));
cpSync(join(root, 'data/seed'), join(temp, 'data/seed'), { recursive: true });
process.chdir(temp);
clearStoreCache();
after(() => {
  process.chdir(root);
  clearStoreCache();
  rmSync(temp, { recursive: true, force: true });
});

function state(orderId: string): DialogState {
  return { currentTask: null, slots: { orderId }, history: [], unresolvedTurns: 0, turnCount: 0, riskFlags: [] };
}

test('track_logistics does not throw for an unshipped paid order', async () => {
  const result = await runTool('track_logistics', { orderId: 'QM2026100401' }, { buyerId: 'B003', conversationId: 'fixture' });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const data = result.data as { shipped: boolean; status: string; expectedShipBy?: string };
  assert.equal(data.shipped, false);
  assert.equal(data.status, 'paid');
  assert.equal(data.expectedShipBy, '2026-10-06T21:00:00+08:00');
  assert.equal(getOrder('QM2026100401')?.logistics, undefined);
});

test('shipped orders still return the logistics timeline', async () => {
  const result = await runTool('track_logistics', { orderId: 'QM2026100201' }, { buyerId: 'B001', conversationId: 'fixture' });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const data = result.data as { shipped: boolean; logistics?: { events: unknown[] } };
  assert.equal(data.shipped, true);
  assert.ok((data.logistics?.events.length ?? 0) >= 3);
});

test('L2 answers an unshipped order with the expected ship time and does not hand off', async () => {
  for (const intent of ['urge_shipping', 'order_status', 'logistics_track'] as const) {
    const ctx = createHandlerContext({ buyerId: 'B003', conversationId: 'fixture' }, state('QM2026100401'), '这单什么时候发货', intent);
    const result = await runHandler(ctx);
    assert.equal(result.handoffReason, undefined, intent);
    assert.match(result.messages[0].text, /10月6日 21:00/);
    assert.equal(result.messages.some((m) => m.card?.kind === 'confirm'), false);
  }
});

test('pending payment logistics does not invent a ship time', async () => {
  const ctx = createHandlerContext({ buyerId: 'B003', conversationId: 'fixture' }, state('QM2026100402'), '还没发货吗', 'logistics_track');
  const result = await runHandler(ctx);
  assert.equal(result.handoffReason, undefined);
  assert.match(result.messages[0].text, /付款/);
  assert.doesNotMatch(result.messages[0].text, /预计/);
});
