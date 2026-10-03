import type { Address, Buyer, Order, Product, Size, Sku, Coupon } from '../lib/types';

const sizes: Size[] = ['XS', 'S', 'M', 'L', 'XL'];
// Hero stock is explicit, independent of the ordinary-data RNG.
function skus(id: string, colors: string[], stocks: number[][]): Sku[] {
  return colors.flatMap((color, c) => sizes.map((size, s) => ({
    skuId: `${id}-C${c + 1}-${size}`, color, size, stock: stocks[c][s],
    ...(id === 'P007' && color === '炭灰' && size === 'L'
      ? { restockDate: '2026-10-12T10:00:00+08:00' } : {}),
  })));
}

export const heroProducts: Product[] = [
  { id: 'P007', name: '燕麦色羊毛混纺大衣', category: '外套', price: 599,
    colors: ['燕麦色', '炭灰'], sizes, fit: '标准', material: '羊毛 70% 锦纶 30%',
    care: '建议专业干洗，勿机洗，通风阴干，收纳时使用宽肩衣架。',
    description: '直身剪裁搭配翻领，里面搭薄针织适合日常通勤。', highlights: ['羊毛混纺', '直身翻领', '双侧插袋'],
    images: [], sales: 426, rating: 4.8, tags: ['通勤', '秋冬'],
    skus: skus('P007', ['燕麦色', '炭灰'], [[6, 8, 12, 3, 5], [5, 6, 9, 0, 4]]) },
  { id: 'P013', name: '云感真丝衬衫', category: '上衣', price: 459,
    colors: ['象牙白', '雾蓝'], sizes, fit: '宽松', material: '桑蚕丝 92% 氨纶 8%',
    care: '用真丝专用中性洗剂轻柔手洗，不搓拧、不暴晒，垫布低温熨烫。',
    description: '柔软真丝带一点弹力，宽松肩线方便活动，浅色内搭建议选肤色。', highlights: ['真丝微弹', '宽松肩线', '通勤衬衫'],
    images: [], sales: 318, rating: 4.7, tags: ['通勤', '真丝'],
    skus: skus('P013', ['象牙白', '雾蓝'], [[5, 8, 10, 7, 3], [4, 7, 11, 6, 2]]) },
  { id: 'P021', name: '高腰直筒西装裤', category: '裤装', price: 329,
    colors: ['黑', '卡其'], sizes, fit: '标准', material: '聚酯纤维 63% 粘胶 33% 氨纶 4%',
    care: '冷水轻柔洗涤，深浅分开，不拧绞，整理裤线后阴干。',
    description: '高腰直筒版型，裤腿留有活动空间，适合配衬衫和短开衫。', highlights: ['高腰直筒', '微弹面料', '侧边口袋'],
    images: [], sales: 502, rating: 4.8, tags: ['通勤', '百搭'],
    skus: skus('P021', ['黑', '卡其'], [[7, 15, 12, 8, 4], [6, 11, 10, 7, 3]]) },
  { id: 'P002', name: '法式碎花茶歇裙', category: '连衣裙', price: 389,
    colors: ['蓝底白花', '黑底黄花'], sizes, fit: '修身', material: '粘胶 100%',
    care: '冷水轻柔手洗，不长时间浸泡、不拧绞，整形阴干，勿高温烘干。',
    description: '腰线收合、裙摆自然散开，碎花适合日常和周末出行。', highlights: ['收腰剪裁', '柔软粘胶', '碎花裙摆'],
    images: [], sales: 367, rating: 4.7, tags: ['碎花', '日常'],
    skus: skus('P002', ['蓝底白花', '黑底黄花'], [[5, 8, 12, 6, 3], [4, 7, 9, 5, 2]]) },
  { id: 'P030', name: '软糯圆领开衫', category: '针织衫', price: 269,
    colors: ['奶白', '燕麦', '雾粉'], sizes, fit: '宽松', material: '羊毛 30% 腈纶 50% 锦纶 20%',
    care: '羊毛中性洗剂轻柔手洗，毛巾吸水后平铺阴干，不悬挂湿衣。',
    description: '圆领宽松开衫，可单穿也可叠搭，肩线柔和不勒手臂。', highlights: ['柔软混纺', '圆领叠搭', '宽松肩线'],
    images: [], sales: 614, rating: 4.8, tags: ['秋冬', '叠搭'],
    skus: skus('P030', ['奶白', '燕麦', '雾粉'], [[8, 13, 15, 7, 5], [5, 9, 12, 6, 3], [6, 11, 10, 8, 4]]) },
];

export function demoAddress(name: string, n: number): Address {
  return { name, phone: `138****${String(1000 + n)}`, region: '上海市 上海市 浦东新区',
    detail: `栖木演示路${n}号虚构小区${n}室（演示地址）` };
}
export const heroBuyers: Buyer[] = [
  { id: 'B001', nickname: '林小满', avatar: '', memberLevel: '金卡', heightCm: 160, weightKg: 50, defaultAddress: demoAddress('林小满', 1) },
  { id: 'B002', nickname: '周雨桐', avatar: '', memberLevel: '银卡', heightCm: 165, weightKg: 54, defaultAddress: demoAddress('周雨桐', 2) },
  { id: 'B003', nickname: '陈思', avatar: '', memberLevel: '普通', heightCm: 158, weightKg: 47, defaultAddress: demoAddress('陈思', 3) },
];

function item(orderId: string, n: number, productId: string, color: string, size: Size) {
  const p = heroProducts.find(p => p.id === productId)!;
  return { itemId: `${orderId}-${n}`, productId, productName: p.name,
    skuId: p.skus.find(s => s.color === color && s.size === size)!.skuId,
    color, size, quantity: 1, unitPrice: p.price, image: '' };
}
function logistics(trackingNo: string, date: string, delivered?: string): NonNullable<Order['logistics']> {
  const events = [
    { at: `${date}T10:00:00+08:00`, location: '杭州仓', description: '包裹已揽收' },
    { at: `${date}T12:00:00+08:00`, location: '杭州转运中心', description: '到达杭州转运中心' },
    { at: `${date}T15:00:00+08:00`, location: '杭州转运中心', description: '已发往上海转运中心' },
    { at: `${date}T19:00:00+08:00`, location: '上海转运中心', description: '到达上海转运中心' },
    { at: `${date}T21:00:00+08:00`, location: '上海浦东配送站', description: '已到达配送站，等待安排派送' },
    ...(delivered ? [{ at: delivered, location: '上海浦东配送站', description: '收件人已签收' }] : []),
  ];
  return { carrier: '顺丰速运', trackingNo, status: delivered ? 'delivered' : 'in_transit',
    estimatedDelivery: delivered ?? '2026-10-06T18:00:00+08:00', events: events.reverse() };
}

export const heroOrders: Order[] = [
  { id: 'QM2026092801', buyerId: 'B001', status: 'delivered',
    items: [item('QM2026092801', 1, 'P007', '燕麦色', 'M')],
    totalAmount: 599, discount: 0, payAmount: 599,
    createdAt: '2026-09-26T10:00:00+08:00', paidAt: '2026-09-26T10:05:00+08:00',
    shippedAt: '2026-09-28T10:00:00+08:00', deliveredAt: '2026-09-30T14:00:00+08:00',
    address: heroBuyers[0].defaultAddress, logistics: logistics('SF0002026092801', '2026-09-28', '2026-09-30T14:00:00+08:00'), afterSales: [] },
  { id: 'QM2026100201', buyerId: 'B001', status: 'shipped',
    items: [item('QM2026100201', 1, 'P021', '黑', 'S'), item('QM2026100201', 2, 'P030', '奶白', 'M')],
    totalAmount: 598, discount: 0, payAmount: 598,
    createdAt: '2026-10-02T10:00:00+08:00', paidAt: '2026-10-02T10:05:00+08:00', shippedAt: '2026-10-03T10:00:00+08:00',
    address: heroBuyers[0].defaultAddress, logistics: logistics('SF0002026100201', '2026-10-03'), afterSales: [] },
  { id: 'QM2026091501', buyerId: 'B001', status: 'completed',
    items: [item('QM2026091501', 1, 'P002', '蓝底白花', 'M')],
    totalAmount: 389, discount: 0, payAmount: 389,
    createdAt: '2026-09-15T10:00:00+08:00', paidAt: '2026-09-15T10:05:00+08:00',
    shippedAt: '2026-09-16T10:00:00+08:00', deliveredAt: '2026-09-18T14:00:00+08:00',
    address: heroBuyers[0].defaultAddress, logistics: logistics('SF0002026091501', '2026-09-16', '2026-09-18T14:00:00+08:00'),
    afterSales: [{ id: 'AS20260920001', orderId: 'QM2026091501', itemId: 'QM2026091501-1', type: 'return_refund', reason: '腰有点紧',
      amount: 389, status: 'refunding', createdAt: '2026-09-20T10:00:00+08:00', timeline: [
        { at: '2026-09-20T10:00:00+08:00', status: 'pending_review', note: '申请退货退款，腰有点紧' },
        { at: '2026-09-20T15:00:00+08:00', status: 'approved', note: '已同意退货，请寄回商品' },
        { at: '2026-09-29T10:00:00+08:00', status: 'returning', note: '买家已寄回，退件运输中' },
        { at: '2026-10-03T10:00:00+08:00', status: 'refunding', note: '商家已收到退货并发起退款，预计 1–3 个工作日原路退回' },
      ] }] },
  { id: 'QM2026092902', buyerId: 'B002', status: 'delivered',
    items: [item('QM2026092902', 1, 'P013', '象牙白', 'M')], totalAmount: 459, discount: 0, payAmount: 459,
    createdAt: '2026-09-29T10:00:00+08:00', paidAt: '2026-09-29T10:05:00+08:00',
    shippedAt: '2026-09-30T10:00:00+08:00', deliveredAt: '2026-10-01T14:00:00+08:00',
    address: heroBuyers[1].defaultAddress, logistics: logistics('SF0002026092902', '2026-09-30', '2026-10-01T14:00:00+08:00'), afterSales: [] },
  { id: 'QM2026100401', buyerId: 'B003', status: 'paid',
    items: [item('QM2026100401', 1, 'P030', '雾粉', 'S')], totalAmount: 269, discount: 0, payAmount: 269,
    createdAt: '2026-10-04T20:55:00+08:00', paidAt: '2026-10-04T21:00:00+08:00', address: heroBuyers[2].defaultAddress, afterSales: [] },
  { id: 'QM2026100402', buyerId: 'B003', status: 'pending_payment',
    items: [item('QM2026100402', 1, 'P021', '卡其', 'S')], totalAmount: 329, discount: 0, payAmount: 329,
    createdAt: '2026-10-05T09:30:00+08:00', address: heroBuyers[2].defaultAddress, afterSales: [] },
];

export const heroCoupons: Coupon[] = [
  { id: 'CP001', buyerId: 'B001', title: '满 299 减 30', threshold: 299, discount: 30, scope: '全店', expiresAt: '2026-10-31T23:59:59+08:00', used: false },
  { id: 'CP002', buyerId: 'B001', title: '满 199 减 20', threshold: 199, discount: 20, scope: '外套', expiresAt: '2026-10-15T23:59:59+08:00', used: false },
  { id: 'CP003', buyerId: 'B001', title: '满 99 减 10', threshold: 99, discount: 10, scope: '全店', expiresAt: '2026-09-30T23:59:59+08:00', used: false },
];
