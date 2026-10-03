import { readCollection } from '../store';
import { getProduct } from '../store/collections';
import type { SizeChartRow } from '../store/seed-types';
import type { Size } from '../types';
import { ToolError } from './types';

export function normalizeWeight(weight: number, unit: 'kg' | '斤' = 'kg'): number {
  return unit === '斤' ? weight / 2 : weight;
}

export function recommendSize(heightCm: number, weightKg: number, productId?: string): { size: Size; basis: string } {
  const rows = readCollection<SizeChartRow>('size_chart');
  if (!Number.isFinite(heightCm) || !Number.isFinite(weightKg)) throw new ToolError('请提供有效的身高和体重');
  // Fill gaps between integer bands upwards, including fractional measurements.
  const band = (value: number, key: 'heightCm' | 'weightKg') => {
    if (value < rows[0][key][0] || value > rows[rows.length - 1][key][1]) return -1;
    return rows.findIndex(row => value <= row[key][1]);
  };
  const h = band(heightCm, 'heightCm');
  const w = band(weightKg, 'weightKg');
  if (h < 0 || w < 0) throw new ToolError('身高或体重超出尺码表范围，建议转人工确认');
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
    if (base === rows.length - 1) throw new ToolError('修身版型需要更大尺码，超出尺码表范围，建议转人工确认');
    chosen++;
    basis += `这款是修身版型，指标在区间上沿，建议大一码选 ${rows[chosen].size}。`;
  }
  if (product && !product.sizes.includes(rows[chosen].size)) throw new ToolError('这件商品没有推荐尺码，建议转人工确认');
  return { size: rows[chosen].size, basis };
}
