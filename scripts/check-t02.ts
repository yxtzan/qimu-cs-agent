import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateSeed } from './seed-data';
import { checkSeed } from './check-seed';
import { clearStoreCache } from '../lib/store';
import { getOrder, updateOrder, getProduct, updateProduct, getBuyer, updateBuyer, listCoupons, updateCoupon, getRule, updateRule } from '../lib/store/collections';
import type { Order, Product, Coupon } from '../lib/types';

async function main() {
  const seed = generateSeed();
  assert.deepEqual(seed, generateSeed(), '固定种子必须可复现');
  for (const [name, value] of Object.entries(seed)) {
    assert.deepEqual(JSON.parse(readFileSync(join('data/seed', `${name}.json`), 'utf8')), value, `${name} 提交的数据应可由生成器复现`);
  }
  console.log('PASS 固定种子可复现，提交的 JSON 与生成器一致');
  const root = process.cwd();
  const temp = mkdtempSync(join(tmpdir(), 'qimu-t02-'));
  const fixture = join(temp, 'data/seed');
  cpSync(join(root, 'data/seed'), fixture, { recursive: true });
  try {
    function rejectJson<T>(name: string, mutate: (data: T) => void, label: string) {
      const file = join(fixture, `${name}.json`);
      const original = readFileSync(file, 'utf8');
      const data = JSON.parse(original) as T;
      mutate(data);
      writeFileSync(file, JSON.stringify(data));
      try { assert.throws(() => checkSeed(fixture), label); }
      finally { writeFileSync(file, original); }
      console.log(`PASS check-seed 拒绝：${label}`);
    }
    rejectJson<Order[]>('orders', rows => { rows[0].payAmount += 1; }, '金额错误');
    rejectJson<Order[]>('orders', rows => { delete rows[1].shippedAt; }, '已发货缺时间');
    rejectJson<Order[]>('orders', rows => { rows[1].logistics!.events.reverse(); }, '物流顺序错误');
    rejectJson<Order[]>('orders', rows => { rows[0].items[0].skuId = 'missing'; }, 'SKU 不存在');
    rejectJson<Order[]>('orders', rows => { rows[0].items[0].productId = 'P999'; }, '商品不存在');
    rejectJson<Order[]>('orders', rows => { rows[0].createdAt = '2026-09-27T10:00:00+08:00'; rows[0].paidAt = '2026-09-27T10:05:00+08:00'; }, '英雄下单日期错误');
    rejectJson<Order[]>('orders', rows => { rows[2].afterSales[0].status = 'refunded'; }, '售后状态与时间线矛盾');
    rejectJson<Order[]>('orders', rows => { rows[2].afterSales[0].id = 'AS20260920002'; }, '英雄售后单号错误');
    rejectJson<Product[]>('products', rows => { rows.find(p => p.id === 'P007')!.skus.find(s => s.color === '燕麦色' && s.size === 'L')!.stock = 4; }, '英雄库存错误');
    rejectJson<Coupon[]>('coupons', rows => { rows[0].expiresAt = '2026-10-30T23:59:59+08:00'; }, '英雄优惠券到期日错误');
    const kb = join(fixture, 'kb/退换货政策.md');
    const original = readFileSync(kb, 'utf8');
    writeFileSync(kb, original + '\n补充：8 天无理由。\n');
    assert.throws(() => checkSeed(fixture), /无理由期限冲突/);
    writeFileSync(kb, original);
    console.log('PASS check-seed 拒绝：正确政策之外另写冲突数字');
    // Store checks use a disposable cwd; never overwrite the user's runtime data.
    process.chdir(temp);
    clearStoreCache();
    assert.equal(listCoupons('B001').length, 2);
    assert.equal(getOrder('QM2026092801')!.payAmount, 599);
    updateOrder('QM2026092801', { remark: '临时验证' });
    assert.equal(JSON.parse(readFileSync('data/runtime/orders.json', 'utf8'))[0].remark, '临时验证');
    clearStoreCache();
    assert.equal(getOrder('QM2026092801')!.remark, '临时验证');
    cpSync('data/seed/orders.json', 'data/runtime/orders.json');
    assert.equal(getOrder('QM2026092801')!.remark, undefined, '外部重置应让缓存失效');
    updateProduct('P007', { sales: 1 }); assert.equal(getProduct('P007')!.sales, 1);
    updateBuyer('B001', { nickname: '测试昵称' }); assert.equal(getBuyer('B001')!.nickname, '测试昵称');
    updateCoupon('CP001', { used: true }); assert.equal(listCoupons('B001').length, 1);
    updateRule('R007', { enabled: false }); assert.equal(getRule('R007')!.enabled, false);
    assert.equal(updateOrder('missing', { remark: '无' }), undefined);
    console.log('PASS 类型化读写落盘、清缓存读取、外部重置刷新、已使用/过期券过滤');
  } finally {
    process.chdir(root); clearStoreCache(); rmSync(temp, { recursive: true, force: true });
  }
  const baseUrl = process.argv[2];
  if (!baseUrl) { console.log('HTTP 自测未运行；附加 URL 可验证六个接口，例如 http://localhost:3000'); return; }
  async function get<T>(path: string, expectedStatus = 200): Promise<T> {
    const response = await fetch(new URL(path, baseUrl));
    assert.equal(response.status, expectedStatus, `${path} HTTP 状态`);
    const body = await response.json();
    if (expectedStatus !== 200) {
      assert(body.error?.code && /[\u4e00-\u9fff]/.test(body.error.message), `${path} 中文错误契约`);
    }
    return body as T;
  }
  const buyers = await get<unknown[]>('/api/buyers'); assert.equal(buyers.length, 12);
  const products = await get<Product[]>('/api/products'); assert.equal(products.length, 36);
  assert(products.every((p, i) => !i || products[i - 1].sales >= p.sales));
  const coats = await get<Product[]>('/api/products?category=' + encodeURIComponent('外套')); assert.equal(coats.length, 6);
  const searched = await get<Product[]>('/api/products?q=' + encodeURIComponent('茶歇')); assert.equal(searched[0].id, 'P002');
  const tags = await get<Product[]>('/api/products?q=' + encodeURIComponent('通勤')); assert.equal(tags.length, 34); assert(tags.some(p => p.id === 'P007')); assert(!tags.some(p => p.id === 'P002'));
  assert.deepEqual(await get<Product>('/api/products/P007'), products.find(p => p.id === 'P007'));
  assert.deepEqual(await get<Product[]>('/api/products?q=unlikelymissing'), []);
  const orders = await get<Order[]>('/api/orders?buyerId=B001');
  assert.deepEqual(orders.map(o => o.id), ['QM2026100201', 'QM2026092801', 'QM2026091501']);
  const shipped = await get<Order[]>('/api/orders?buyerId=B001&status=shipped'); assert.equal(shipped.length, 1);
  assert.equal(shipped[0].id, 'QM2026100201');
  assert.equal((await get<Order>('/api/orders/QM2026092801?buyerId=B001')).status, 'delivered');
  const coupons = await get<Coupon[]>('/api/coupons?buyerId=B001'); assert.deepEqual(coupons.map(c => c.id), ['CP001', 'CP002']);
  await get('/api/orders/QM2026092801?buyerId=B002', 403);
  await get('/api/orders/QM2026092801?buyerId=B003', 403);
  for (const path of ['/api/products/P999', '/api/orders/QM9999999999?buyerId=B001', '/api/orders?buyerId=B999', '/api/coupons?buyerId=B999']) await get(path, 404);
  for (const path of ['/api/orders', '/api/coupons', '/api/orders/QM2026092801', '/api/orders?buyerId=B001&status=wrong', '/api/products?category=wrong']) await get(path, 400);
  for (const path of ['/', '/product/P007', '/orders', '/orders/QM2026092801']) {
    const response = await fetch(new URL(path, baseUrl)); assert.equal(response.status, 200, path);
    assert((await response.text()).includes('栖木'), `${path} 中文 HTML`);
  }
  console.log(`PASS 六个 HTTP 接口、过滤/排序、403/404/400 和四个商城页面：${baseUrl}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
