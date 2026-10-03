"use client";

import Link from "next/link";
import { useState } from "react";
import { resetDemo, USE_MOCK } from "@/lib/api-client";
import { DEMO_NOW } from "@/lib/demo-clock";
import { friendlyError } from "@/components/shop/states";
import pkg from "@/package.json";
import { BottomSheet, Toast } from "./ui";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[48px] items-center justify-between gap-3 px-4 py-2.5">
      <span className="text-sm text-warm">{label}</span>
      <span className="min-w-0 text-right text-sm font-medium text-foreground">{children}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-[13px] font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

/** 卖家端「设置」：当前模式、版本信息、重置演示数据（二次确认）。 */
export function SettingsScreen() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const demoTime = DEMO_NOW.slice(0, 16).replace("T", " ");

  const doReset = async () => {
    setBusy(true);
    setError(null);
    try {
      await resetDemo();
      setConfirmOpen(false);
      setDone(true);
      // 重置后整页刷新：让内存里的订单 / 知识库 / 会话列表全部回到初始状态
      setTimeout(() => window.location.assign(new URL("/seller", window.location.origin).href), 1100);
    } catch (e) {
      setError(friendlyError(e, "重置没有成功，数据没有被改动，请稍后再试"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="shrink-0 border-b border-line bg-cream pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center gap-1 px-4">
          <Link
            href="/seller"
            aria-label="返回会话列表"
            className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground active:bg-brand-soft"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 5-7 7 7 7" />
            </svg>
          </Link>
          <h1 className="text-[20px] font-semibold text-foreground">设置</h1>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 pb-8 pt-4">
        <Section title="当前模式">
          <div className="rounded-card bg-white p-4 shadow-card">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${USE_MOCK ? "bg-amber-500" : "bg-success"}`} />
              <span data-testid="mode-label" className="text-[17px] font-semibold text-foreground">
                {USE_MOCK ? "演示数据（mock）" : "真实后端"}
              </span>
            </div>
            <p className="mt-1.5 text-sm leading-6 text-warm">
              {USE_MOCK
                ? "现在用的是浏览器里的演示数据，不会请求后端，也不会花钱。买家端和卖家端要在同一个浏览器里打开才能互相看到。"
                : "现在连接的是真实后端，消息会走完整的 风险闸门 → L1 → L2 → L3 流程。"}
            </p>
          </div>
        </Section>

        <Section title="版本信息">
          <div className="divide-y divide-line rounded-card bg-white shadow-card">
            <Row label="应用">栖木商家 · 客服 Agent 演示</Row>
            <Row label="版本">v{pkg.version}</Row>
            <Row label="演示时间起点">{demoTime}</Row>
          </div>
        </Section>

        <Section title="演示数据">
          <div className="rounded-card bg-white p-4 shadow-card">
            <p className="text-sm leading-6 text-warm">
              演示过程中把会话、订单、规则搞乱了？一键恢复到初始状态，下一位观众就能从头体验。
            </p>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setConfirmOpen(true);
              }}
              disabled={done}
              data-testid="reset-demo"
              className="mt-3 inline-flex min-h-[48px] w-full items-center justify-center rounded-full border border-risk/40 bg-white text-[15px] font-semibold text-risk transition-colors active:bg-orange-50 disabled:opacity-60"
            >
              重置演示数据
            </button>
          </div>
          <Link
            href="/"
            target="_blank"
            className="flex min-h-[48px] items-center justify-between rounded-card bg-white px-4 text-sm text-foreground shadow-card active:bg-brand-soft/60"
          >
            打开买家端（含「演示指南」）
            <span className="text-warm">↗</span>
          </Link>
        </Section>
      </div>

      <BottomSheet
        open={confirmOpen}
        title="确定要重置演示数据吗？"
        onClose={() => (busy ? undefined : setConfirmOpen(false))}
        footer={
          <div className="flex gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmOpen(false)}
              className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-full bg-stone-100 text-[15px] font-medium text-foreground active:bg-stone-200 disabled:opacity-60"
            >
              取消
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void doReset()}
              data-testid="reset-confirm"
              className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-full bg-risk text-[15px] font-semibold text-white active:opacity-90 disabled:opacity-60"
            >
              {busy ? "重置中…" : "确认重置"}
            </button>
          </div>
        }
      >
        <p className="text-sm leading-6 text-warm">以下内容会恢复成最初的样子，且不能撤销：</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-foreground">
          <li>所有买家对话和转人工会话</li>
          <li>你新增、修改或关闭过的规则</li>
          <li>导入或删除过的知识库文档</li>
          <li>订单状态（例如确认换货后的变化）</li>
        </ul>
        <p className="mt-2 text-xs leading-5 text-warm">重置后本页会自动刷新；其他已打开的买家端页面请手动刷新一下。</p>
        {error ? (
          <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </BottomSheet>

      <Toast message={done ? "已重置演示数据，正在刷新…" : null} />
    </>
  );
}
