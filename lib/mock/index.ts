/**
 * Mock implementations of the shop endpoints (CONTRACTS §1). Used when NEXT_PUBLIC_USE_MOCK is on.
 * Errors mimic the real contract: NOT_FOUND (404) and FORBIDDEN (403).
 */
import type { Buyer, Coupon, Order, OrderStatus, Product, ProductCategory } from "@/lib/types";
import { MOCK_BUYERS, MOCK_COUPONS, MOCK_ORDERS, MOCK_PRODUCTS } from "./data";

export class MockApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "MockApiError";
  }
}

const delay = (ms = 120) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export async function mockGetBuyers(): Promise<Buyer[]> {
  await delay();
  return clone(MOCK_BUYERS);
}

export async function mockGetProducts(params: { category?: ProductCategory; q?: string } = {}): Promise<Product[]> {
  await delay();
  const q = params.q?.trim().toLowerCase();
  const list = MOCK_PRODUCTS.filter((p) => {
    if (params.category && p.category !== params.category) return false;
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.category.includes(q) ||
      p.tags.some((t) => t.toLowerCase().includes(q))
    );
  }).sort((a, b) => b.sales - a.sales);
  return clone(list);
}

export async function mockGetProduct(id: string): Promise<Product> {
  await delay();
  const p = MOCK_PRODUCTS.find((x) => x.id === id);
  if (!p) throw new MockApiError("NOT_FOUND", "没有找到这件商品", 404);
  return clone(p);
}

export async function mockGetOrders(buyerId: string, status?: OrderStatus): Promise<Order[]> {
  await delay();
  const list = MOCK_ORDERS.filter((o) => o.buyerId === buyerId && (!status || o.status === status)).sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  return clone(list);
}

export async function mockGetOrder(id: string, buyerId: string): Promise<Order> {
  await delay();
  const o = MOCK_ORDERS.find((x) => x.id === id);
  if (!o) throw new MockApiError("NOT_FOUND", "没有找到这个订单", 404);
  if (o.buyerId !== buyerId) throw new MockApiError("FORBIDDEN", "这个订单不属于当前买家", 403);
  return clone(o);
}

export async function mockGetCoupons(buyerId: string): Promise<Coupon[]> {
  await delay();
  return clone(MOCK_COUPONS.filter((c) => c.buyerId === buyerId));
}
