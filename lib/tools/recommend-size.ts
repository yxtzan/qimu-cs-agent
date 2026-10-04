import { readCollection } from '../store';
import { getProduct } from '../store/collections';
import type { SizeChartRow } from '../store/seed-types';
import type { Size } from '../types';
import { ToolError } from './types';

export function normalizeWeight(weight: number, unit: 'kg' | '斤' = 'kg'): number {
  return unit === '斤' ? weight / 2 : weight;
}

export interface SizeRecommendation { outOfRange?: false; size: Size; basis: string }
/**
 * Structured "no safe recommendation" result (D011: flow must not depend on reply wording).
 * - `chart`: the buyer is outside the size chart; `bound` says which end and `limit` is that edge
 *   (e.g. XL: 175cm / 70kg for `max`, XS: 150cm / 40kg for `min`).
 * - `slim_fit`: a slim-fit item would need a size above the chart.
 * - `product_sizes`: the recommended size is not sold for this product.
 */
export type SizeOutOfRange =
  | { outOfRange: true; reason: 'chart' | 'slim_fit'; bound: 'max' | 'min'; limit: { size: Size; heightCm: number; weightKg: number }; maxSize: Size; basis: string }
  | { outOfRange: true; reason: 'product_sizes'; missingSize: Size; maxSize: Size; basis: string };
export type SizeResult = SizeRecommendation | SizeOutOfRange;

export function recommendSize(heightCm: number, weightKg: number, productId?: string): SizeResult {
  const rows = readCollection<SizeChartRow>('size_chart');
  if (!Number.isFinite(heightCm) || !Number.isFinite(weightKg)) throw new ToolError('请提供有效的身高和体重');
  // Fill gaps between integer bands upwards, including fractional measurements.
  const band = (value: number, key: 'heightCm' | 'weightKg') => {
    if (value < rows[0][key][0] || value > rows[rows.length - 1][key][1]) return -1;
    return rows.findIndex(row => value <= row[key][1]);
  };
  const h = band(heightCm, 'heightCm');
  const w = band(weightKg, 'weightKg');
  const edge = (bound: 'max' | 'min') => { const row = bound === 'max' ? rows[rows.length - 1] : rows[0]; return { size: row.size, heightCm: row.heightCm[bound === 'max' ? 1 : 0], weightKg: row.weightKg[bound === 'max' ? 1 : 0] }; };
  const maxSize = rows[rows.length - 1].size;
  const outOfRange = (reason: 'chart' | 'slim_fit', bound: 'max' | 'min', basis: string): SizeOutOfRange => ({ outOfRange: true, reason, bound, limit: edge(bound), maxSize, basis });
  if (h < 0 || w < 0) {
    // Above the top of either band wins: a buyer who is both tall and light is still beyond the chart.
    const above = heightCm > rows[rows.length - 1].heightCm[1] || weightKg > rows[rows.length - 1].weightKg[1];
    return outOfRange('chart', above ? 'max' : 'min', `身高 ${heightCm}cm、体重 ${weightKg}kg 超出本店尺码表范围。`);
  }
  const base = Math.max(h, w);
  let chosen = base;
  const row = rows[base];
  let basis = `身高 ${heightCm}cm 对应 ${rows[h].size}，体重 ${weightKg}kg 对应 ${rows[w].size}，取较大尺码 ${row.size}。`;
  const product = productId ? getProduct(productId) : undefined;
  if (productId && !product) throw new ToolError('没有找到这件商品');
  const lowerHalf = (value: number, range: [number, number]) => value >= range[0] && value <= (range[0] + range[1]) / 2;
  if (product?.fit === '宽松' && base > 0 && lowerHalf(heightCm, row.heightCm) && lowerHalf(weightKg, row.weightKg)) {
    chosen--;
    basis += `这款是宽松版型，喜欢宽松效果可选 ${row.size}，想合身选 ${rows[chosen].size}。`;
  } else if (product?.fit === '修身' && (heightCm >= row.heightCm[1] - 1 || weightKg >= row.weightKg[1] - 1)) {
    if (base === rows.length - 1) return outOfRange('slim_fit', 'max', `这款是修身版型，指标在 ${row.size} 区间上沿，需要比 ${row.size} 更大的尺码。`);
    chosen++;
    basis += `这款是修身版型，指标在区间上沿，建议大一码选 ${rows[chosen].size}。`;
  }
  if (product && !product.sizes.includes(rows[chosen].size)) return { outOfRange: true, reason: 'product_sizes', missingSize: rows[chosen].size, maxSize, basis: `这件商品没有 ${rows[chosen].size} 码。` };
  return { size: rows[chosen].size, basis };
}
