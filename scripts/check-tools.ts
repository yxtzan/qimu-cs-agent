import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEMO_NOW } from '../lib/demo-clock';
import { clearStoreCache, writeCollection } from '../lib/store';
import { getOrder, getProduct, updateOrder, updateProduct } from '../lib/store/collections';
import { confirmPendingAction, cancelPendingAction, getPendingAction, listPendingActions } from '../lib/tools/execute-pending';
import { runTool, toOpenAITools, toolRegistry } from '../lib/tools/registry';
import type { PendingAction, Order } from '../lib/types';

async function main() {
  const root = process.cwd();
  const temp = mkdtempSync(join(tmpdir(), 'qimu-t03-tools-'));
  const ctx = { buyerId: 'B001', conversationId: 'C-tools' };
  const b3 = { buyerId: 'B003', conversationId: 'C-tools-3' };
  try {
    cpSync(join(root, 'data/seed'), join(temp, 'data/seed'), { recursive: true }); process.chdir(temp); clearStoreCache();
    const seedOrder = structuredClone(getOrder('QM2026092801')!);
    const seedProduct = structuredClone(getProduct('P007')!);
    const itemId = seedOrder.items[0].itemId;
    const exchangeArgs = { orderId: seedOrder.id, itemId, newSize: 'L' };
    async function pending(name: string, args: Record<string, unknown>, context = ctx): Promise<PendingAction> {
      const result = await runTool(name, args, context); assert(result.ok, result.ok ? '' : result.reason); return result.data as PendingAction;
    }
    function resetExchange() { updateOrder(seedOrder.id, structuredClone(seedOrder)); updateProduct(seedProduct.id, structuredClone(seedProduct)); writeCollection('pending_actions', []); }
    const schemas = toOpenAITools(); assert.equal(schemas.length, 15); assert.equal(toolRegistry.size, 15);
    for (const schema of schemas) {
      assert.match(schema.function.description, /[\u4e00-\u9fff]/);
      assert(!('buyerId' in (schema.function.parameters.properties as Record<string, unknown>)));
    }
    for (const name of ['get_order', 'track_logistics', 'get_aftersale', 'request_exchange', 'apply_refund', 'modify_address', 'cancel_order']) {
      const result = await runTool(name, { ...exchangeArgs, type: 'return_refund', reason: '不喜欢了', address: seedOrder.address }, b3);
      assert(!result.ok);
    }
    for (const name of ['get_order', 'track_logistics', 'get_aftersale']) assert(!(await runTool(name, { orderId: seedOrder.id }, b3)).ok);
    assert(!(await runTool('get_order', { orderId: seedOrder.id, buyerId: 'B001' }, b3)).ok);
    assert(!(await runTool('list_orders', { sinceDays: -1 }, ctx)).ok);
    assert(!(await runTool('modify_address', { orderId: 'QM2026100401', address: { name: '不完整' } }, b3)).ok);
    console.log('PASS 15 个中文工具定义；模型不能注入 buyerId；读写越权及非法参数拒绝');
    const action = await pending('request_exchange', exchangeArgs);
    assert.deepEqual(getOrder(seedOrder.id), seedOrder); assert.deepEqual(getProduct(seedProduct.id), seedProduct);
    assert(!confirmPendingAction(action.id, b3).ok);
    assert(!confirmPendingAction(action.id, { ...ctx, conversationId: 'other' }).ok);
    assert(!cancelPendingAction(action.id, b3).ok);
    assert.equal(getPendingAction(action.id)!.status, 'pending');
    assert(confirmPendingAction(action.id, ctx).ok); assert(confirmPendingAction(action.id, ctx).ok);
    assert.equal(getOrder(seedOrder.id)!.afterSales.length, 1);
    assert.equal(getProduct(seedProduct.id)!.skus.find(s => s.size === 'L' && s.color === '燕麦色')!.stock, 2);
    clearStoreCache(); assert.equal(getPendingAction(action.id)!.status, 'confirmed'); assert.match(getPendingAction(action.id)!.resolvedAt!, /\+08:00$/);
    console.log('PASS 写工具不改业务数据；确认改数据/扣库存；跨会话确认拒绝；重复确认幂等；状态落盘');
    resetExchange(); const cancel = await pending('request_exchange', exchangeArgs);
    assert(cancelPendingAction(cancel.id, ctx).ok); assert(cancelPendingAction(cancel.id, ctx).ok); assert(!confirmPendingAction(cancel.id, ctx).ok);
    assert.deepEqual(getOrder(seedOrder.id), seedOrder); assert.deepEqual(getProduct(seedProduct.id), seedProduct);
    resetExchange(); const stale = await pending('request_exchange', exchangeArgs);
    updateProduct(seedProduct.id, { skus: seedProduct.skus.map(s => s.size === 'L' && s.color === '燕麦色' ? { ...s, stock: 0 } : s) });
    assert(!confirmPendingAction(stale.id, ctx).ok); assert.equal(getPendingAction(stale.id)!.status, 'failed'); assert.equal(getOrder(seedOrder.id)!.afterSales.length, 0);
    console.log('PASS 取消不改订单/库存；确认前库存变化会失败并持久化失败原因');
    resetExchange(); updateProduct(seedProduct.id, { skus: seedProduct.skus.map(s => s.size === 'L' && s.color === '燕麦色' ? { ...s, stock: 1 } : s) });
    const first = await pending('request_exchange', exchangeArgs); const second = await pending('request_exchange', exchangeArgs);
    const confirmed = await Promise.all([Promise.resolve().then(() => confirmPendingAction(first.id, ctx)), Promise.resolve().then(() => confirmPendingAction(second.id, ctx))]);
    assert.equal(confirmed.filter(r => r.ok).length, 1); assert.equal(getOrder(seedOrder.id)!.afterSales.length, 1); assert.equal(getProduct(seedProduct.id)!.skus.find(s => s.size === 'L' && s.color === '燕麦色')!.stock, 0);
    const oldExchange = getOrder(seedOrder.id)!.afterSales[0]; updateOrder(seedOrder.id, { afterSales: [{ ...oldExchange, status: 'exchange_shipped' }] });
    assert(!(await runTool('request_exchange', exchangeArgs, ctx)).ok);
    console.log('PASS 同进程并发确认不超卖、不重复换货；每件限一次');
    resetExchange();
    function daysAgo(days: number) { return new Date(Date.parse(DEMO_NOW) - days * 86400000 + 8 * 3600000).toISOString().replace('Z', '+08:00'); }
    updateOrder(seedOrder.id, { deliveredAt: daysAgo(7) }); assert((await runTool('request_exchange', exchangeArgs, ctx)).ok);
    updateOrder(seedOrder.id, { deliveredAt: daysAgo(7).replace('10:00:00', '09:59:59') }); assert(!(await runTool('request_exchange', exchangeArgs, ctx)).ok);
    updateOrder(seedOrder.id, { deliveredAt: daysAgo(8) }); assert(!(await runTool('apply_refund', { orderId: seedOrder.id, itemId, type: 'return_refund', reason: '不喜欢了' }, ctx)).ok);
    updateOrder(seedOrder.id, { deliveredAt: daysAgo(5) }); assert(!(await runTool('apply_refund', { orderId: seedOrder.id, itemId, type: 'return_refund', reason: '洗过了但不喜欢' }, ctx)).ok);
    assert(!(await runTool('apply_refund', { orderId: seedOrder.id, itemId, type: 'return_refund', reason: '质量问题开线' }, ctx)).ok);
    assert(!(await runTool('apply_refund', { orderId: seedOrder.id, itemId, type: 'refund_only', reason: '不喜欢' }, ctx)).ok);
    const b2 = { buyerId: 'B002', conversationId: 'C-quality' }; const qOrder = getOrder('QM2026092902')!; const qItemId = qOrder.items[0].itemId;
    updateOrder(qOrder.id, { deliveredAt: daysAgo(15) }); const quality = await pending('apply_refund', { orderId: qOrder.id, itemId: qItemId, type: 'return_refund', reason: '质量问题开线' }, b2);
    assert(confirmPendingAction(quality.id, b2).ok); assert.match(getOrder(qOrder.id)!.afterSales[0].timeline[0].note, /提供照片/);
    updateOrder(qOrder.id, { afterSales: [], deliveredAt: daysAgo(16) }); assert(!(await runTool('apply_refund', { orderId: qOrder.id, itemId: qItemId, type: 'return_refund', reason: '质量问题开线' }, b2)).ok);
    console.log('PASS 7/15 天含边界，超过期限拒绝；已洗无理由拒绝；质量金额 >500 转人工；低金额需照片审核；已发货仅退款拒绝');
    const paidSeed = structuredClone(getOrder('QM2026100401')!);
    const address = { ...paidSeed.address, detail: '新的演示地址' };
    const modify = await pending('modify_address', { orderId: paidSeed.id, address }, b3);
    assert.deepEqual(getOrder(paidSeed.id)!.address, paidSeed.address); updateOrder(paidSeed.id, { status: 'shipped' });
    assert(!confirmPendingAction(modify.id, b3).ok); assert.deepEqual(getOrder(paidSeed.id)!.address, paidSeed.address);
    updateOrder(paidSeed.id, paidSeed); const modifyOk = await pending('modify_address', { orderId: paidSeed.id, address }, b3); assert(confirmPendingAction(modifyOk.id, b3).ok); assert.deepEqual(getOrder(paidSeed.id)!.address, address);
    updateOrder(paidSeed.id, paidSeed); const cancelPaid = await pending('cancel_order', { orderId: paidSeed.id }, b3); assert(confirmPendingAction(cancelPaid.id, b3).ok); assert.equal(getOrder(paidSeed.id)!.status, 'cancelled'); assert.equal(getOrder(paidSeed.id)!.afterSales[0].amount, paidSeed.payAmount);
    const cancelUnpaid = await pending('cancel_order', { orderId: 'QM2026100402' }, b3); assert(confirmPendingAction(cancelUnpaid.id, b3).ok); assert.equal(getOrder('QM2026100402')!.afterSales.length, 0);
    updateOrder(paidSeed.id, paidSeed); const refund = await pending('apply_refund', { orderId: paidSeed.id, itemId: paidSeed.items[0].itemId, type: 'refund_only', reason: '不需要了' }, b3); assert(confirmPendingAction(refund.id, b3).ok); assert.equal(getOrder(paidSeed.id)!.afterSales[0].status, 'refunded'); assert(!(await runTool('apply_refund', { orderId: paidSeed.id, itemId: paidSeed.items[0].itemId, type: 'refund_only', reason: '重复' }, b3)).ok);
    // Discounts are allocated per item without over-refunding the paid total.
    const multi: Order = { ...paidSeed, id: 'QM2026100509', totalAmount: 30, discount: 10, payAmount: 20, items: [1, 2, 3].map(n => ({ ...paidSeed.items[0], itemId: `multi-${n}`, unitPrice: 10 })) };
    writeCollection('orders', [multi]);
    for (const item of multi.items) { const a = await pending('apply_refund', { orderId: multi.id, itemId: item.itemId, type: 'refund_only', reason: '不需要了' }, b3); assert(confirmPendingAction(a.id, b3).ok); }
    assert.equal(getOrder(multi.id)!.afterSales.reduce((sum, a) => sum + Math.round(a.amount * 100), 0), 2000); assert.equal(getOrder(multi.id)!.status, 'cancelled');
    writeCollection('orders', [multi]);
    const partial = await pending('apply_refund', { orderId: multi.id, itemId: multi.items[0].itemId, type: 'refund_only', reason: '不需要了' }, b3); assert(confirmPendingAction(partial.id, b3).ok);
    const cancelRemainder = await pending('cancel_order', { orderId: multi.id }, b3); assert(confirmPendingAction(cancelRemainder.id, b3).ok);
    assert.equal(getOrder(multi.id)!.afterSales.length, 3); assert.equal(getOrder(multi.id)!.afterSales.reduce((sum, a) => sum + Math.round(a.amount * 100), 0), 2000);
    assert(listPendingActions().length > 0);
    console.log('PASS 改地址/取消确认时再次校验状态；paid 取消全额退款；未付款无退款；仅退款即退；多件折扣不超退');
  } finally { process.chdir(root); clearStoreCache(); rmSync(temp, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
