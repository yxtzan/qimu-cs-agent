import type { Logistics, Order, OrderStatus } from '../types';

const SHIP_WINDOW_MS = 48 * 60 * 60 * 1000;

export interface ShippedTrack {
  orderId: string;
  shipped: true;
  logistics: Logistics;
}

/** 未发货不报错。只有已付款订单才给预计发货时间（付款时间 + 48 小时）。 */
export interface UnshippedTrack {
  orderId: string;
  shipped: false;
  status: OrderStatus;
  expectedShipBy?: string;
}

export type LogisticsTrack = ShippedTrack | UnshippedTrack;

/** 付款时间加 48 小时，写成 +08:00，和订单里的时间同一格式。 */
export function expectedShipBy(paidAt: string): string {
  const wall = new Date(Date.parse(paidAt) + SHIP_WINDOW_MS + 8 * 3600 * 1000);
  return wall.toISOString().replace(/\.\d{3}Z$/, '+08:00');
}

export function trackLogistics(order: Order): LogisticsTrack {
  if (order.logistics) return { orderId: order.id, shipped: true, logistics: order.logistics };
  const result: UnshippedTrack = { orderId: order.id, shipped: false, status: order.status };
  if (order.status === 'paid' && order.paidAt) result.expectedShipBy = expectedShipBy(order.paidAt);
  return result;
}
