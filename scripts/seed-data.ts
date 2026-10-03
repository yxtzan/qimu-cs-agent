import { DEMO_NOW } from '../lib/demo-clock';
import type { Buyer, Product, ProductCategory, Size, Fit, Order, OrderStatus, AfterSale, Coupon, Rule } from '../lib/types';
import type { StoreInfo, SizeChartRow } from '../lib/store/seed-types';
import { heroProducts, heroBuyers, heroOrders, heroCoupons, demoAddress } from './seed-heroes';

const DAY = 86400000;
const anchor = Date.parse(DEMO_NOW);
export function iso(ms: number): string {
  return new Date(ms + 8 * 3600000).toISOString().replace('Z', '+08:00');
}
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
export const store: StoreInfo = {
  name: '栖木 QIMU', slogan: '慢一点，穿久一点', audience: '25–35 岁通勤 / 日常女装',
  priceRange: [129, 899], humanServiceHours: '9:00–23:00', aiServiceHours: 24, agentName: '阿栖',
  freeShippingThreshold: 99, defaultCarrier: '中通快递', goldCarrier: '顺丰速运', shippingWithinHours: 48,
};
export const sizeChart: SizeChartRow[] = [
  { size: 'XS', heightCm: [150, 154], weightKg: [40, 44], bustCm: 80, waistCm: 62 },
  { size: 'S', heightCm: [155, 159], weightKg: [45, 49], bustCm: 84, waistCm: 66 },
  { size: 'M', heightCm: [160, 164], weightKg: [50, 54], bustCm: 88, waistCm: 70 },
  { size: 'L', heightCm: [165, 169], weightKg: [55, 61], bustCm: 92, waistCm: 74 },
  { size: 'XL', heightCm: [170, 175], weightKg: [62, 70], bustCm: 96, waistCm: 78 },
];
const ruleRows: [string, string, Rule['intent'], number, number, number][] = [
  ['转人工', '人工|真人|转客服', 'human_request', 12, 41, 0],
  ['查物流', '^(到哪了|物流|查物流|快递到哪了?|发货了吗)[?？!！。]*$', 'logistics_track', 10, 63, 2],
  ['退款进度', '退款(进度|到哪|到账|什么时候到)', 'refund_progress', 12, 37, 1],
  ['打招呼', '^(你好|您好|在吗|在不在|hi|hello)[?？!！~。]*$', 'greeting', 8, 88, 0],
  ['发票', '发票', 'invoice', 10, 12, 1], ['运费险', '运费险', 'return_policy', 12, 9, 0],
  ['尺码（宽泛）', '尺码', 'size_recommend', 20, 23, 9], ['优惠码', '优惠码', 'promotion', 10, 0, 0],
];
export const rules: Rule[] = ruleRows.map(([name, pattern, intent, maxLen, hitCount, misfireCount], i) => ({
  id: `R${String(i + 1).padStart(3, '0')}`, name, pattern, intent, maxLen, enabled: true,
  hitCount, misfireCount, createdAt: '2026-09-01T10:00:00+08:00',
  ...(hitCount ? { lastHitAt: iso(anchor - (i % 6 + 1) * DAY) } : {}),
}));

export function generateSeed() {
  const random = rng(20261005);
  const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const pick = <T,>(items: T[]): T => items[int(0, items.length - 1)];
  const sizes: Size[] = ['XS', 'S', 'M', 'L', 'XL'];
  // Six products in every category; fixed hero IDs keep the demo stable.
  const categoryIds: [ProductCategory, number[]][] = [
    ['连衣裙', [1, 2, 3, 4, 5, 6]], ['外套', [7, 8, 9, 10, 11, 12]],
    ['上衣', [13, 14, 15, 16, 17, 18]], ['裤装', [19, 20, 21, 22, 23, 24]],
    ['针织衫', [25, 26, 27, 28, 29, 30]], ['半身裙', [31, 32, 33, 34, 35, 36]],
  ];
  const names: Record<ProductCategory, string[]> = {
    连衣裙: ['轻盈褶裥长裙', '碎花系带裙', '柔光收腰连衣裙', '方领泡袖裙', '细格衬衫裙', '垂感背心长裙'],
    外套: ['翻领混纺大衣', '轻量绗缝短外套', '双排扣风衣', '落肩西装外套', '柔软短夹克', '立领呢外套'],
    上衣: ['垂感衬衫', '小圆领棉衬衫', '细条纹衬衫', '方领短袖上衣', '柔软长袖打底衫', '褶边领衬衫'],
    裤装: ['垂感阔腿长裤', '棉感锥形裤', '直筒西装裤', '侧褶通勤裤', '松紧腰休闲裤', '九分微喇裤'],
    针织衫: ['细针圆领套衫', '落肩V领针织', '短款扣式开衫', '柔软高领套衫', '纹理针织背心', '圆领开衫'],
    半身裙: ['垂感伞摆半身裙', '细褶中长裙', '高腰直筒裙', '棉感A字裙', '侧扣裹身裙', '斜裁缎感裙'],
  };
  const products: Product[] = categoryIds.flatMap(([category, ids]) => ids.map((n, i) => {
    const id = `P${String(n).padStart(3, '0')}`;
    const hero = heroProducts.find(p => p.id === id);
    if (hero) return structuredClone(hero);
    const colors = i % 2 ? ['米白', '墨黑', '浅咖'] : ['雾蓝', '浅灰'];
    const fit: Fit = pick(['标准', '宽松', '修身']);
    const knit = category === '针织衫' || category === '外套';
    return { id, name: names[category][i], category, price: int(13, category === '外套' ? 89 : 49) * 10 - 1,
      colors, sizes: i % 3 ? sizes : sizes.slice(1), fit,
      material: knit ? '羊毛 30% 腈纶 50% 锦纶 20%' : '棉 65% 聚酯纤维 35%',
      care: knit ? '中性洗剂冷水轻柔手洗，勿拧绞，平铺阴干。' : '深浅色分开，冷水轻柔洗涤，反面阴干，不高温烘干。',
      description: `${names[category][i]}采用${fit}版型，方便日常通勤搭配。选择尺码时请参考身高体重和量体数据。`,
      highlights: ['日常通勤', `${fit}版型`, '易于搭配'], images: [], sales: int(12, 900), rating: int(43, 49) / 10,
      skus: colors.flatMap((color, c) => (i % 3 ? sizes : sizes.slice(1)).map(size => {
        const stock = random() < 0.11 ? 0 : int(2, 35);
        return { skuId: `${id}-C${c + 1}-${size}`, color, size, stock,
          ...(stock === 0 && random() < 0.6 ? { restockDate: '2026-10-12T10:00:00+08:00' } : {}) };
      })), tags: ['通勤', pick(['日常', '新品', '秋冬'])] };
  }));
  const nicknames = ['赵可心', '许安宁', '李沐晴', '宋佳禾', '何知夏', '沈亦宁', '温晓晴', '顾南枝', '郑悦'];
  const buyers: Buyer[] = [...structuredClone(heroBuyers), ...nicknames.map((nickname, i) => ({
    id: `B${String(i + 4).padStart(3, '0')}`, nickname, avatar: '',
    memberLevel: pick<Buyer['memberLevel']>(['普通', '银卡', '金卡']), heightCm: int(150, 175), weightKg: int(40, 70),
    defaultAddress: demoAddress(nickname, i + 4),
  }))];
  const statuses: OrderStatus[] = [
    ...Array<OrderStatus>(40).fill('completed'), ...Array<OrderStatus>(11).fill('delivered'),
    ...Array<OrderStatus>(9).fill('shipped'), ...Array<OrderStatus>(6).fill('paid'),
    ...Array<OrderStatus>(4).fill('pending_payment'), ...Array<OrderStatus>(14).fill('cancelled'),
  ];
  const ordinaryOrders: Order[] = statuses.map((status, i) => {
    const buyer = buyers[3 + i % 9]; // Preserve the heroes' unique eligible orders.
    const daysAgo = status === 'completed' ? int(10, 59) : status === 'delivered' ? int(4, 8) :
      status === 'shipped' ? int(2, 3) : status === 'paid' || status === 'pending_payment' ? 0 : int(1, 59);
    const created = anchor - daysAgo * DAY - int(1, 8) * 3600000;
    const id = `QM${iso(created).slice(0, 10).replaceAll('-', '')}${String(i + 10).padStart(2, '0')}`;
    const items = Array.from({ length: int(1, 3) }, (_, j) => {
      const p = pick(products);
      const s = pick(p.skus.filter(s => s.stock > 0));
      return { itemId: `${id}-${j + 1}`, productId: p.id, productName: p.name, skuId: s.skuId,
        color: s.color, size: s.size, quantity: 1, unitPrice: p.price, image: '' };
    });
    const totalAmount = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const discount = totalAmount >= 299 && random() < 0.3 ? 30 : 0;
    const paid = created + 5 * 60000;
    const shipped = paid + DAY;
    const delivered = shipped + 2 * DAY;
    const hasShipment = ['shipped', 'delivered', 'completed'].includes(status);
    const hasDelivery = ['delivered', 'completed'].includes(status);
    const order: Order = { id, buyerId: buyer.id, status, items, totalAmount, discount, payAmount: totalAmount - discount,
      createdAt: iso(created), address: buyer.defaultAddress, afterSales: [],
      ...(!['pending_payment', 'cancelled'].includes(status) ? { paidAt: iso(paid) } : {}),
      ...(hasShipment ? { shippedAt: iso(shipped) } : {}), ...(hasDelivery ? { deliveredAt: iso(delivered) } : {}) };
    if (hasShipment) {
      const exception = status === 'shipped' && [51, 52].includes(i);
      order.logistics = { carrier: buyer.memberLevel === '金卡' ? '顺丰速运' : '中通快递',
        trackingNo: `DEMO${id.slice(2)}`, status: hasDelivery ? 'delivered' : exception ? 'exception' : 'in_transit',
        estimatedDelivery: iso(delivered), events: [
          { at: iso(shipped), location: '杭州仓', description: '包裹已揽收' },
          { at: iso(shipped + 2 * 3600000), location: '杭州转运中心', description: '到达杭州转运中心' },
          { at: iso(shipped + 5 * 3600000), location: '杭州转运中心', description: '离开杭州，发往上海' },
          { at: iso(shipped + 9 * 3600000), location: '上海转运中心', description: '到达上海转运中心' },
          { at: iso(shipped + 11 * 3600000), location: '上海浦东配送站', description: exception ? '包裹分拣延迟，正在重新安排配送' : '已到配送站' },
          ...(hasDelivery ? [{ at: iso(delivered), location: '上海浦东配送站', description: '收件人已签收' }] : []),
        ].reverse() };
    }
    return order;
  });
  const reasons = ['腰太紧了', 'M 码偏小，坐下有点勒', '比想象中短', '颜色和图片差好多', '洗了一次就起球',
    '不喜欢了', '肩膀那里有点窄', '想换个颜色试试', '刚拆包就看到袖口开线', '穿上感觉太宽了', '家里已经有类似的了', '裤脚一边长一边短'];
  const afterStatuses: AfterSale['status'][] = ['pending_review', 'approved', 'returning', 'refunding', 'refunded', 'exchange_shipped', 'rejected', 'closed'];
  ordinaryOrders.slice(0, 29).forEach((order, i) => {
    const status = afterStatuses[i % afterStatuses.length];
    const type: AfterSale['type'] = i % 8 === 5 ? 'exchange' : 'return_refund';
    const created = Date.parse(order.deliveredAt!) + DAY;
    const timeline: AfterSale['timeline'] = [{ at: iso(created), status: 'pending_review', note: '申请已提交，待审核' }];
    if (status === 'rejected') timeline.push({ at: iso(created + 3600000), status, note: '照片暂无法确认问题，已说明原因，可补充材料' });
    else if (status === 'closed') timeline.push({ at: iso(created + 3600000), status, note: '买家撤回申请，售后已关闭' });
    else if (status !== 'pending_review') {
      timeline.push({ at: iso(created + 3600000), status: 'approved', note: '已同意，请寄回商品' });
      if (status !== 'approved') timeline.push({ at: iso(created + DAY), status: 'returning', note: '买家已寄回商品' });
      if (['refunding', 'refunded', 'exchange_shipped'].includes(status)) {
        timeline.push({ at: iso(created + 3 * DAY), status: type === 'exchange' ? 'exchange_shipped' : 'refunding',
          note: type === 'exchange' ? '已收到退件，换货新件已发出' : '已收到退件并发起原路退款' });
      }
      if (status === 'refunded') timeline.push({ at: iso(created + 4 * DAY), status, note: '退款已到账' });
    }
    const sourceItem = order.items[0];
    const product = products.find(p => p.id === sourceItem.productId)!;
    const target = product.skus.find(s => s.stock > 0 && s.skuId !== sourceItem.skuId)!;
    order.afterSales.push({ id: `AS${iso(created).slice(0, 10).replaceAll('-', '')}${String(i + 10).padStart(3, '0')}`,
      orderId: order.id, itemId: sourceItem.itemId, type, reason: reasons[i % reasons.length],
      amount: sourceItem.unitPrice * sourceItem.quantity - Math.min(order.discount, sourceItem.unitPrice),
      ...(type === 'exchange' ? { newSize: target.size, newColor: target.color } : {}),
      status, createdAt: iso(created), timeline });
  });
  const coupons: Coupon[] = [...structuredClone(heroCoupons), ...Array.from({ length: 27 }, (_, i) => {
    const threshold = pick([99, 199, 299]);
    const discount = threshold === 99 ? 10 : threshold === 199 ? 20 : 30;
    return { id: `CP${String(i + 4).padStart(3, '0')}`, buyerId: buyers[3 + i % 9].id,
      title: `满 ${threshold} 减 ${discount}`, threshold, discount, scope: pick<Coupon['scope']>(['全店', '外套', '针织衫']),
      expiresAt: i % 6 === 0 ? '2026-09-30T23:59:59+08:00' : '2026-10-31T23:59:59+08:00', used: i % 7 === 0 };
  })];
  return { store, products, buyers, orders: [...structuredClone(heroOrders), ...ordinaryOrders], coupons, size_chart: sizeChart, rules };
}
