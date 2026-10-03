import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspect } from 'node:util';
import { loadLocalEnv } from '../lib/llm/env';
import { clearStoreCache } from '../lib/store';
import { getOrder, getProduct } from '../lib/store/collections';
import { buildKnowledgeIndex } from '../lib/rag';
import { confirmPendingAction, cancelPendingAction } from '../lib/tools/execute-pending';
import { runTool, toolRegistry } from '../lib/tools/registry';
import type { PendingAction } from '../lib/types';
import type { ToolContext } from '../lib/tools/types';

export async function demonstrateTools(): Promise<void> {
  const ctx: ToolContext = { buyerId: 'B001', conversationId: 'T03-demo-B001' };
  const b3 = { buyerId: 'B003', conversationId: 'T03-demo-B003' };
  const itemId = getOrder('QM2026092801')!.items[0].itemId;
  const before = JSON.stringify(getOrder('QM2026092801'));
  const calls: [string, Record<string, unknown>, ToolContext?][] = [
    ['list_orders', { sinceDays: 30 }], ['get_order', { orderId: 'QM2026092801' }],
    ['track_logistics', { orderId: 'QM2026100201' }], ['get_aftersale', { orderId: 'QM2026091501' }],
    ['search_products', { query: '大衣', category: '外套' }], ['get_product', { productId: 'P013' }],
    ['check_stock', { productId: 'P007', size: 'L' }], ['recommend_size', { heightCm: 160, weightKg: 50, productId: 'P002' }],
    ['list_coupons', {}], ['search_kb', { query: '真丝怎么洗' }],
    ['apply_refund', { orderId: 'QM2026100401', itemId: getOrder('QM2026100401')!.items[0].itemId, type: 'refund_only', reason: '暂时不需要了' }, b3],
    ['request_exchange', { orderId: 'QM2026092801', itemId, newSize: 'L' }],
    ['modify_address', { orderId: 'QM2026100401', address: { name: '陈思', phone: '138****0003', region: '浙江省 杭州市 西湖区', detail: '演示路 3 号' } }, b3],
    ['cancel_order', { orderId: 'QM2026100402' }, b3], ['create_handoff', { reason: '请人工核实质量问题照片' }],
  ];
  let exchangeId = '';
  for (const [name, args, context = ctx] of calls) {
    const result = await runTool(name, args, context);
    console.log(`\n${name}: ${inspect(result, { depth: 3, maxArrayLength: 4, breakLength: 100 })}`);
    assert(result.ok, `${name} 应成功`);
    if (name === 'request_exchange') exchangeId = (result.data as PendingAction).id;
  }
  assert.equal(calls.length, toolRegistry.size);
  assert.equal(JSON.stringify(getOrder('QM2026092801')), before, '生成确认动作时订单不能变化');
  const stockBefore = getProduct('P007')!.skus.find(s => s.size === 'L' && s.color === '燕麦色')!.stock;
  const missing = await runTool('request_exchange', { orderId: 'QM2026092801', itemId, newSize: 'L', newColor: '炭灰' }, ctx);
  console.log('\n炭灰 L:', missing);
  assert(!missing.ok && missing.reason === '缺货，预计 10-12 补货');
  const forbidden = await runTool('get_order', { orderId: 'QM2026092801' }, b3);
  console.log('B003 越权访问:', forbidden);
  assert(!forbidden.ok);
  const confirmed = confirmPendingAction(exchangeId, ctx);
  console.log('\n确认换货:', inspect(confirmed, { depth: 5, breakLength: 100 }));
  assert(confirmed.ok);
  const after = getOrder('QM2026092801')!;
  assert(after.afterSales.some(a => a.type === 'exchange' && a.newSize === 'L' && a.timeline.length));
  assert.equal(getProduct('P007')!.skus.find(s => s.size === 'L' && s.color === '燕麦色')!.stock, stockBefore - 1);
  assert(confirmPendingAction(exchangeId, ctx).ok, '重复确认幂等');
  assert.equal(getOrder(after.id)!.afterSales.length, after.afterSales.length);
  for (const action of (await import('../lib/tools/execute-pending')).listPendingActions().filter(a => a.status === 'pending')) {
    cancelPendingAction(action.id, action.args.buyerId === 'B003' ? b3 : ctx);
  }
  console.log(`\nPASS 全部 ${calls.length} 个工具；只生成待确认动作；缺货拒绝；越权拒绝；确认后新增 exchange 售后；燕麦色 L 库存 ${stockBefore} → ${stockBefore - 1}；重复确认无重复售后。`);
}
async function main() {
  loadLocalEnv();
  const root = process.cwd();
  const persist = process.argv.includes('--persist');
  const temp = persist ? undefined : mkdtempSync(join(tmpdir(), 'qimu-t03-demo-'));
  try {
    if (temp) { cpSync(join(root, 'data/seed'), join(temp, 'data/seed'), { recursive: true }); process.chdir(temp); clearStoreCache(); }
    console.log(persist ? '演示使用当前 runtime（先运行 npm run seed 可恢复初始数据）。' : '演示使用临时数据副本，结束后自动删除；--persist 可写入当前 runtime。');
    if (temp) await buildKnowledgeIndex();
    await demonstrateTools();
  } finally {
    process.chdir(root); clearStoreCache(); if (temp) rmSync(temp, { recursive: true, force: true });
  }
}
if (process.argv[1]?.endsWith('/try-tools.ts')) main().catch(error => { console.error(error); process.exitCode = 1; });
