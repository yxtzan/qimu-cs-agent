const DEFAULT_USD_TO_CNY = 7.1;

/** USD → CNY rate, from env `USD_TO_CNY` (default 7.1). */
export function usdToCny(usd: number): number {
  const raw = Number(process.env.USD_TO_CNY);
  const rate = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_USD_TO_CNY;
  return usd * rate;
}

/** Format a USD amount as a CNY string for display, e.g. "¥0.0012". */
export function formatCny(usd: number): string {
  const cny = usdToCny(usd);
  if (cny === 0) return "¥0";
  if (Math.abs(cny) < 0.01) return `¥${cny.toFixed(4)}`;
  if (Math.abs(cny) < 1) return `¥${cny.toFixed(3)}`;
  return `¥${cny.toFixed(2)}`;
}
