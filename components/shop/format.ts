import { DEMO_NOW } from "@/lib/demo-clock";

export function money(n: number): string {
  return `¥${n.toFixed(2)}`;
}

export function formatSales(n: number): string {
  return n >= 10000 ? `${(n / 10000).toFixed(1)}万` : String(n);
}

/** "2026-10-05T10:00:00+08:00" → "10-05 10:00"（ISO 字符串本身已是 +08:00，直接截取，避免时区偏差）。 */
export function shortDateTime(iso: string): string {
  return `${iso.slice(5, 10)} ${iso.slice(11, 16)}`;
}

/** → "2026-10-05 10:00" */
export function fullDateTime(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

/** → "2026-10-05" */
export function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

/** 相对时间。以 DEMO_NOW 为"现在"（静态值，保证服务端与浏览器渲染一致）。 */
export function relativeTime(iso: string): string {
  const diffMs = Date.parse(DEMO_NOW) - Date.parse(iso);
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day} 天前`;
  return dateOnly(iso);
}

export function maskPhone(phone: string): string {
  return phone.length >= 11 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : phone;
}
