/**
 * Mock data for the shop (T10). Shapes follow lib/types.ts strictly.
 * Hero data follows docs/DATA_SPEC.md §3 (buyers B001–B003, products P007/P013/P021/P002/P030,
 * hero orders, B001 coupons). "Now" of the demo world is 2026-10-05T10:00:00+08:00.
 */
import type {
  Address,
  AfterSale,
  Buyer,
  Coupon,
  Logistics,
  Order,
  OrderItem,
  Product,
  Size,
  Sku,
} from "@/lib/types";

// ───────────────────────── helpers ─────────────────────────

const img = (seed: string) => `https://picsum.photos/seed/${seed}/600/800`;
const productImages = (id: string) => [img(id), img(`${id}-b`), img(`${id}-c`)];

interface ColorDef {
  color: string;
  code: string;
}

function makeSkus(
  productId: string,
  colors: ColorDef[],
  sizes: Size[],
  overrides: Record<string, { stock: number; restockDate?: string }> = {},
): Sku[] {
  const skus: Sku[] = [];
  colors.forEach((c, ci) => {
    sizes.forEach((size, si) => {
      const skuId = `${productId}-${c.code}-${size}`;
      const override = overrides[skuId];
      const sku: Sku = {
        skuId,
        color: c.color,
        size,
        stock: override ? override.stock : 6 + ((ci * 5 + si * 7) % 17),
      };
      if (override?.restockDate) sku.restockDate = override.restockDate;
      skus.push(sku);
    });
  });
  return skus;
}

// ───────────────────────── products (8) ─────────────────────────

const P007_COLORS: ColorDef[] = [
  { color: "燕麦色", code: "OAT" },
  { color: "炭灰", code: "CHR" },
];
const P013_COLORS: ColorDef[] = [
  { color: "象牙白", code: "IVY" },
  { color: "雾蓝", code: "MBL" },
];
const P021_COLORS: ColorDef[] = [
  { color: "黑", code: "BLK" },
  { color: "卡其", code: "KHK" },
];
const P002_COLORS: ColorDef[] = [
  { color: "蓝底白花", code: "BLF" },
  { color: "黑底黄花", code: "BYF" },
];
const P030_COLORS: ColorDef[] = [
  { color: "奶白", code: "CRM" },
  { color: "燕麦", code: "OAT" },
  { color: "雾粉", code: "PNK" },
];
const P016_COLORS: ColorDef[] = [
  { color: "墨绿", code: "GRN" },
  { color: "驼色", code: "CML" },
];
const P025_COLORS: ColorDef[] = [
  { color: "米白", code: "WHT" },
  { color: "深灰", code: "GRY" },
];
const P004_COLORS: ColorDef[] = [
  { color: "燕麦", code: "OAT" },
  { color: "黑", code: "BLK" },
];

export const MOCK_PRODUCTS: Product[] = [
  {
    id: "P007",
    name: "燕麦色羊毛混纺大衣",
    category: "外套",
    price: 599,
    originalPrice: 799,
    colors: ["燕麦色", "炭灰"],
    sizes: ["S", "M", "L", "XL"],
    fit: "标准",
    material: "羊毛 70% 锦纶 30%",
    care: "建议干洗；如需水洗请使用羊毛专用洗涤剂，冷水轻柔手洗，平铺晾干，避免暴晒。",
    description:
      "经典的 H 型廓形，面料柔软挺括，肩线自然落下，内搭针织或衬衫都很利落。双面呢工艺让大衣没有扎手感，通勤和周末都能穿。",
    highlights: ["双面呢工艺，柔软不扎手", "H 型廓形，修饰肩线", "暗扣设计，线条干净", "全衬里，保暖不闷"],
    images: productImages("P007"),
    sales: 1286,
    rating: 4.8,
    skus: makeSkus("P007", P007_COLORS, ["S", "M", "L", "XL"], {
      "P007-OAT-L": { stock: 3 },
      "P007-CHR-L": { stock: 0, restockDate: "2026-10-12" },
    }),
    tags: ["新品", "通勤", "秋冬"],
  },
  {
    id: "P013",
    name: "云感真丝衬衫",
    category: "上衣",
    price: 459,
    colors: ["象牙白", "雾蓝"],
    sizes: ["S", "M", "L", "XL"],
    fit: "宽松",
    material: "桑蚕丝 92% 氨纶 8%",
    care: "建议手洗或干洗；水温不超过 30°C，使用中性洗涤剂，不可拧干，阴凉处晾干。",
    description:
      "92% 桑蚕丝，上身有云朵般的轻盈垂坠感。宽松版型不挑身材，扣子到顶是通勤，解开两颗是约会。",
    highlights: ["92% 桑蚕丝，亲肤透气", "宽松版型，不挑身材", "贝母扣，细节精致"],
    images: productImages("P013"),
    sales: 934,
    rating: 4.7,
    skus: makeSkus("P013", P013_COLORS, ["S", "M", "L", "XL"]),
    tags: ["热卖", "通勤"],
  },
  {
    id: "P021",
    name: "高腰直筒西装裤",
    category: "裤装",
    price: 329,
    colors: ["黑", "卡其"],
    sizes: ["S", "M", "L", "XL"],
    fit: "标准",
    material: "聚酯纤维 63% 粘胶 33% 氨纶 4%",
    care: "可机洗，建议使用洗衣袋，30°C 以下水温，反面晾干，低温熨烫。",
    description:
      "高腰直筒，垂坠不易起皱，腿型显直显长。有一点弹力，久坐也不勒。",
    highlights: ["高腰设计，拉长腿部线条", "垂坠感好，不易起皱", "4% 氨纶，舒适有弹性"],
    images: productImages("P021"),
    sales: 2105,
    rating: 4.6,
    skus: makeSkus("P021", P021_COLORS, ["S", "M", "L", "XL"]),
    tags: ["爆款", "通勤"],
  },
  {
    id: "P002",
    name: "法式碎花茶歇裙",
    category: "连衣裙",
    price: 389,
    originalPrice: 459,
    colors: ["蓝底白花", "黑底黄花"],
    sizes: ["XS", "S", "M", "L"],
    fit: "修身",
    material: "粘胶 100%",
    care: "建议冷水手洗，不可漂白，阴凉处晾干，低温熨烫；深色花型首次洗涤请单独洗。",
    description:
      "收腰方领茶歇裙，裙摆自然蓬起，走路带风。选用细腻的粘胶面料，贴身穿着凉爽顺滑。",
    highlights: ["收腰设计，显腰身", "方领，修饰锁骨", "粘胶面料，顺滑凉爽"],
    images: productImages("P002"),
    sales: 1572,
    rating: 4.5,
    skus: makeSkus("P002", P002_COLORS, ["XS", "S", "M", "L"]),
    tags: ["热卖", "约会"],
  },
  {
    id: "P030",
    name: "软糯圆领开衫",
    category: "针织衫",
    price: 269,
    colors: ["奶白", "燕麦", "雾粉"],
    sizes: ["S", "M", "L", "XL"],
    fit: "宽松",
    material: "羊毛 30% 腈纶 50% 锦纶 20%",
    care: "建议冷水手洗，平铺晾干，避免悬挂变形；可用防起球刷轻轻整理。",
    description:
      "软糯亲肤的圆领开衫，宽松的落肩版型，叠穿或单穿都很温柔。蓬松的纱线不易起球。",
    highlights: ["落肩宽松，慵懒自然", "软糯亲肤，不扎手", "珍珠扣，温柔细节"],
    images: productImages("P030"),
    sales: 1893,
    rating: 4.7,
    skus: makeSkus("P030", P030_COLORS, ["S", "M", "L", "XL"]),
    tags: ["热卖", "温柔"],
  },
  {
    id: "P016",
    name: "A 字百褶半身裙",
    category: "半身裙",
    price: 239,
    colors: ["墨绿", "驼色"],
    sizes: ["S", "M", "L", "XL"],
    fit: "标准",
    material: "聚酯纤维 90% 氨纶 10%",
    care: "可机洗，建议使用洗衣袋，30°C 以下水温，悬挂晾干，百褶不需熨烫。",
    description:
      "细密百褶，行走时有轻轻的律动。高腰 A 字剪裁，搭配衬衫或针织都好看。",
    highlights: ["永久定型百褶", "高腰 A 字，显瘦", "内置防走光衬裙"],
    images: productImages("P016"),
    sales: 861,
    rating: 4.4,
    skus: makeSkus("P016", P016_COLORS, ["S", "M", "L", "XL"]),
    tags: ["通勤", "百搭"],
  },
  {
    id: "P025",
    name: "羊绒混纺高领针织衫",
    category: "针织衫",
    price: 499,
    originalPrice: 599,
    colors: ["米白", "深灰"],
    sizes: ["S", "M", "L", "XL"],
    fit: "标准",
    material: "羊毛 60% 羊绒 10% 锦纶 30%",
    care: "建议干洗；手洗请使用羊毛专用洗涤剂，冷水轻柔，平铺晾干。",
    description:
      "加入 10% 羊绒，手感细腻温暖。高领设计锁住暖意，是整个秋冬最实用的单品。",
    highlights: ["含 10% 羊绒，细腻保暖", "高领设计，不勒脖", "罗纹收口，不易变形"],
    images: productImages("P025"),
    sales: 702,
    rating: 4.8,
    skus: makeSkus("P025", P025_COLORS, ["S", "M", "L", "XL"]),
    tags: ["新品", "保暖"],
  },
  {
    id: "P004",
    name: "极简针织连衣裙",
    category: "连衣裙",
    price: 429,
    colors: ["燕麦", "黑"],
    sizes: ["S", "M", "L", "XL"],
    fit: "修身",
    material: "羊毛 20% 粘胶 50% 锦纶 30%",
    care: "建议冷水手洗，平铺晾干，避免暴晒；不可拧干。",
    description:
      "一件就能出门的极简针织连衣裙，贴身但不紧绷，侧边开衩让步伐更自在。",
    highlights: ["一件成型，出门不费脑", "侧开衩，步伐自在", "弹力好，不挑身材"],
    images: productImages("P004"),
    sales: 648,
    rating: 4.6,
    skus: makeSkus("P004", P004_COLORS, ["S", "M", "L", "XL"]),
    tags: ["新品", "极简"],
  },
];

// ───────────────────────── buyers ─────────────────────────

const addr = (name: string, phone: string, region: string, detail: string): Address => ({
  name,
  phone,
  region,
  detail,
});

export const MOCK_BUYERS: Buyer[] = [
  {
    id: "B001",
    nickname: "林小满",
    avatar: "https://picsum.photos/seed/avatar-B001/96/96",
    memberLevel: "金卡",
    heightCm: 160,
    weightKg: 50,
    defaultAddress: addr("林小满", "13800138001", "上海市 浦东新区", "世纪大道 1688 号 3 号楼 1202 室"),
  },
  {
    id: "B002",
    nickname: "周雨桐",
    avatar: "https://picsum.photos/seed/avatar-B002/96/96",
    memberLevel: "银卡",
    heightCm: 165,
    weightKg: 54,
    defaultAddress: addr("周雨桐", "13900139002", "江苏省 南京市 鼓楼区", "中山北路 88 号 2 单元 601"),
  },
  {
    id: "B003",
    nickname: "陈思",
    avatar: "https://picsum.photos/seed/avatar-B003/96/96",
    memberLevel: "普通",
    heightCm: 158,
    weightKg: 47,
    defaultAddress: addr("陈思", "13700137003", "浙江省 杭州市 西湖区", "文三路 478 号 华星时代广场 B 座 906"),
  },
  {
    id: "B004",
    nickname: "吴晓晴",
    avatar: "https://picsum.photos/seed/avatar-B004/96/96",
    memberLevel: "银卡",
    heightCm: 168,
    weightKg: 58,
    defaultAddress: addr("吴晓晴", "13600136004", "广东省 深圳市 南山区", "科技园南区 R3 栋 1801"),
  },
  {
    id: "B005",
    nickname: "郑可心",
    avatar: "https://picsum.photos/seed/avatar-B005/96/96",
    memberLevel: "普通",
    heightCm: 162,
    weightKg: 52,
    defaultAddress: addr("郑可心", "13500135005", "四川省 成都市 锦江区", "东大街 99 号 5 栋 1503"),
  },
  // B006/B007 仅用于卖家端会话 mock（没有订单数据）
  {
    id: "B006",
    nickname: "孙悦然",
    avatar: "https://picsum.photos/seed/avatar-B006/96/96",
    memberLevel: "普通",
    heightCm: 164,
    weightKg: 53,
    defaultAddress: addr("孙悦然", "13300133006", "江苏省 苏州市 姑苏区", "观前街 36 号 4 幢 702"),
  },
  {
    id: "B007",
    nickname: "何雅琪",
    avatar: "https://picsum.photos/seed/avatar-B007/96/96",
    memberLevel: "银卡",
    heightCm: 162,
    weightKg: 55,
    defaultAddress: addr("何雅琪", "13200132007", "湖北省 武汉市 武昌区", "中南路 12 号 3 单元 1101"),
  },
];

// ───────────────────────── orders ─────────────────────────

function item(
  orderId: string,
  index: number,
  productId: string,
  skuColor: string,
  skuId: string,
  size: Size,
  quantity = 1,
): OrderItem {
  const p = MOCK_PRODUCTS.find((x) => x.id === productId);
  if (!p) throw new Error(`mock: unknown product ${productId}`);
  return {
    itemId: `${orderId}-${index}`,
    productId,
    productName: p.name,
    skuId,
    color: skuColor,
    size,
    quantity,
    unitPrice: p.price,
    image: p.images[0],
  };
}

const buyerAddress = (id: string) => MOCK_BUYERS.find((b) => b.id === id)!.defaultAddress;

const LOGISTICS_001: Logistics = {
  carrier: "顺丰速运",
  trackingNo: "SF1380012345678",
  status: "delivered",
  events: [
    { at: "2026-09-30T16:20:00+08:00", location: "上海市 浦东新区", description: "已签收，签收人：本人" },
    { at: "2026-09-30T09:12:00+08:00", location: "上海市 浦东新区", description: "快递员正在派送，请保持电话畅通" },
    { at: "2026-09-30T06:30:00+08:00", location: "上海浦东集散中心", description: "已到达上海浦东集散中心" },
    { at: "2026-09-29T02:40:00+08:00", location: "上海转运中心", description: "已到达上海转运中心" },
    { at: "2026-09-27T21:05:00+08:00", location: "杭州转运中心", description: "已从杭州转运中心发出" },
    { at: "2026-09-27T16:30:00+08:00", location: "杭州仓", description: "杭州仓已揽收" },
  ],
};

const LOGISTICS_100201: Logistics = {
  carrier: "顺丰速运",
  trackingNo: "SF1380098765432",
  status: "in_transit",
  estimatedDelivery: "2026-10-06T18:00:00+08:00",
  events: [
    { at: "2026-10-05T06:30:00+08:00", location: "上海浦东集散中心", description: "已到达上海浦东集散中心，准备派送" },
    { at: "2026-10-04T09:10:00+08:00", location: "上海转运中心", description: "已从上海转运中心发出，下一站：上海浦东集散中心" },
    { at: "2026-10-04T03:20:00+08:00", location: "上海转运中心", description: "已到达上海转运中心" },
    { at: "2026-10-03T19:45:00+08:00", location: "杭州转运中心", description: "已从杭州转运中心发出，下一站：上海转运中心" },
    { at: "2026-10-03T16:30:00+08:00", location: "杭州仓", description: "杭州仓已揽收" },
  ],
};

const LOGISTICS_091501: Logistics = {
  carrier: "顺丰速运",
  trackingNo: "SF1380055512345",
  status: "delivered",
  events: [
    { at: "2026-09-18T15:08:00+08:00", location: "上海市 浦东新区", description: "已签收，签收人：本人" },
    { at: "2026-09-18T09:20:00+08:00", location: "上海市 浦东新区", description: "快递员正在派送，请保持电话畅通" },
    { at: "2026-09-17T07:00:00+08:00", location: "上海转运中心", description: "已到达上海转运中心" },
    { at: "2026-09-14T18:20:00+08:00", location: "杭州仓", description: "杭州仓已揽收" },
  ],
};

const AFTER_SALE_001: AfterSale = {
  id: "AS20260920001",
  orderId: "QM2026091501",
  itemId: "QM2026091501-1",
  type: "return_refund",
  reason: "腰有点紧",
  reasonCategory: "尺码不合适",
  amount: 389,
  status: "refunding",
  createdAt: "2026-09-20T11:30:00+08:00",
  timeline: [
    { at: "2026-09-20T11:30:00+08:00", status: "pending_review", note: "已提交退货退款申请，等待商家审核" },
    { at: "2026-09-20T14:05:00+08:00", status: "approved", note: "商家已同意，请在 7 天内寄回商品（金卡会员免退货运费）" },
    { at: "2026-09-30T10:20:00+08:00", status: "returning", note: "您已寄回商品，顺丰 SF1380077700001" },
    { at: "2026-10-03T15:40:00+08:00", status: "refunding", note: "商家已收到退货，退款处理中，预计 1–3 个工作日原路退回" },
  ],
};

export const MOCK_ORDERS: Order[] = [
  // ── B001 ──
  {
    id: "QM2026092801",
    buyerId: "B001",
    status: "delivered",
    items: [item("QM2026092801", 1, "P007", "燕麦色", "P007-OAT-M", "M")],
    totalAmount: 599,
    discount: 0,
    payAmount: 599,
    createdAt: "2026-09-26T20:15:00+08:00",
    paidAt: "2026-09-26T20:16:00+08:00",
    shippedAt: "2026-09-27T16:30:00+08:00",
    deliveredAt: "2026-09-30T16:20:00+08:00",
    address: buyerAddress("B001"),
    logistics: LOGISTICS_001,
    afterSales: [],
  },
  {
    id: "QM2026100201",
    buyerId: "B001",
    status: "shipped",
    items: [
      item("QM2026100201", 1, "P021", "黑", "P021-BLK-S", "S"),
      item("QM2026100201", 2, "P030", "奶白", "P030-CRM-M", "M"),
    ],
    totalAmount: 598,
    discount: 0,
    payAmount: 598,
    createdAt: "2026-10-02T21:10:00+08:00",
    paidAt: "2026-10-02T21:11:00+08:00",
    shippedAt: "2026-10-03T16:30:00+08:00",
    address: buyerAddress("B001"),
    logistics: LOGISTICS_100201,
    afterSales: [],
    remark: "请尽量工作日送达",
  },
  {
    id: "QM2026091501",
    buyerId: "B001",
    status: "completed",
    items: [item("QM2026091501", 1, "P002", "蓝底白花", "P002-BLF-M", "M")],
    totalAmount: 389,
    discount: 0,
    payAmount: 389,
    createdAt: "2026-09-13T22:05:00+08:00",
    paidAt: "2026-09-13T22:06:00+08:00",
    shippedAt: "2026-09-14T18:20:00+08:00",
    deliveredAt: "2026-09-18T15:08:00+08:00",
    address: buyerAddress("B001"),
    logistics: LOGISTICS_091501,
    afterSales: [AFTER_SALE_001],
  },
  {
    id: "QM2026090801",
    buyerId: "B001",
    status: "cancelled",
    items: [item("QM2026090801", 1, "P016", "墨绿", "P016-GRN-M", "M")],
    totalAmount: 239,
    discount: 0,
    payAmount: 239,
    createdAt: "2026-09-08T19:40:00+08:00",
    address: buyerAddress("B001"),
    afterSales: [],
    remark: "超时未付款，订单已自动取消",
  },
  // ── B002 ──
  {
    id: "QM2026092902",
    buyerId: "B002",
    status: "delivered",
    items: [item("QM2026092902", 1, "P013", "象牙白", "P013-IVY-M", "M")],
    totalAmount: 459,
    discount: 0,
    payAmount: 459,
    createdAt: "2026-09-29T13:20:00+08:00",
    paidAt: "2026-09-29T13:21:00+08:00",
    shippedAt: "2026-09-29T20:00:00+08:00",
    deliveredAt: "2026-10-01T11:45:00+08:00",
    address: buyerAddress("B002"),
    logistics: {
      carrier: "中通快递",
      trackingNo: "ZT7300123456789",
      status: "delivered",
      events: [
        { at: "2026-10-01T11:45:00+08:00", location: "江苏省 南京市 鼓楼区", description: "已签收，签收人：本人" },
        { at: "2026-10-01T08:30:00+08:00", location: "南京鼓楼网点", description: "快递员正在派送，请保持电话畅通" },
        { at: "2026-09-30T22:10:00+08:00", location: "南京转运中心", description: "已到达南京转运中心" },
        { at: "2026-09-29T23:30:00+08:00", location: "杭州转运中心", description: "已从杭州转运中心发出" },
        { at: "2026-09-29T20:00:00+08:00", location: "杭州仓", description: "杭州仓已揽收" },
      ],
    },
    afterSales: [],
  },
  {
    id: "QM2026091202",
    buyerId: "B002",
    status: "completed",
    items: [item("QM2026091202", 1, "P025", "米白", "P025-WHT-M", "M")],
    totalAmount: 499,
    discount: 0,
    payAmount: 499,
    createdAt: "2026-09-12T10:00:00+08:00",
    paidAt: "2026-09-12T10:02:00+08:00",
    shippedAt: "2026-09-12T18:00:00+08:00",
    deliveredAt: "2026-09-15T14:30:00+08:00",
    address: buyerAddress("B002"),
    logistics: {
      carrier: "中通快递",
      trackingNo: "ZT7300098765432",
      status: "delivered",
      events: [
        { at: "2026-09-15T14:30:00+08:00", location: "江苏省 南京市 鼓楼区", description: "已签收，签收人：本人" },
        { at: "2026-09-15T08:50:00+08:00", location: "南京鼓楼网点", description: "快递员正在派送" },
        { at: "2026-09-14T21:00:00+08:00", location: "南京转运中心", description: "已到达南京转运中心" },
        { at: "2026-09-12T18:00:00+08:00", location: "杭州仓", description: "杭州仓已揽收" },
      ],
    },
    afterSales: [],
  },
  // ── B003 ──
  {
    id: "QM2026100401",
    buyerId: "B003",
    status: "paid",
    items: [item("QM2026100401", 1, "P030", "雾粉", "P030-PNK-S", "S")],
    totalAmount: 269,
    discount: 0,
    payAmount: 269,
    createdAt: "2026-10-04T20:58:00+08:00",
    paidAt: "2026-10-04T21:00:00+08:00",
    address: buyerAddress("B003"),
    afterSales: [],
  },
  {
    id: "QM2026100402",
    buyerId: "B003",
    status: "pending_payment",
    items: [item("QM2026100402", 1, "P021", "卡其", "P021-KHK-S", "S")],
    totalAmount: 329,
    discount: 0,
    payAmount: 329,
    createdAt: "2026-10-05T09:30:00+08:00",
    address: buyerAddress("B003"),
    afterSales: [],
  },
  // ── B004 ──
  {
    id: "QM2026100301",
    buyerId: "B004",
    status: "shipped",
    items: [item("QM2026100301", 1, "P004", "黑", "P004-BLK-M", "M")],
    totalAmount: 429,
    discount: 0,
    payAmount: 429,
    createdAt: "2026-10-03T08:20:00+08:00",
    paidAt: "2026-10-03T08:22:00+08:00",
    shippedAt: "2026-10-03T19:00:00+08:00",
    address: buyerAddress("B004"),
    logistics: {
      carrier: "顺丰速运",
      trackingNo: "SF1380011122233",
      status: "in_transit",
      estimatedDelivery: "2026-10-07T18:00:00+08:00",
      events: [
        { at: "2026-10-05T04:10:00+08:00", location: "广州转运中心", description: "已到达广州转运中心" },
        { at: "2026-10-04T10:30:00+08:00", location: "杭州转运中心", description: "已从杭州转运中心发出，下一站：广州转运中心" },
        { at: "2026-10-03T19:00:00+08:00", location: "杭州仓", description: "杭州仓已揽收" },
      ],
    },
    afterSales: [],
  },
  // ── B005 ──
  {
    id: "QM2026092001",
    buyerId: "B005",
    status: "completed",
    items: [item("QM2026092001", 1, "P016", "驼色", "P016-CML-S", "S")],
    totalAmount: 239,
    discount: 0,
    payAmount: 239,
    createdAt: "2026-09-20T15:00:00+08:00",
    paidAt: "2026-09-20T15:02:00+08:00",
    shippedAt: "2026-09-21T10:00:00+08:00",
    deliveredAt: "2026-09-25T13:00:00+08:00",
    address: buyerAddress("B005"),
    logistics: {
      carrier: "中通快递",
      trackingNo: "ZT7300055566677",
      status: "delivered",
      events: [
        { at: "2026-09-25T13:00:00+08:00", location: "四川省 成都市 锦江区", description: "已签收，签收人：门卫代收" },
        { at: "2026-09-25T08:20:00+08:00", location: "成都锦江网点", description: "快递员正在派送" },
        { at: "2026-09-24T20:00:00+08:00", location: "成都转运中心", description: "已到达成都转运中心" },
        { at: "2026-09-21T10:00:00+08:00", location: "杭州仓", description: "杭州仓已揽收" },
      ],
    },
    afterSales: [],
  },
];

// ───────────────────────── coupons ─────────────────────────

export const MOCK_COUPONS: Coupon[] = [
  {
    id: "C001",
    buyerId: "B001",
    title: "满 299 减 30",
    threshold: 299,
    discount: 30,
    scope: "全店",
    expiresAt: "2026-10-31T23:59:59+08:00",
    used: false,
  },
  {
    id: "C002",
    buyerId: "B001",
    title: "满 199 减 20",
    threshold: 199,
    discount: 20,
    scope: "外套",
    expiresAt: "2026-10-15T23:59:59+08:00",
    used: false,
  },
  {
    id: "C003",
    buyerId: "B001",
    title: "满 99 减 10",
    threshold: 99,
    discount: 10,
    scope: "全店",
    expiresAt: "2026-09-30T23:59:59+08:00",
    used: false,
  },
  {
    id: "C004",
    buyerId: "B002",
    title: "满 299 减 30",
    threshold: 299,
    discount: 30,
    scope: "全店",
    expiresAt: "2026-10-31T23:59:59+08:00",
    used: false,
  },
];
