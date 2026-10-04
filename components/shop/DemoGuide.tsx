"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { type ChatTarget, useShop } from "./ShopProvider";

/** 页脚「演示指南」链接通过这个事件打开浮层，避免把状态提到 layout 里。 */
export const OPEN_GUIDE_EVENT = "qimu:open-guide";

interface Step {
  n: number;
  stage: string;
  title: string;
  /** 演示时的买家（只有买家端步骤才有） */
  buyerId?: string;
  buyerFallbackName?: string;
  path: string;
  target?: ChatTarget;
  /** 示例话术：会填进聊天输入框，但不会自动发送 */
  draft?: string;
  /** 这一步你会看到什么 */
  expect: string;
  /** 卖家端 / 看板步骤：在新标签页打开 */
  external?: boolean;
  tip?: string;
}

// 对应 docs/PRD.md §8 演示剧本 6 步；买家 / 订单见 docs/DATA_SPEC.md §3 英雄数据
const STEPS: Step[] = [
  {
    n: 1,
    stage: "售前",
    title: "问尺码和洗护",
    buyerId: "B001",
    buyerFallbackName: "林小满",
    path: "/product/P002",
    target: { productId: "P002" },
    draft: "我 160cm 50kg 穿什么码？这件能机洗吗",
    expect: "一句话里有两个问题：AI 会同时识别「尺码」和「洗护」，查知识库后回答，并引用尺码表。",
  },
  {
    n: 2,
    stage: "售中",
    title: "查物流",
    buyerId: "B001",
    buyerFallbackName: "林小满",
    path: "/orders/QM2026100201",
    target: { orderId: "QM2026100201" },
    draft: "到哪了",
    expect: "只说了三个字也不用追问——订单已自动带上，直接弹出物流时间线卡片。",
  },
  {
    n: 3,
    stage: "售后（多步）",
    title: "换码 + 问优惠券",
    buyerId: "B001",
    buyerFallbackName: "林小满",
    path: "/orders/QM2026092801",
    target: { orderId: "QM2026092801" },
    draft: "上周买的那件外套换成 L，顺便看看有没有券",
    expect: "大模型一步步查：订单 → L 码库存 → 换货确认卡 → 优惠券。点「确认」后，订单状态真的会变。",
  },
  {
    n: 4,
    stage: "高风险",
    title: "过敏 + 投诉威胁",
    buyerId: "B002",
    buyerFallbackName: "周雨桐",
    path: "/orders/QM2026092902",
    target: { orderId: "QM2026092902" },
    draft: "衣服穿了全身起红疹，你们不处理我就去 12315 投诉",
    expect: "风险闸门瞬间拦截（健康 + 投诉威胁），AI 不抢答，直接转人工。开着聊天窗右上角的「调试」能看到。",
  },
  {
    n: 5,
    stage: "卖家端",
    title: "接管转人工的会话",
    path: "/seller",
    external: true,
    expect: "手机宽度的商家端：红点会话 → 看 AI 上下文和转人工原因 → 接管并回复 → 回到买家端，实时收到回复。",
    tip: "先完成第 4 步，卖家端才会出现红点会话。",
  },
  {
    n: 6,
    stage: "看板收尾",
    title: "看 AI 到底省了多少",
    path: "/seller/dashboard",
    external: true,
    expect: "大部分消息在便宜的 L1 / L2 就解决了，贵的大模型 L3 只处理一小部分——这就是路由的价值。",
  },
];

function BookIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 6.5C10.5 5 8 4.5 4.5 4.5v13c3.5 0 6 .5 7.5 2 1.5-1.5 4-2 7.5-2v-13C16 4.5 13.5 5 12 6.5Z" />
      <path d="M12 6.5v13" />
    </svg>
  );
}

export function DemoGuide() {
  const router = useRouter();
  const { ready, buyers, setBuyerId, openChat, chatOpen } = useShop();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(false);
  const [done, setDone] = useState<number[]>([]);

  const show = useCallback(() => {
    setOpen(true);
    setSeen(true);
  }, []);

  useEffect(() => {
    window.addEventListener(OPEN_GUIDE_EVENT, show);
    return () => window.removeEventListener(OPEN_GUIDE_EVENT, show);
  }, [show]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // 聊天窗打开时它占满右侧，这里就不再显示悬浮按钮
  if (!ready) return null;

  const nextN = STEPS.find((s) => !done.includes(s.n))?.n ?? 0;

  const go = (step: Step) => {
    setDone((d) => (d.includes(step.n) ? d : [...d, step.n]));
    setOpen(false);
    if (step.external) {
      window.open(step.path, "_blank", "noopener");
      return;
    }
    // 先切买家，再跳页面。newConversation：不续用上一步的会话，下一条消息不带 conversationId。
    if (step.buyerId) setBuyerId(step.buyerId);
    router.push(step.path);
    openChat({ ...step.target, draft: step.draft, newConversation: true });
  };

  return (
    <>
      {!chatOpen && (
        <button
          type="button"
          onClick={() => (open ? setOpen(false) : show())}
          aria-label="演示指南"
          aria-expanded={open}
          data-testid="guide-fab"
          className="group fixed bottom-[92px] right-6 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-line bg-white text-brand shadow-card transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lift"
        >
          {!seen && <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-brand/20" />}
          <span className="relative">
            <BookIcon />
          </span>
          <span className="pointer-events-none absolute right-full mr-2 whitespace-nowrap rounded-full bg-foreground/85 px-2.5 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100">
            演示指南
          </span>
        </button>
      )}

      {open && !chatOpen && (
        <>
          <button type="button" aria-label="关闭演示指南" onClick={() => setOpen(false)} className="fixed inset-0 z-40 cursor-default" />
          <section
            role="dialog"
            aria-label="演示指南"
            data-testid="guide-panel"
            className="fade-up fixed bottom-[148px] right-6 z-50 flex max-h-[calc(100dvh-172px)] w-[408px] max-w-[calc(100vw-48px)] flex-col overflow-hidden rounded-[16px] border border-line bg-cream shadow-lift"
          >
            <header className="shrink-0 bg-brand px-5 pb-4 pt-4 text-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[17px] font-semibold">演示指南</h2>
                  <p className="mt-1 text-[13px] leading-5 text-white/80">
                    5 分钟走完 6 步。<b className="font-semibold text-white">从第 1 步开始，点「开始」</b>
                    ——会自动切好买家、打开页面和聊天窗，新开一段对话，并把示例话术填好。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="关闭"
                  className="-mr-1.5 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/85 hover:bg-white/15"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                    <path d="m2.5 2.5 9 9m0-9-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </header>

            <ol className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain p-3.5">
              {STEPS.map((s) => {
                const isDone = done.includes(s.n);
                const isNext = s.n === nextN;
                const buyerName = s.buyerId ? (buyers.find((b) => b.id === s.buyerId)?.nickname ?? s.buyerFallbackName) : null;
                return (
                  <li
                    key={s.n}
                    className={`rounded-card bg-white p-3.5 transition ${
                      isNext ? "shadow-card ring-2 ring-brand" : "ring-1 ring-line"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                          isDone ? "bg-success text-white" : isNext ? "bg-brand text-white" : "bg-brand-soft text-brand"
                        }`}
                      >
                        {isDone ? "✓" : s.n}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-[15px] font-semibold text-foreground">{s.title}</span>
                          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] text-brand">{s.stage}</span>
                          {isNext && !isDone && s.n === 1 && !done.length ? (
                            <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-medium text-white">从这里开始</span>
                          ) : null}
                        </div>
                        {s.draft ? (
                          <p className="mt-1.5 rounded-lg bg-cream px-2.5 py-1.5 text-[13px] leading-5 text-foreground">
                            “{s.draft}”
                          </p>
                        ) : null}
                        <p className="mt-1.5 text-xs leading-5 text-warm">{s.expect}</p>
                        {s.tip ? <p className="mt-1 text-xs leading-5 text-risk">{s.tip}</p> : null}
                        <div className="mt-2.5 flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-xs text-warm">
                            {buyerName ? `以「${buyerName}」身份` : s.external ? "新标签页打开" : ""}
                          </span>
                          <button
                            type="button"
                            onClick={() => go(s)}
                            data-testid={`guide-step-${s.n}`}
                            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                              isNext
                                ? "bg-brand text-white hover:bg-brand-dark"
                                : "border border-brand/40 bg-white text-brand hover:bg-brand-soft"
                            }`}
                          >
                            {isDone ? "再来一次" : s.external ? "打开 ↗" : "开始 →"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>

            <footer className="shrink-0 border-t border-line bg-white px-4 py-2.5 text-xs leading-5 text-warm">
              玩乱了？打开卖家端「会话 → 右上角齿轮 → 设置」，可以一键重置演示数据。
            </footer>
          </section>
        </>
      )}
    </>
  );
}
