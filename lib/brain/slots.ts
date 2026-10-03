import type { Slots, Size } from '../types';
import { listProducts } from '../store/collections';

export function extractSlots(text: string, colors = listProducts().flatMap(p => p.colors)): Slots {
  const slots: Slots = {};
  const order = /\bQM\d{10}\b/i.exec(text);
  if (order) slots.orderId = order[0].toUpperCase();
  const product = /\bP\d{3}\b/i.exec(text);
  if (product) slots.productId = product[0].toUpperCase();
  // Bare heights are allowed, but never take a weight or order-number substring.
  const height = /(?:^|[^\dA-Za-z])(1[4-9]\d(?:\.\d+)?)\s*(?:cm|厘米|公分)?(?![\d.]|\s*(?:kg|公斤|千克|斤))/i.exec(text);
  const weight = /(?:^|[^\dA-Za-z])(\d{2,3}(?:\.\d+)?)\s*(kg|公斤|千克|斤)/i.exec(text);
  if (height) slots.heightCm = Number(height[1]);
  if (weight) slots.weightKg = Number(weight[1]) / (weight[2] === '斤' ? 2 : 1);
  const latin = /(?:^|[^A-Za-z])(XXL|XL|XS|S|M|L)(?![A-Za-z])/i.exec(text);
  const chinese = /(加大|超大|小|中|大)码/.exec(text);
  if (latin && latin[1].toUpperCase() !== 'XXL') slots.size = latin[1].toUpperCase() as Size;
  else if (!latin && chinese) slots.size = ({ 小: 'S', 中: 'M', 大: 'L', 加大: 'XL', 超大: 'XL' } as Record<string, Size>)[chinese[1]];
  const color = [...new Set(colors)].sort((a, b) => b.length - a.length).find(c => text.includes(c));
  if (color) slots.color = color;
  // Require explicitly labelled fields rather than inventing a postal address.
  if (/地址|收件|收货/.test(text)) {
    const name = /(?:收件人|姓名)[:：\s]+([^\s,，;；]+)/.exec(text)?.[1];
    const phone = /(?:电话|手机)[:：\s]+([\d*]{7,14})/.exec(text)?.[1];
    const region = /地区[:：\s]+([^,，;；\n]+)/.exec(text)?.[1]?.trim();
    const detail = /(?:详细地址|地址)[:：\s]+([^,，;；\n]+)/.exec(text)?.[1]?.trim();
    if (name || phone || region || detail) slots.address = { ...(name ? { name } : {}), ...(phone ? { phone } : {}), ...(region ? { region } : {}), ...(detail ? { detail } : {}) };
  }
  return slots;
}
