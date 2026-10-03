"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createRule, deleteRule, listRules, updateRule } from "@/lib/api-client";
import { relativeTime } from "@/components/shop/format";
import type { IntentId, Rule } from "@/lib/types";
import { INTENT_LABEL, intentLabel } from "./labels";
import { friendlyError } from "@/components/shop/states";
import { BottomSheet, EmptyCard, ErrorCard, PageHeader, Toast } from "./ui";

function errText(e: unknown, fallback: string): string {
  return friendlyError(e, fallback);
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** 误判率（命中为 0 时为 0）。 */
function misfireRate(r: Rule): number {
  return r.hitCount > 0 ? r.misfireCount / r.hitCount : 0;
}

/** "建议删除 / 建议观察"的原因，直接用数字说话——这是"规则层做减法"的证据。 */
function suggestionReason(r: Rule): string | null {
  if (r.suggestion === "delete") {
    if (r.hitCount === 0) return "近 7 天无命中，留着只会增加误判风险";
    return `命中 ${r.hitCount} 次，误判 ${r.misfireCount} 次，误判率 ${pct(misfireRate(r))}`;
  }
  if (r.suggestion === "review") {
    return `命中 ${r.hitCount} 次，误判 ${r.misfireCount} 次，误判率 ${pct(misfireRate(r))}，建议观察`;
  }
  return null;
}

type PatternCheck = { ok: true; re: RegExp } | { ok: false; message: string };

function checkPattern(pattern: string): PatternCheck {
  if (!pattern.trim()) return { ok: false, message: "请填写正则" };
  try {
    return { ok: true, re: new RegExp(pattern) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "无法解析" };
  }
}

// ───────────────────────── 开关 ─────────────────────────

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="-m-1.5 flex h-11 w-[62px] shrink-0 items-center justify-center disabled:opacity-60"
    >
      <span className={`relative h-[28px] w-[48px] rounded-full transition-colors ${checked ? "bg-brand" : "bg-stone-300"}`}>
        <span
          className={`absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow transition-all ${checked ? "left-[23px]" : "left-[3px]"}`}
        />
      </span>
    </button>
  );
}

// ───────────────────────── 规则卡片 ─────────────────────────

function RuleCard({
  rule,
  onToggle,
  onEdit,
  onDelete,
}: {
  rule: Rule;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const reason = suggestionReason(rule);
  const isDelete = rule.suggestion === "delete";
  const isReview = rule.suggestion === "review";
  const rate = misfireRate(rule);

  return (
    <li
      className={`overflow-hidden rounded-card bg-white shadow-card ${
        isDelete ? "ring-2 ring-orange-400" : isReview ? "ring-1 ring-amber-300" : ""
      }`}
    >
      {isDelete ? (
        <div className="flex items-start gap-2.5 bg-orange-500 px-3.5 py-2.5 text-white">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="mt-0.5 shrink-0" fill="currentColor">
            <path d="M12 2.5 22 20.5H2L12 2.5Zm-1 7v5h2v-5h-2Zm0 6.5v2h2v-2h-2Z" fillRule="evenodd" />
          </svg>
          <div className="min-w-0">
            <p className="text-sm font-bold leading-5">建议删除</p>
            <p className="text-[13px] font-medium leading-5 text-white/95">{reason}</p>
          </div>
        </div>
      ) : null}
      {isReview ? (
        <div className="flex items-center gap-2 bg-amber-50 px-3.5 py-2 text-amber-800">
          <span className="rounded bg-amber-200/70 px-1.5 py-px text-[11px] font-bold">建议观察</span>
          <span className="text-xs">{reason}</span>
        </div>
      ) : null}

      <div className={`p-3.5 ${rule.enabled ? "" : "opacity-60"}`}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <code className="shrink-0 rounded bg-stone-100 px-1.5 py-px font-mono text-[11px] font-semibold text-stone-600">{rule.id}</code>
              <h3 className="truncate text-[15px] font-semibold text-foreground">{rule.name}</h3>
            </div>
            <p className="mt-1 text-xs text-warm">
              命中后判定为 <b className="font-semibold text-foreground">{intentLabel(rule.intent)}</b> · 消息 ≤ {rule.maxLen} 字才生效
            </p>
          </div>
          <Switch checked={rule.enabled} onChange={onToggle} label={`${rule.enabled ? "关闭" : "开启"}规则 ${rule.name}`} />
        </div>

        <code className="mt-2 block break-all rounded-lg bg-slate-50 px-2.5 py-2 font-mono text-xs leading-5 text-slate-700 ring-1 ring-slate-200">
          /{rule.pattern}/
        </code>

        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-cream py-2">
            <dd className="text-lg font-semibold tabular-nums leading-6 text-foreground">{rule.hitCount}</dd>
            <dt className="text-[11px] text-warm">命中次数</dt>
          </div>
          <div className={`rounded-lg py-2 ${rule.misfireCount > 0 && isDelete ? "bg-orange-50" : "bg-cream"}`}>
            <dd className={`text-lg font-semibold tabular-nums leading-6 ${isDelete && rule.misfireCount > 0 ? "text-risk" : "text-foreground"}`}>
              {rule.misfireCount}
            </dd>
            <dt className="text-[11px] text-warm">误判次数</dt>
          </div>
          <div className="rounded-lg bg-cream py-2">
            <dd className={`text-lg font-semibold tabular-nums leading-6 ${rate >= 0.3 ? "text-risk" : "text-foreground"}`}>
              {rule.hitCount > 0 ? pct(rate) : "—"}
            </dd>
            <dt className="text-[11px] text-warm">误判率</dt>
          </div>
        </dl>

        {rule.hitCount > 0 ? (
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-brand/15" aria-hidden>
            <div className={`h-full rounded-full ${rate >= 0.3 ? "bg-orange-500" : "bg-brand"}`} style={{ width: `${Math.max(2, Math.round(rate * 100))}%` }} />
          </div>
        ) : null}

        <div className="mt-2.5 flex items-center gap-2">
          <p className="min-w-0 flex-1 text-xs text-warm">
            {rule.lastHitAt ? (
              <>
                最后命中 <time dateTime={rule.lastHitAt} title={rule.lastHitAt.slice(0, 16).replace("T", " ")}>{relativeTime(rule.lastHitAt)}</time>
              </>
            ) : (
              "从未命中"
            )}
          </p>
          {isDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="min-h-[40px] rounded-full bg-orange-500 px-4 text-sm font-semibold text-white active:bg-orange-600"
            >
              删除规则
            </button>
          ) : null}
          <button
            type="button"
            onClick={onEdit}
            className="min-h-[40px] rounded-full border border-line px-4 text-sm font-medium text-foreground active:bg-stone-100"
          >
            编辑
          </button>
        </div>
      </div>
    </li>
  );
}

// ───────────────────────── 新增 / 编辑弹层 ─────────────────────────

interface Draft {
  name: string;
  pattern: string;
  intent: IntentId;
  maxLen: string;
  enabled: boolean;
}

const EMPTY_DRAFT: Draft = { name: "", pattern: "", intent: "product_consult", maxLen: "12", enabled: true };

const INTENT_OPTIONS = (Object.keys(INTENT_LABEL) as IntentId[]).filter((i) => i !== "other");

/** 只在打开时挂载（父组件条件渲染），所以表单初始值直接取自被编辑的规则，无需 effect 重置。 */
function RuleSheet({
  editing,
  onClose,
  onSaved,
  onDeleteRequest,
}: {
  editing: Rule | null;
  onClose: () => void;
  onSaved: (rule: Rule, isNew: boolean) => void;
  onDeleteRequest: (rule: Rule) => void;
}) {
  const [draft, setDraft] = useState<Draft>(
    editing
      ? { name: editing.name, pattern: editing.pattern, intent: editing.intent, maxLen: String(editing.maxLen), enabled: editing.enabled }
      : EMPTY_DRAFT,
  );
  const [sample, setSample] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useMemo(() => checkPattern(draft.pattern), [draft.pattern]);
  const maxLen = Number(draft.maxLen);
  const maxLenOk = Number.isInteger(maxLen) && maxLen >= 1 && maxLen <= 100;
  const canSave = !busy && draft.name.trim() !== "" && check.ok && maxLenOk;

  const sampleResult = useMemo(() => {
    if (!sample.trim() || !check.ok) return null;
    const text = sample.trim();
    if (!check.re.test(text)) return { tone: "none" as const, text: "不会命中这条规则" };
    if (maxLenOk && text.length > maxLen) {
      return { tone: "long" as const, text: `能匹配，但消息有 ${text.length} 字，超过 ${maxLen} 字，不走 L1，交给下一层` };
    }
    return { tone: "hit" as const, text: `会命中，直接判定为「${intentLabel(draft.intent)}」` };
  }, [sample, check, maxLen, maxLenOk, draft.intent]);

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      const body = { name: draft.name.trim(), pattern: draft.pattern, intent: draft.intent, maxLen, enabled: draft.enabled };
      const saved = editing ? await updateRule(editing.id, body) : await createRule(body);
      onSaved(saved, !editing);
    } catch (e) {
      setError(errText(e, "保存失败，请稍后再试"));
      setBusy(false);
    }
  };

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const inputCls = "min-h-[44px] w-full rounded-lg bg-cream px-3 text-base outline-none ring-1 ring-line focus:bg-white focus:ring-brand";

  return (
    <BottomSheet
      open
      title={editing ? `编辑规则 ${editing.id}` : "新增规则"}
      onClose={() => !busy && onClose()}
      footer={
        <div className="space-y-2">
          {error ? (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            {editing ? (
              <button
                type="button"
                onClick={() => onDeleteRequest(editing)}
                disabled={busy}
                className="min-h-[48px] rounded-full px-4 text-sm font-medium text-risk active:bg-orange-50"
              >
                删除
              </button>
            ) : null}
            <button
              type="button"
              onClick={save}
              disabled={!canSave}
              className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-full bg-brand text-base font-semibold text-white transition-colors active:bg-brand-dark disabled:bg-stone-300"
            >
              {busy ? "保存中…" : editing ? "保存修改" : "添加规则"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3.5">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-warm">规则名称</span>
          <input value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="例如：查发票" className={inputCls} />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-warm">正则表达式</span>
          <input
            value={draft.pattern}
            onChange={(e) => set("pattern", e.target.value)}
            placeholder="例如：发票|开票"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={draft.pattern !== "" && !check.ok}
            className={`${inputCls} font-mono text-[15px] ${draft.pattern !== "" && !check.ok ? "ring-red-400 focus:ring-red-500" : ""}`}
          />
          <span className="mt-1 block min-h-[20px] text-xs" aria-live="polite">
            {draft.pattern === "" ? (
              <span className="text-warm">用 | 隔开多个关键词；^ 和 $ 表示整句匹配</span>
            ) : check.ok ? (
              <span className="font-medium text-success">✓ 正则合法</span>
            ) : (
              <span className="text-red-600">
                ✕ 正则不合法，请检查括号和转义
                <span className="mt-0.5 block break-all font-mono text-[11px] text-red-500/80">{check.message}</span>
              </span>
            )}
          </span>
        </label>

        <div className="grid grid-cols-[1fr_96px] gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-warm">命中后判定为</span>
            <select
              value={draft.intent}
              onChange={(e) => set("intent", e.target.value as IntentId)}
              className={`${inputCls} appearance-none`}
            >
              {INTENT_OPTIONS.map((i) => (
                <option key={i} value={i}>
                  {INTENT_LABEL[i]}
                </option>
              ))}
              <option value="other">{INTENT_LABEL.other}</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-warm">最长字数</span>
            <input
              value={draft.maxLen}
              onChange={(e) => set("maxLen", e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              aria-invalid={!maxLenOk}
              className={`${inputCls} text-center tabular-nums ${maxLenOk ? "" : "ring-red-400"}`}
            />
          </label>
        </div>
        <p className="-mt-1.5 text-[11px] leading-4 text-warm">
          消息超过「最长字数」就不走这条规则，交给更聪明的下一层——宁可漏掉，也不要误吞。
        </p>

        <div className="rounded-lg bg-cream p-3 ring-1 ring-line">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-warm">试一句话（看看会不会命中）</span>
            <input
              value={sample}
              onChange={(e) => setSample(e.target.value)}
              placeholder="例如：尺码不合适想退货"
              disabled={!check.ok}
              className="min-h-[44px] w-full rounded-lg bg-white px-3 text-base outline-none ring-1 ring-line focus:ring-brand disabled:opacity-60"
            />
          </label>
          {sampleResult ? (
            <p
              className={`mt-2 text-xs font-medium leading-5 ${
                sampleResult.tone === "hit" ? "text-success" : sampleResult.tone === "long" ? "text-amber-700" : "text-warm"
              }`}
            >
              {sampleResult.tone === "hit" ? "✓ " : sampleResult.tone === "long" ? "△ " : "○ "}
              {sampleResult.text}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between rounded-lg bg-cream px-3 py-1.5 ring-1 ring-line">
          <span className="text-sm font-medium text-foreground">创建后立即开启</span>
          <Switch checked={draft.enabled} onChange={(v) => set("enabled", v)} label="是否开启" />
        </div>
      </div>
    </BottomSheet>
  );
}

// ───────────────────────── 删除确认 ─────────────────────────

function DeleteConfirm({ rule, busy, onCancel, onConfirm }: { rule: Rule | null; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <BottomSheet
      open={rule !== null}
      title="确认删除这条规则？"
      onClose={() => !busy && onCancel()}
      footer={
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-[48px] rounded-full border border-line text-base font-medium text-foreground active:bg-stone-100"
          >
            先留着
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="min-h-[48px] rounded-full bg-red-600 text-base font-semibold text-white active:bg-red-700 disabled:opacity-60"
          >
            {busy ? "删除中…" : "确认删除"}
          </button>
        </div>
      }
    >
      {rule ? (
        <div className="space-y-2 text-sm leading-6">
          <p>
            <b>
              {rule.id} · {rule.name}
            </b>
            <code className="ml-2 break-all font-mono text-xs text-slate-600">/{rule.pattern}/</code>
          </p>
          <p className="text-warm">删除后，这类消息会交给 L2 / L3 去理解，不再被规则直接拦截。已有的命中记录会一并清除。</p>
          {suggestionReason(rule) ? <p className="rounded-lg bg-orange-50 px-3 py-2 text-risk">{suggestionReason(rule)}</p> : null}
        </div>
      ) : null}
    </BottomSheet>
  );
}

// ───────────────────────── 页面 ─────────────────────────

export function RulesScreen() {
  // 规则列表放在本地 state：开关可以先乐观更新、再用服务端返回的规则覆盖，界面不会闪回旧状态
  const [data, setData] = useState<Rule[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [sheet, setSheet] = useState<{ open: boolean; editing: Rule | null }>({ open: false, editing: null });
  const [toDelete, setToDelete] = useState<Rule | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "ok" | "error" } | null>(null);

  const reload = useCallback(() => {
    listRules()
      .then((list) => {
        setData(list);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e : new Error(String(e))));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const showToast = useCallback((message: string, tone: "ok" | "error" = "ok") => {
    setToast({ message, tone });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const rules = useMemo(() => data ?? [], [data]);

  const replaceRule = (next: Rule) => setData((prev) => (prev ?? []).map((r) => (r.id === next.id ? next : r)));

  const toggle = async (rule: Rule, enabled: boolean) => {
    replaceRule({ ...rule, enabled });
    try {
      replaceRule(await updateRule(rule.id, { enabled }));
      showToast(enabled ? `已开启 ${rule.id} ${rule.name}` : `已关闭 ${rule.id} ${rule.name}，这类消息会交给下一层理解`);
    } catch (e) {
      replaceRule(rule);
      showToast(errText(e, "操作失败，请稍后再试"), "error");
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteRule(toDelete.id);
      showToast(`已删除 ${toDelete.id} ${toDelete.name}`);
      setToDelete(null);
      setSheet({ open: false, editing: null });
      reload();
    } catch (e) {
      showToast(errText(e, "删除失败，请稍后再试"), "error");
    } finally {
      setDeleting(false);
    }
  };

  const deleteCount = rules.filter((r) => r.suggestion === "delete").length;
  const sorted = useMemo(() => {
    const rank = (r: Rule) => (r.suggestion === "delete" ? 0 : r.suggestion === "review" ? 1 : 2);
    return [...rules].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
  }, [rules]);

  return (
    <>
      <PageHeader
        title="规则"
        subtitle={data ? `L1 规则层 · ${rules.length} 条${deleteCount ? ` · ${deleteCount} 条建议删除` : ""}` : "L1 规则层：高频、固定、无歧义的问题"}
        right={
          <button
            type="button"
            onClick={() => setSheet({ open: true, editing: null })}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-brand px-4 text-sm font-semibold text-white shadow-card active:bg-brand-dark"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            新增
          </button>
        }
      />

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 pb-6 pt-4">
        {deleteCount > 0 ? (
          <p className="rounded-card border border-orange-200 bg-orange-50 px-3.5 py-3 text-[13px] leading-5 text-orange-900">
            <b>规则层要做减法。</b>误判多、或长期没人命中的规则，留着只会把买家的问题答错——建议直接删掉，交给 L2 去理解。
          </p>
        ) : null}

        {error && !data ? <ErrorCard title="规则暂时没加载出来" message={friendlyError(error, "网络好像不太稳定")} onRetry={reload} /> : null}
        {!data && !error ? (
          <div className="space-y-3" aria-busy>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[200px] animate-pulse rounded-card bg-white shadow-card" />
            ))}
          </div>
        ) : null}
        {data && rules.length === 0 ? (
          <EmptyCard title="还没有规则" hint="规则层适合处理“到哪了”“你好”这类高频、固定的问题。">
            <button
              type="button"
              onClick={() => setSheet({ open: true, editing: null })}
              className="inline-flex min-h-[44px] items-center rounded-full bg-brand px-5 text-sm font-semibold text-white active:bg-brand-dark"
            >
              新增第一条规则
            </button>
          </EmptyCard>
        ) : null}

        <ul className="space-y-3">
          {sorted.map((r) => (
            <RuleCard
              key={r.id}
              rule={r}
              onToggle={(v) => void toggle(r, v)}
              onEdit={() => setSheet({ open: true, editing: r })}
              onDelete={() => setToDelete(r)}
            />
          ))}
        </ul>
      </div>

      {sheet.open ? (
      <RuleSheet
        key={sheet.editing?.id ?? "new"}
        editing={sheet.editing}
        onClose={() => setSheet({ open: false, editing: null })}
        onSaved={(rule, isNew) => {
          setSheet({ open: false, editing: null });
          showToast(isNew ? `已添加 ${rule.id} ${rule.name}` : `已保存 ${rule.id} ${rule.name}`);
          reload();
        }}
        onDeleteRequest={(rule) => setToDelete(rule)}
      />
      ) : null}
      <DeleteConfirm rule={toDelete} busy={deleting} onCancel={() => setToDelete(null)} onConfirm={() => void confirmDelete()} />
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </>
  );
}
