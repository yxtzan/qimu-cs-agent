import { DEMO_NOW } from "@/lib/demo-clock";

/** "已等 19 分钟" / "已等 1 小时 5 分钟"。以 DEMO_NOW 为"现在"（静态值，SSR 与浏览器一致）。 */
export function waitText(sinceIso: string): string {
  const min = Math.max(0, Math.floor((Date.parse(DEMO_NOW) - Date.parse(sinceIso)) / 60000));
  if (min < 1) return "刚刚进入";
  if (min < 60) return `已等 ${min} 分钟`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `已等 ${h} 小时 ${m} 分钟` : `已等 ${h} 小时`;
}

/** → "09:41"（ISO 本身带 +08:00，直接截取）。 */
export function clockTime(iso: string): string {
  return iso.slice(11, 16);
}

/** 消息气泡旁的时间：当天只显示 "09:41"，否则 "10-04 16:20"。 */
export function bubbleTime(iso: string): string {
  return iso.slice(0, 10) === DEMO_NOW.slice(0, 10) ? clockTime(iso) : `${iso.slice(5, 10)} ${clockTime(iso)}`;
}
