import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DEMO_NOW } from '../lib/demo-clock';
import type { Buyer, Product, Order, Coupon, Rule, AfterSaleStatus } from '../lib/types';
import type { StoreInfo, SizeChartRow } from '../lib/store/seed-types';

const anchor = Date.parse(DEMO_NOW);
const DAY = 86400000;
const sizes = ['XS', 'S', 'M', 'L', 'XL'];
const categories = ['连衣裙', '上衣', '针织衫', '外套', '裤装', '半身裙'];
const orderStatuses = ['pending_payment', 'paid', 'shipped', 'delivered', 'completed', 'cancelled'];
const afterStatuses: AfterSaleStatus[] = ['pending_review', 'approved', 'returning', 'refunding', 'refunded', 'exchange_shipped', 'rejected', 'closed'];
function unique(values: string[], label: string) {
  assert(values.every(Boolean) && new Set(values).size === values.length, `${label} 编号为空或重复`);
}
function timestamp(value: string, label: string, future = false): number {
  assert(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?\+08:00$/.test(value), `${label} 时间格式应为 ISO +08:00`);
  const ms = Date.parse(value);
  assert(Number.isFinite(ms), `${label} 时间无效`);
  assert(new Date(ms + 8 * 3600000).toISOString().slice(0, 10) === value.slice(0, 10), `${label} 日期无效`);
  if (!future) assert(ms <= anchor, `${label} 事件不能发生在 DEMO_NOW 之后`);
  return ms;
}
function money(value: number, label: string) {
  assert(Number.isFinite(value) && value >= 0 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, `${label} 金额不合法`);
}
function address(value: Buyer['defaultAddress'], label: string) {
  assert(/^138\*{4}\d{4}$/.test(value.phone), `${label} 手机号必须打码`);
  assert(value.name && value.region && value.detail.includes('演示'), `${label} 地址需完整且虚构`);
}
export function checkSeed(dataDir = join(process.cwd(), 'data/seed'), kbDir = join(dataDir, 'kb')) {
  const read = <T,>(file: string): T => JSON.parse(readFileSync(join(dataDir, `${file}.json`), 'utf8')) as T;
  const products = read<Product[]>('products');
  const buyers = read<Buyer[]>('buyers');
  const orders = read<Order[]>('orders');
  const coupons = read<Coupon[]>('coupons');
  const rules = read<Rule[]>('rules');
  assert.equal(products.length, 36, '商品数'); assert.equal(buyers.length, 12, '买家数');
  assert.equal(orders.length, 90, '订单数'); assert.equal(coupons.length, 30, '优惠券数'); assert.equal(rules.length, 8, '规则数');
  for (const [label, values] of Object.entries({ products, buyers, orders, coupons, rules })) unique(values.map(v => v.id), label);
  const allSkus = products.flatMap(p => p.skus);
  unique(allSkus.map(s => s.skuId), 'SKU');
  for (const category of categories) assert.equal(products.filter(p => p.category === category).length, 6, `${category} 商品数`);
  for (const p of products) {
    assert(/^P\d{3}$/.test(p.id) && p.name && categories.includes(p.category), `${p.id} 商品字段`);
    assert(p.price >= 129 && p.price <= 899, `${p.id} 价格带`); money(p.price, p.id);
    assert.deepEqual(p.images, [], `${p.id} images 必须为空`);
    assert(p.colors.length >= 2 && p.colors.length <= 3 && p.sizes.length >= 4 && p.sizes.length <= 5, `${p.id} 颜色/尺码数量`);
    unique(p.colors, `${p.id} 颜色`); unique(p.sizes, `${p.id} 尺码`);
    assert(p.sizes.every(s => sizes.includes(s)) && ['标准', '宽松', '修身'].includes(p.fit), `${p.id} 尺码/版型`);
    assert(p.material && p.care && p.description && p.highlights.length && p.tags.length, `${p.id} 资料缺失`);
    assert(Number.isInteger(p.sales) && p.sales >= 0 && p.rating >= 0 && p.rating <= 5, `${p.id} 销量/评分`);
    assert.equal(p.skus.length, p.colors.length * p.sizes.length, `${p.id} SKU 网格不完整`);
    unique(p.skus.map(s => `${s.color}/${s.size}`), `${p.id} SKU 组合`);
    for (const s of p.skus) {
      assert(p.colors.includes(s.color) && p.sizes.includes(s.size), `${s.skuId} 颜色/尺码不在商品中`);
      assert(Number.isInteger(s.stock) && s.stock >= 0, `${s.skuId} 库存`);
      if (s.restockDate) { assert.equal(s.stock, 0, `${s.skuId} 非缺货不应填补货日期`); timestamp(s.restockDate, s.skuId, true); }
    }
  }
  const zeroShare = allSkus.filter(s => s.stock === 0).length / allSkus.length;
  assert(zeroShare >= 0.05 && zeroShare <= 0.15, '缺货 SKU 比例需约 10%');
  for (const b of buyers) {
    assert(/^B\d{3}$/.test(b.id) && b.nickname && typeof b.avatar === 'string', `${b.id} 买家字段`);
    assert(['普通', '银卡', '金卡'].includes(b.memberLevel), `${b.id} 会员级别`);
    address(b.defaultAddress, b.id);
  }
  unique(orders.flatMap(o => o.items.map(i => i.itemId)), '订单项');
  const afterSales = orders.flatMap(o => o.afterSales);
  assert.equal(afterSales.length, 30, '售后数'); unique(afterSales.map(a => a.id), '售后');
  assert(new Set(afterSales.map(a => a.reason)).size >= 12, '售后原因应有口语化差异');
  for (const o of orders) {
    assert(/^QM\d{10}$/.test(o.id) && orderStatuses.includes(o.status), `${o.id} 订单字段`);
    assert(buyers.some(b => b.id === o.buyerId), `${o.id} 买家不存在`); address(o.address, o.id);
    assert(o.items.length >= 1 && o.items.length <= 3, `${o.id} 订单项数量`);
    for (const i of o.items) {
      const p = products.find(p => p.id === i.productId);
      assert(p, `${o.id} productId 不存在`);
      const sku = p.skus.find(s => s.skuId === i.skuId);
      assert(sku && sku.size === i.size && sku.color === i.color, `${o.id} skuId/颜色/尺码不匹配`);
      assert.equal(i.productName, p.name, `${o.id} 商品名`); assert.equal(i.unitPrice, p.price, `${o.id} 单价`);
      assert(Number.isInteger(i.quantity) && i.quantity > 0, `${o.id} 数量`); money(i.unitPrice, o.id);
    }
    for (const value of [o.totalAmount, o.discount, o.payAmount]) money(value, o.id);
    const total = o.items.reduce((sum, i) => sum + Math.round(i.unitPrice * 100) * i.quantity, 0);
    assert.equal(Math.round(o.totalAmount * 100), total, `${o.id} totalAmount != 单价 × 数量之和`);
    assert(o.discount <= o.totalAmount, `${o.id} 优惠超过总额`);
    assert.equal(Math.round(o.payAmount * 100), total - Math.round(o.discount * 100), `${o.id} payAmount != 总额 − 优惠`);
    const created = timestamp(o.createdAt, `${o.id} createdAt`);
    assert(created >= anchor - 60 * DAY, `${o.id} 不在过去 60 天`);
    const paid = o.paidAt ? timestamp(o.paidAt, `${o.id} paidAt`) : undefined;
    const shipped = o.shippedAt ? timestamp(o.shippedAt, `${o.id} shippedAt`) : undefined;
    const delivered = o.deliveredAt ? timestamp(o.deliveredAt, `${o.id} deliveredAt`) : undefined;
    if (paid !== undefined) assert(paid >= created, `${o.id} 付款早于下单`);
    if (o.status === 'pending_payment') assert(paid === undefined && shipped === undefined && delivered === undefined && !o.logistics, `${o.id} 待付款字段冲突`);
    if (o.status === 'paid') assert(paid !== undefined && shipped === undefined && delivered === undefined && !o.logistics, `${o.id} 未发货字段冲突`);
    if (o.status === 'cancelled') assert(shipped === undefined && delivered === undefined && !o.logistics, `${o.id} 已取消字段冲突`);
    if (['shipped', 'delivered', 'completed'].includes(o.status)) {
      assert(paid !== undefined && shipped !== undefined && shipped >= paid && o.logistics, `${o.id} 已发货缺时间/物流`);
      assert(shipped - paid <= 48 * 3600000, `${o.id} 现货发货超过 48 小时`);
      if (o.status === 'shipped') assert(delivered === undefined && o.logistics.status !== 'delivered', `${o.id} 运输中已有签收`);
      else assert(delivered !== undefined && delivered >= shipped && o.logistics.status === 'delivered', `${o.id} 签收字段不匹配`);
      const logistics = o.logistics;
      assert(logistics.carrier && logistics.trackingNo && ['awaiting_pickup', 'in_transit', 'out_for_delivery', 'delivered', 'exception'].includes(logistics.status), `${o.id} 物流字段`);
      assert(logistics.events.length >= 5, `${o.id} 物流节点不足`);
      let previous = Infinity;
      for (const e of logistics.events) {
        const ms = timestamp(e.at, `${o.id} 物流节点`);
        assert(e.location && e.description && ms < previous && ms >= shipped, `${o.id} 物流节点应严格倒序且不早于发货`);
        if (delivered !== undefined) assert(ms <= delivered, `${o.id} 节点晚于签收`);
        previous = ms;
      }
      assert.equal(previous, shipped, `${o.id} 首次揽收与发货不一致`);
      if (delivered !== undefined) assert.equal(Date.parse(logistics.events[0].at), delivered, `${o.id} 末节点与签收不一致`);
      if (logistics.estimatedDelivery) assert(timestamp(logistics.estimatedDelivery, `${o.id} 预计送达`, true) >= shipped, `${o.id} 预计送达早于发货`);
      if (buyers.find(b => b.id === o.buyerId)!.memberLevel === '金卡') assert.equal(logistics.carrier, '顺丰速运', `${o.id} 金卡快递`);
    }
    for (const a of o.afterSales) {
      assert.equal(a.orderId, o.id, `${a.id} orderId`);
      const item = o.items.find(i => i.itemId === a.itemId);
      assert(item && a.reason.trim() && !a.reasonCategory, `${a.id} itemId/原因/预打标字段`);
      assert(['refund_only', 'return_refund', 'exchange'].includes(a.type) && afterStatuses.includes(a.status), `${a.id} 类型/状态`);
      money(a.amount, a.id); assert(a.amount <= item.unitPrice * item.quantity && a.amount <= o.payAmount, `${a.id} 退款金额`);
      const start = timestamp(a.createdAt, `${a.id} createdAt`);
      assert(start >= created && a.timeline.length > 0 && a.timeline[0].at === a.createdAt, `${a.id} 申请时间`);
      if (a.type !== 'refund_only') assert(delivered !== undefined && start >= delivered && start - delivered <= 15 * DAY, `${a.id} 售后申请窗口`);
      let previous = -Infinity;
      const allowed: Partial<Record<AfterSaleStatus, AfterSaleStatus[]>> = {
        pending_review: ['approved', 'rejected', 'closed'], approved: ['returning', 'closed'],
        returning: ['refunding', 'exchange_shipped', 'closed'], refunding: ['refunded'],
      };
      a.timeline.forEach((e, i) => {
        const ms = timestamp(e.at, `${a.id} timeline`);
        assert(ms > previous && ms >= start && e.note && afterStatuses.includes(e.status), `${a.id} 售后时间线`);
        if (i === 0) assert.equal(e.status, 'pending_review', `${a.id} 首次状态`);
        else assert(allowed[a.timeline[i - 1].status]?.includes(e.status), `${a.id} 非法状态跳转`);
        previous = ms;
      });
      assert.equal(a.timeline.at(-1)!.status, a.status, `${a.id} 当前状态与时间线不一致`);
      if (a.type === 'exchange') {
        assert(!['refunding', 'refunded'].includes(a.status), `${a.id} 换货出现退款状态`);
        const p = products.find(p => p.id === item.productId)!;
        assert(p.skus.some(s => s.size === (a.newSize ?? item.size) && s.color === (a.newColor ?? item.color) && s.stock > 0), `${a.id} 换货 SKU 不可用`);
      } else assert(a.status !== 'exchange_shipped' && !a.newSize && !a.newColor, `${a.id} 退款出现换货字段`);
    }
  }
  const statusTargets = [0.05, 0.08, 0.12, 0.15, 0.45, 0.15];
  orderStatuses.forEach((status, i) => assert(Math.abs(orders.filter(o => o.status === status).length / orders.length - statusTargets[i]) <= 0.04, `${status} 比例偏离规格`));
  const shipments = orders.filter(o => o.logistics);
  const exceptionShare = shipments.filter(o => o.logistics!.status === 'exception').length / shipments.length;
  assert(exceptionShare >= 0.015 && exceptionShare <= 0.05, '物流异常比例需约 3%');
  for (const c of coupons) {
    assert(buyers.some(b => b.id === c.buyerId) && c.title && typeof c.used === 'boolean', `${c.id} 优惠券字段`);
    money(c.threshold, c.id); money(c.discount, c.id);
    assert(c.threshold > c.discount && (c.scope === '全店' || categories.includes(c.scope)), `${c.id} 优惠券门槛/范围`);
    timestamp(c.expiresAt, `${c.id} 到期时间`, true);
  }
  // Independent expectations transcribed from DATA_SPEC; do not import generator constants.
  const expectedBuyers = [
    ['B001', '林小满', '金卡', 160, 50], ['B002', '周雨桐', '银卡', 165, 54], ['B003', '陈思', '普通', 158, 47],
  ];
  expectedBuyers.forEach(([id, nickname, memberLevel, heightCm, weightKg]) => {
    const b = buyers.find(b => b.id === id)!;
    assert(b, `缺英雄买家 ${id}`);
    assert.deepEqual([b.nickname, b.memberLevel, b.heightCm, b.weightKg], [nickname, memberLevel, heightCm, weightKg], `${id} 英雄买家`);
  });
  const expectedProducts = [
    ['P007', '燕麦色羊毛混纺大衣', '外套', 599, ['燕麦色', '炭灰'], '标准', '羊毛 70% 锦纶 30%'],
    ['P013', '云感真丝衬衫', '上衣', 459, ['象牙白', '雾蓝'], '宽松', '桑蚕丝 92% 氨纶 8%'],
    ['P021', '高腰直筒西装裤', '裤装', 329, ['黑', '卡其'], '标准', '聚酯纤维 63% 粘胶 33% 氨纶 4%'],
    ['P002', '法式碎花茶歇裙', '连衣裙', 389, ['蓝底白花', '黑底黄花'], '修身', '粘胶 100%'],
    ['P030', '软糯圆领开衫', '针织衫', 269, ['奶白', '燕麦', '雾粉'], '宽松', '羊毛 30% 腈纶 50% 锦纶 20%'],
  ];
  expectedProducts.forEach(([id, name, category, price, colors, fit, material]) => {
    const p = products.find(p => p.id === id)!;
    assert(p, `缺英雄商品 ${id}`);
    assert.deepEqual([p.name, p.category, p.price, p.colors, p.fit, p.material], [name, category, price, colors, fit, material], `${id} 英雄商品`);
  });
  const coat = products.find(p => p.id === 'P007')!;
  assert.equal(coat.skus.find(s => s.color === '燕麦色' && s.size === 'L')!.stock, 3, '燕麦色 L 库存');
  const charcoal = coat.skus.find(s => s.color === '炭灰' && s.size === 'L')!;
  assert.equal(charcoal.stock, 0, '炭灰 L 库存'); assert.equal(charcoal.restockDate!.slice(0, 10), '2026-10-12', '炭灰 L 补货');
  const expectedOrders = [
    ['QM2026092801', 'B001', 'delivered', [['P007', '燕麦色', 'M', 1, 599]], '2026-09-26', '2026-09-30'],
    ['QM2026100201', 'B001', 'shipped', [['P021', '黑', 'S', 1, 329], ['P030', '奶白', 'M', 1, 269]], '2026-10-02', undefined],
    ['QM2026091501', 'B001', 'completed', [['P002', '蓝底白花', 'M', 1, 389]], '2026-09-15', '2026-09-18'],
    ['QM2026092902', 'B002', 'delivered', [['P013', '象牙白', 'M', 1, 459]], '2026-09-29', '2026-10-01'],
    ['QM2026100401', 'B003', 'paid', [['P030', '雾粉', 'S', 1, 269]], '2026-10-04', undefined],
    ['QM2026100402', 'B003', 'pending_payment', [['P021', '卡其', 'S', 1, 329]], '2026-10-05', undefined],
  ];
  expectedOrders.forEach(([id, buyerId, status, items, createdDate, deliveredDate]) => {
    const o = orders.find(o => o.id === id)!;
    assert(o, `缺英雄订单 ${id}`);
    assert.deepEqual([o.buyerId, o.status, o.items.map(i => [i.productId, i.color, i.size, i.quantity, i.unitPrice]), o.createdAt.slice(0, 10), o.deliveredAt?.slice(0, 10)],
      [buyerId, status, items, createdDate, deliveredDate], `${id} 英雄订单字段`);
    assert.equal(o.discount, 0, `${id} 英雄订单未设优惠`);
    if (id !== 'QM2026091501') assert.deepEqual(o.afterSales, [], `${id} 英雄售后应留空`);
  });
  assert.equal(orders.find(o => o.id === 'QM2026100401')!.paidAt, '2026-10-04T21:00:00+08:00');
  assert.equal(orders.find(o => o.id === 'QM2026100402')!.createdAt, '2026-10-05T09:30:00+08:00');
  const inTransit = orders.find(o => o.id === 'QM2026100201')!;
  assert.equal(inTransit.shippedAt!.slice(0, 10), '2026-10-03');
  assert.equal(inTransit.logistics!.carrier, '顺丰速运'); assert.equal(inTransit.logistics!.status, 'in_transit');
  assert.equal(inTransit.logistics!.estimatedDelivery!.slice(0, 10), '2026-10-06');
  const route = [...inTransit.logistics!.events].reverse().map(e => e.location);
  assert.deepEqual(route, ['杭州仓', '杭州转运中心', '杭州转运中心', '上海转运中心', '上海浦东配送站']);
  const refund = orders.find(o => o.id === 'QM2026091501')!.afterSales;
  assert.equal(refund.length, 1);
  assert.deepEqual([refund[0].id, refund[0].orderId, refund[0].itemId, refund[0].type, refund[0].reason, refund[0].status, refund[0].amount, refund[0].createdAt.slice(0, 10)],
    ['AS20260920001', 'QM2026091501', 'QM2026091501-1', 'return_refund', '腰有点紧', 'refunding', 389, '2026-09-20']);
  assert.equal(refund[0].timeline.at(-1)!.at.slice(0, 10), '2026-10-03');
  assert.match(refund[0].timeline.at(-1)!.note, /商家已收到退货/);
  assert.deepEqual(coupons.filter(c => c.buyerId === 'B001').map(c => [c.title, c.threshold, c.discount, c.scope, c.expiresAt.slice(0, 10), c.used]), [
    ['满 299 减 30', 299, 30, '全店', '2026-10-31', false], ['满 199 减 20', 199, 20, '外套', '2026-10-15', false],
    ['满 99 减 10', 99, 10, '全店', '2026-09-30', false],
  ]);
  assert.deepEqual(read<StoreInfo>('store'), { name: '栖木 QIMU', slogan: '慢一点，穿久一点', audience: '25–35 岁通勤 / 日常女装',
    priceRange: [129, 899], humanServiceHours: '9:00–23:00', aiServiceHours: 24, agentName: '阿栖', freeShippingThreshold: 99,
    defaultCarrier: '中通快递', goldCarrier: '顺丰速运', shippingWithinHours: 48 });
  assert.deepEqual(read<SizeChartRow[]>('size_chart').map(r => [r.size, r.heightCm, r.weightKg, r.bustCm, r.waistCm]), [
    ['XS', [150, 154], [40, 44], 80, 62], ['S', [155, 159], [45, 49], 84, 66], ['M', [160, 164], [50, 54], 88, 70],
    ['L', [165, 169], [55, 61], 92, 74], ['XL', [170, 175], [62, 70], 96, 78],
  ]);
  const ruleExpected = [
    ['转人工', '人工|真人|转客服', 'human_request', 12, 41, 0],
    ['查物流', '^(到哪了|物流|查物流|快递到哪了?|发货了吗)[?？!！。]*$', 'logistics_track', 10, 63, 2],
    ['退款进度', '退款(进度|到哪|到账|什么时候到)', 'refund_progress', 12, 37, 1],
    ['打招呼', '^(你好|您好|在吗|在不在|hi|hello)[?？!！~。]*$', 'greeting', 8, 88, 0],
    ['发票', '发票', 'invoice', 10, 12, 1], ['运费险', '运费险', 'return_policy', 12, 9, 0],
    ['尺码（宽泛）', '尺码', 'size_recommend', 20, 23, 9], ['优惠码', '优惠码', 'promotion', 10, 0, 0],
  ];
  rules.forEach((r, i) => {
    assert.equal(r.id, `R${String(i + 1).padStart(3, '0')}`);
    assert.deepEqual([r.name, r.pattern, r.intent, r.maxLen, r.hitCount, r.misfireCount], ruleExpected[i], `${r.id} 预置规则`);
    assert.equal(r.enabled, true); assert.equal(r.createdAt, '2026-09-01T10:00:00+08:00'); new RegExp(r.pattern);
    if (r.hitCount) assert(r.lastHitAt && timestamp(r.lastHitAt, r.id) >= anchor - 7 * DAY, `${r.id} 最近命中`);
    else assert.equal(r.lastHitAt, undefined, `${r.id} 无命中不得填写 lastHitAt`);
  });
  checkKnowledge(kbDir);
  console.log(`check-seed 全部通过：商品 ${products.length} / 买家 ${buyers.length} / 订单 ${orders.length} / 售后 ${afterSales.length} / 券 ${coupons.length} / 规则 ${rules.length} / 知识库 10`);
  return { products: products.length, buyers: buyers.length, orders: orders.length, afterSales: afterSales.length, coupons: coupons.length,
    skus: allSkus.length, zeroStock: allSkus.filter(s => s.stock === 0).length, shipments: shipments.length,
    exceptions: shipments.filter(o => o.logistics!.status === 'exception').length };
}

function checkKnowledge(dir: string) {
  const required = ['退换货政策', '尺码指南', '洗护指南', '发货与物流', '优惠与会员', '发票说明', '质量问题处理', '退款时效说明', '店铺介绍与客服时间', '常见问题FAQ'];
  assert.deepEqual(readdirSync(dir).filter(f => f.endsWith('.md')).sort(), required.map(n => `${n}.md`).sort(), '知识库文件清单');
  const docs = Object.fromEntries(required.map(name => [name, readFileSync(join(dir, `${name}.md`), 'utf8')]));
  const facts: [string[], RegExp][] = [
    [['退换货政策', '尺码指南', '店铺介绍与客服时间', '常见问题FAQ'], /签收后\s*7\s*天内（含第\s*7\s*天）/],
    [['退换货政策', '洗护指南', '质量问题处理', '店铺介绍与客服时间', '常见问题FAQ'], /签收后\s*15\s*天内/],
    [['退换货政策', '优惠与会员', '质量问题处理', '店铺介绍与客服时间', '常见问题FAQ'], /金卡会员免退货运费/],
    [['发货与物流', '优惠与会员', '店铺介绍与客服时间', '常见问题FAQ'], /满\s*99\s*元包邮/],
    [['退换货政策', '发票说明', '质量问题处理', '退款时效说明', '常见问题FAQ'], /商家确认收到退货后\s*24\s*小时内发起退款/],
    [['退换货政策', '发票说明', '质量问题处理', '退款时效说明', '常见问题FAQ'], /原路退回\s*1[–—-]3\s*个工作日/],
    [['发货与物流', '店铺介绍与客服时间', '常见问题FAQ'], /付款后\s*48\s*小时内/],
    [['发票说明', '常见问题FAQ'], /1\s*个工作日内开具/],
  ];
  for (const [names, pattern] of facts) for (const name of names) assert.match(docs[name], pattern, `${name} 缺少政策事实 ${pattern}`);
  for (const [name, text] of Object.entries(docs)) {
    const length = Array.from(text.replace(/\s/g, '')).length;
    assert(length >= 400 && length <= 1200, `${name} 字数 ${length}，需 400–1200`);
    assert(/^# /m.test(text) && (text.match(/^## /gm)?.length ?? 0) >= 2, `${name} 缺少二级标题`);
    // Catch conflicting numbers even if a correct copy of the policy still exists elsewhere.
    const compact = text.replace(/\s/g, '');
    for (const match of compact.matchAll(/(\d+)天(?:内)?(?:（含第\d+天）)?(?:的)?无理由/g)) assert.equal(match[1], '7', `${name} 无理由期限冲突`);
    for (const match of compact.matchAll(/签收后(\d+)天内(?:可)?申请质量问题/g)) assert.equal(match[1], '15', `${name} 质量问题期限冲突`);
    for (const match of compact.matchAll(/满(?:¥)?(\d+)(?:元)?包邮/g)) assert.equal(match[1], '99', `${name} 包邮门槛冲突`);
    for (const match of compact.matchAll(/付款后(\d+)小时内/g)) assert.equal(match[1], '48', `${name} 发货时效冲突`);
    for (const match of compact.matchAll(/收到退(?:货|件|回件)后(\d+)小时内/g)) assert.equal(match[1], '24', `${name} 退件处理时效冲突`);
    assert(!/(?:金卡会员|金卡)(?:需|需要|应|由买家)承担退货运费/.test(compact), `${name} 金卡运费冲突`);
  }
  for (const id of ['P007', 'P013', 'P002']) assert(docs['洗护指南'].includes(id), `洗护指南缺 ${id}`);
  for (const material of ['羊毛', '真丝', '粘胶', '棉', '聚酯']) assert(docs['洗护指南'].includes(material), `洗护指南缺 ${material}`);
  const table = docs['尺码指南'].split('\n').filter(line => /^\| (XS|S|M|L|XL) \|/.test(line));
  assert.deepEqual(table, ['| XS | 150–154 | 40–44 | 80 | 62 |', '| S | 155–159 | 45–49 | 84 | 66 |',
    '| M | 160–164 | 50–54 | 88 | 70 |', '| L | 165–169 | 55–61 | 92 | 74 |', '| XL | 170–175 | 62–70 | 96 | 78 |'], '知识库尺码表');
  assert.equal((docs['常见问题FAQ'].match(/\*\*\d+\./g) ?? []).length, 15, 'FAQ 条数');
}

if (process.argv[1]?.endsWith('/check-seed.ts')) {
  try { checkSeed(process.argv[2], process.argv[3]); }
  catch (error) { console.error(`check-seed 失败：${error instanceof Error ? error.message : error}`); process.exitCode = 1; }
}
