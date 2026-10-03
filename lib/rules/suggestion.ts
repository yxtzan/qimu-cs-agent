/**
 * 规则「建议」计算（ARCHITECTURE §4.4）。后端只返回 suggestion，理由文案由前端拼。
 *
 *   delete  误判率 ≥ 30%（且命中 ≥ 5 次）；或「创建满 7 天且近 7 天没有命中」
 *   review  误判率 ≥ 15%（且命中 ≥ 5 次）
 *   keep    其余；创建不满 7 天的新规则一律 keep
 */
import { now } from "../demo-clock";
import type { Rule } from "../types";

const DAY_MS = 24 * 3600 * 1000;

/** 计算一条规则的建议；nowMs 默认取演示时钟。 */
export function computeSuggestion(rule: Omit<Rule, "suggestion">, nowMs: number = now().getTime()): NonNullable<Rule["suggestion"]> {
  const ageMs = nowMs - Date.parse(rule.createdAt);
  if (ageMs < 7 * DAY_MS) return "keep"; // 新规则还没机会证明自己

  if (rule.hitCount >= 5 && rule.misfireCount / rule.hitCount >= 0.3) return "delete";
  const lastHitMs = rule.lastHitAt ? Date.parse(rule.lastHitAt) : undefined;
  if (lastHitMs === undefined || Number.isNaN(lastHitMs) || nowMs - lastHitMs > 7 * DAY_MS) return "delete";
  if (rule.hitCount >= 5 && rule.misfireCount / rule.hitCount >= 0.15) return "review";
  return "keep";
}

/** 附上 suggestion 字段。 */
export function withSuggestion(rule: Omit<Rule, "suggestion">): Rule {
  return { ...rule, suggestion: computeSuggestion(rule) };
}
