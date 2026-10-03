"use client";

import { useEffect } from "react";
import type { Layer, RiskKey } from "@/lib/types";
import { LAYER_META, RISK_LABEL } from "./labels";

const AVATAR_TONES = [
  "bg-[#D9E4DC] text-[#2F4F3E]",
  "bg-[#E8DFD0] text-[#7A5C2E]",
  "bg-[#DCE3EC] text-[#34527A]",
  "bg-[#EBDCDC] text-[#8A3F3F]",
  "bg-[#E3DCEB] text-[#5E3F8A]",
  "bg-[#E6E4D2] text-[#6B6428]",
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** 买家头像：不依赖网络图片，用昵称首字 + 稳定的底色。 */
export function Avatar({
  id,
  name,
  size = 44,
  className = "",
}: {
  id: string;
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${AVATAR_TONES[hash(id) % AVATAR_TONES.length]} ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {name.slice(0, 1)}
    </span>
  );
}

/** 风险标签（橙色，PRD §7 风险色 #C2410C）。 */
export function RiskChip({ risk }: { risk: RiskKey }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-orange-50 px-1.5 py-0.5 text-[11px] font-medium leading-4 text-risk ring-1 ring-orange-200">
      <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden fill="currentColor">
        <path d="M6 1 11.2 10.5H.8L6 1Zm-.6 3.6v2.9h1.2V4.6H5.4Zm0 3.9v1.1h1.2V8.5H5.4Z" fillRule="evenodd" />
      </svg>
      {RISK_LABEL[risk]}
    </span>
  );
}

export function LayerBadge({ layer }: { layer: Layer }) {
  const meta = LAYER_META[layer];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4 ring-1 ${meta.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

export function MemberBadge({ level }: { level: "普通" | "银卡" | "金卡" }) {
  if (level === "普通") return null;
  const cls = level === "金卡" ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-slate-100 text-slate-600 ring-slate-200";
  return (
    <span className={`rounded px-1.5 py-px text-[10px] font-medium leading-4 ring-1 ${cls}`}>{level}</span>
  );
}

/** 页面顶栏（移动端大标题）。 */
export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="shrink-0 border-b border-line bg-cream px-4 pb-3 pt-[max(env(safe-area-inset-top),14px)]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-7 text-foreground">{title}</h1>
          {subtitle ? <p className="mt-0.5 truncate text-xs text-warm">{subtitle}</p> : null}
        </div>
        {right}
      </div>
    </header>
  );
}

export function Placeholder({ title, note, task }: { title: string; note: string; task: string }) {
  return (
    <>
      <PageHeader title={title} subtitle="栖木商家 · 阿栖" />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-2xl text-brand">栖</span>
        <p className="text-base font-medium text-foreground">{title}建设中</p>
        <p className="text-sm leading-6 text-warm">{note}</p>
        <span className="rounded-full bg-white px-3 py-1 text-xs text-warm ring-1 ring-line">将在 {task} 完成</span>
      </div>
    </>
  );
}

/**
 * 底部弹层：铺满卖家端"手机容器"（外壳已设 relative），不会溢出到桌面背景上。
 * footer 固定在底部，body 可滚动。
 */
export function BottomSheet({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="关闭" onClick={onClose} className="fade-in absolute inset-0 bg-black/40" />
      <div className="sheet-up relative flex max-h-[90%] flex-col rounded-t-[20px] bg-white shadow-lift">
        <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-stone-300" />
        <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-2">
          <h2 className="text-[17px] font-semibold text-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full text-warm active:bg-stone-100"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
        {footer ? <div className="shrink-0 border-t border-line bg-white px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3">{footer}</div> : null}
      </div>
    </div>
  );
}

/** 页面底部浮出的短暂提示（成功 / 失败）。 */
export function Toast({ message, tone = "ok" }: { message: string | null; tone?: "ok" | "error" }) {
  if (!message) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[84px] z-50 flex justify-center px-4">
      <p
        role="status"
        className={`fade-in max-w-full rounded-full px-4 py-2.5 text-sm font-medium text-white shadow-lift ${tone === "ok" ? "bg-brand" : "bg-red-600"}`}
      >
        {message}
      </p>
    </div>
  );
}
