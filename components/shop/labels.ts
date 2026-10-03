import type { AfterSaleStatus, AfterSaleType, Logistics, OrderStatus, ProductCategory } from "@/lib/types";

export const PRODUCT_CATEGORIES: ProductCategory[] = ["连衣裙", "上衣", "针织衫", "外套", "裤装", "半身裙"];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: "待付款",
  paid: "待发货",
  shipped: "已发货",
  delivered: "已签收",
  completed: "已完成",
  cancelled: "已取消",
};

export const ORDER_STATUS_ORDER: OrderStatus[] = [
  "pending_payment",
  "paid",
  "shipped",
  "delivered",
  "completed",
  "cancelled",
];

/** Tone → Tailwind classes. Keep the palette quiet: green = good, orange = needs attention, gray = neutral. */
export type Tone = "green" | "orange" | "gray" | "blue";

export const TONE_CLASS: Record<Tone, string> = {
  green: "bg-brand-soft text-brand",
  orange: "bg-[#fbeee6] text-risk",
  gray: "bg-[#efece5] text-warm",
  blue: "bg-[#e8edf3] text-[#4b6580]",
};

export const ORDER_STATUS_TONE: Record<OrderStatus, Tone> = {
  pending_payment: "orange",
  paid: "blue",
  shipped: "blue",
  delivered: "green",
  completed: "green",
  cancelled: "gray",
};

export const AFTER_SALE_STATUS_LABEL: Record<AfterSaleStatus, string> = {
  pending_review: "待审核",
  approved: "已同意，待寄回",
  returning: "已寄回",
  refunding: "退款中",
  refunded: "已退款",
  exchange_shipped: "换货已发出",
  rejected: "已拒绝",
  closed: "已关闭",
};

export const AFTER_SALE_STATUS_TONE: Record<AfterSaleStatus, Tone> = {
  pending_review: "orange",
  approved: "blue",
  returning: "blue",
  refunding: "orange",
  refunded: "green",
  exchange_shipped: "green",
  rejected: "gray",
  closed: "gray",
};

export const AFTER_SALE_TYPE_LABEL: Record<AfterSaleType, string> = {
  refund_only: "仅退款",
  return_refund: "退货退款",
  exchange: "换货",
};

export const LOGISTICS_STATUS_LABEL: Record<Logistics["status"], string> = {
  awaiting_pickup: "待揽收",
  in_transit: "运输中",
  out_for_delivery: "派送中",
  delivered: "已签收",
  exception: "物流异常",
};

/** 颜色名 → 色块（仅用于商品详情页的色点，找不到时用暖灰）。 */
export const COLOR_SWATCH: Record<string, string> = {
  燕麦色: "#d9c7a7",
  燕麦: "#d9c7a7",
  炭灰: "#4a4a4a",
  深灰: "#5b5b5b",
  象牙白: "#f4efe3",
  奶白: "#f6f1e7",
  米白: "#efe9db",
  雾蓝: "#9db0c2",
  黑: "#1f1f1f",
  卡其: "#bfa77f",
  蓝底白花: "#6f8fb5",
  黑底黄花: "#2a2a2a",
  雾粉: "#e5c7c8",
  墨绿: "#2f4f3e",
  驼色: "#b98d5b",
};

/** 尺码表（docs/DATA_SPEC.md §4），商品详情页展示用。 */
export const SIZE_CHART = [
  { size: "XS", height: "150–154", weight: "40–44", bust: 80, waist: 62 },
  { size: "S", height: "155–159", weight: "45–49", bust: 84, waist: 66 },
  { size: "M", height: "160–164", weight: "50–54", bust: 88, waist: 70 },
  { size: "L", height: "165–169", weight: "55–61", bust: 92, waist: 74 },
  { size: "XL", height: "170–175", weight: "62–70", bust: 96, waist: 78 },
] as const;
