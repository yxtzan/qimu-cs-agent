import { DEMO_NOW } from '../demo-clock';
import type { Buyer, Product, ProductCategory, Order, OrderStatus, Coupon, Rule } from '../types';
import { readCollection, writeCollection } from './index';

export const productCategories: ProductCategory[] = ['连衣裙', '上衣', '针织衫', '外套', '裤装', '半身裙'];
export const orderStatuses: OrderStatus[] = ['pending_payment', 'paid', 'shipped', 'delivered', 'completed', 'cancelled'];

function update<T extends { id: string }>(name: string, id: string, patch: Partial<Omit<T, 'id'>>): T | undefined {
  const rows = readCollection<T>(name);
  const index = rows.findIndex(row => row.id === id);
  if (index < 0) return undefined;
  const next = { ...rows[index], ...patch, id };
  writeCollection(name, rows.map((row, i) => i === index ? next : row));
  return next;
}
export function listProducts(filters: { category?: ProductCategory; q?: string } = {}): Product[] {
  const q = filters.q?.trim().toLocaleLowerCase();
  return readCollection<Product>('products').filter(p =>
    (!filters.category || p.category === filters.category) &&
    (!q || [p.name, ...p.tags].some(text => text.toLocaleLowerCase().includes(q)))
  ).sort((a, b) => b.sales - a.sales);
}
export const getProduct = (id: string) => readCollection<Product>('products').find(p => p.id === id);
export const updateProduct = (id: string, patch: Partial<Omit<Product, 'id'>>) => update<Product>('products', id, patch);
export const listBuyers = () => readCollection<Buyer>('buyers');
export const getBuyer = (id: string) => listBuyers().find(b => b.id === id);
export const updateBuyer = (id: string, patch: Partial<Omit<Buyer, 'id'>>) => update<Buyer>('buyers', id, patch);
export function listOrders(buyerId: string, status?: OrderStatus): Order[] {
  return readCollection<Order>('orders').filter(o => o.buyerId === buyerId && (!status || o.status === status))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
export const getOrder = (id: string) => readCollection<Order>('orders').find(o => o.id === id);
export const updateOrder = (id: string, patch: Partial<Omit<Order, 'id'>>) => update<Order>('orders', id, patch);
export function listCoupons(buyerId: string): Coupon[] {
  return readCollection<Coupon>('coupons').filter(c => c.buyerId === buyerId && !c.used && Date.parse(c.expiresAt) > Date.parse(DEMO_NOW));
}
export const getCoupon = (id: string) => readCollection<Coupon>('coupons').find(c => c.id === id);
export const updateCoupon = (id: string, patch: Partial<Omit<Coupon, 'id'>>) => update<Coupon>('coupons', id, patch);
export const listRules = () => readCollection<Rule>('rules');
export const getRule = (id: string) => listRules().find(r => r.id === id);
export const updateRule = (id: string, patch: Partial<Omit<Rule, 'id'>>) => update<Rule>('rules', id, patch);
