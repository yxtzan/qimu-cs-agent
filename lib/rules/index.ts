/**
 * L1 规则的增删改查（CONTRACTS §5），存在 `rules` 集合（data/runtime/rules.json）。
 * 存储里不保存 suggestion，每次读取时现算。
 */
import { nowIso } from "../demo-clock";
import { readCollection, writeCollection } from "../store";
import type { IntentId, Rule } from "../types";
import { withSuggestion } from "./suggestion";

export { computeSuggestion, withSuggestion } from "./suggestion";

const RULES = "rules";

export type StoredRule = Omit<Rule, "suggestion">;
export type RuleCreateInput = Omit<Rule, "id" | "hitCount" | "misfireCount" | "lastHitAt" | "createdAt" | "suggestion">;
export type RulePatchInput = Partial<Pick<Rule, "name" | "pattern" | "intent" | "maxLen" | "enabled">>;

/** 规则校验 / 查找失败，API 层转成 400 / 404。 */
export class RuleError extends Error {
  constructor(
    public code: "BAD_REQUEST" | "NOT_FOUND",
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "RuleError";
  }
}

// 用 Record 保证 IntentId 新增时这里会编译报错，提醒同步更新。
const INTENT_MAP: Record<IntentId, true> = {
  product_consult: true,
  size_recommend: true,
  stock_check: true,
  promotion: true,
  shipping_policy: true,
  order_status: true,
  logistics_track: true,
  urge_shipping: true,
  modify_order: true,
  cancel_order: true,
  refund_apply: true,
  refund_progress: true,
  exchange: true,
  quality_issue: true,
  return_policy: true,
  invoice: true,
  human_request: true,
  greeting: true,
  multi_step_complex: true,
  other: true,
};

const bad = (message: string) => new RuleError("BAD_REQUEST", message, 400);

function checkName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw bad("规则名称不能为空");
  return value.trim();
}
function checkPattern(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw bad("正则不能为空");
  try {
    new RegExp(value);
  } catch {
    throw bad("正则表达式不合法，请检查括号、转义等写法");
  }
  return value;
}
function checkIntent(value: unknown): IntentId {
  if (typeof value !== "string" || !Object.prototype.hasOwnProperty.call(INTENT_MAP, value)) throw bad("意图不正确");
  return value as IntentId;
}
function checkMaxLen(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 200) throw bad("最大字数需要是 1–200 的整数");
  return value;
}
function checkEnabled(value: unknown): boolean {
  if (typeof value !== "boolean") throw bad("启用状态需要是 true 或 false");
  return value;
}

const readRules = () => readCollection<StoredRule>(RULES);

/** 全部规则（带 suggestion）。 */
export function listRulesWithSuggestion(): Rule[] {
  return readRules().map(withSuggestion);
}

/** 新建规则：校验入参（正则非法 → 400），id 自动取下一个 R0xx，计数从 0 开始。 */
export function createRule(input: unknown): Rule {
  const body = (input ?? {}) as Record<string, unknown>;
  const all = readRules();
  const maxNo = all.reduce((max, r) => Math.max(max, Number(/^R(\d+)$/.exec(r.id)?.[1]) || 0), 0);
  const rule: StoredRule = {
    id: `R${String(maxNo + 1).padStart(3, "0")}`,
    name: checkName(body.name),
    pattern: checkPattern(body.pattern),
    intent: checkIntent(body.intent),
    maxLen: checkMaxLen(body.maxLen),
    enabled: body.enabled === undefined ? true : checkEnabled(body.enabled),
    hitCount: 0,
    misfireCount: 0,
    createdAt: nowIso(),
  };
  writeCollection(RULES, [...all, rule]);
  return withSuggestion(rule);
}

/** 修改规则（只认 name / pattern / intent / maxLen / enabled）；不存在 404，字段不合法 400。 */
export function patchRule(id: string, input: unknown): Rule {
  const body = (input ?? {}) as Record<string, unknown>;
  const all = readRules();
  const index = all.findIndex((r) => r.id === id);
  if (index < 0) throw new RuleError("NOT_FOUND", "没有找到这条规则", 404);
  const patch: RulePatchInput = {};
  if (body.name !== undefined) patch.name = checkName(body.name);
  if (body.pattern !== undefined) patch.pattern = checkPattern(body.pattern);
  if (body.intent !== undefined) patch.intent = checkIntent(body.intent);
  if (body.maxLen !== undefined) patch.maxLen = checkMaxLen(body.maxLen);
  if (body.enabled !== undefined) patch.enabled = checkEnabled(body.enabled);
  const next: StoredRule = { ...all[index], ...patch, id };
  const copy = [...all];
  copy[index] = next;
  writeCollection(RULES, copy);
  return withSuggestion(next);
}

/** 删除规则；不存在 404。 */
export function deleteRule(id: string): void {
  const all = readRules();
  if (!all.some((r) => r.id === id)) throw new RuleError("NOT_FOUND", "没有找到这条规则", 404);
  writeCollection(RULES, all.filter((r) => r.id !== id));
}

/** 误判计数 +1（卖家标记 L1 误判时调用）；规则已被删除则什么都不做，返回 undefined。 */
export function incrementMisfire(id: string): Rule | undefined {
  const all = readRules();
  const index = all.findIndex((r) => r.id === id);
  if (index < 0) return undefined;
  const next: StoredRule = { ...all[index], misfireCount: all[index].misfireCount + 1 };
  const copy = [...all];
  copy[index] = next;
  writeCollection(RULES, copy);
  return withSuggestion(next);
}
