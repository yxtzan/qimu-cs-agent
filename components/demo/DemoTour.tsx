"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { resetDemo } from "@/lib/api-client";
import type { RouteTrace } from "@/lib/types";
import {
  DEMO_AI_REPLIED,
  DEMO_CONFIRMED,
  DEMO_MESSAGE_SENT,
  DEMO_PREFILL,
  DEMO_SELLER_REPLIED,
  DEMO_START,
  DEMO_TOOK_OVER,
  emitDemo,
  type DemoConfirmDetail,
  type DemoReplyDetail,
} from "./events";
import { FunnelDiagram, RichText, TraceFacts } from "./trace-facts";
import {
  SELLER_REPLY_DRAFT,
  STEPS,
  TRY_SCRIPTS,
  neighbor,
  sellerConversationPath,
  type StepId,
} from "./steps";
import { exitDemo, goTo, hydrateDemo, patchDemo, readDemo, saveTryScript, useDemo } from "./storage";

interface Hole {
  top: number;
  left: number;
  width: number;
  height: number;
  radius: string;
}

interface CardBox {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

const BUYER_BACK = "/orders/QM2026092902";

function lastTour(name: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`);
  return all.length ? all[all.length - 1] : null;
}

function coveredByChatDrawer(el: HTMLElement): boolean {
  const drawer = document.querySelector<HTMLElement>('[data-testid="chat-drawer"]');
  if (!drawer || drawer.getAttribute("aria-hidden") === "true") return false;
  const d = drawer.getBoundingClientRect();
  if (d.width < 20) return false;
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  return cx >= d.left && cx <= d.right;
}

function collectTargets(stepId: StepId, conversationId?: string): HTMLElement[] {
  if (stepId === "s3-done") {
    const order = lastTour("order-aftersale");
    const card = lastTour("aftersale-card");
    if (order && !coveredByChatDrawer(order)) return [order];
    return card ? [card] : [];
  }
  if (stepId === "s5-back" && window.location.pathname.startsWith("/orders")) {
    const bubble = lastTour("seller-bubble");
    return bubble ? [bubble] : [];
  }
  const step = STEPS[stepId];
  if (step.targets?.includes("handoff-row")) {
    const rows = [...document.querySelectorAll<HTMLElement>('[data-tour="handoff-row"]')];
    const hit =
      rows.find((row) => conversationId && (row.getAttribute("href") ?? "").endsWith(`/${conversationId}`)) ?? rows[0];
    return hit ? [hit] : [];
  }
  const names = step.targets ?? [];
  if (step.pick === "first") {
    for (const name of names) {
      const el = lastTour(name);
      if (el) return [el];
    }
    return [];
  }
  const found: HTMLElement[] = [];
  for (const name of names) {
    const el = lastTour(name);
    if (el) found.push(el);
  }
  return found;
}

function focusHole(els: HTMLElement[]): Hole | null {
  if (!els.length) return null;
  let top = Infinity;
  let left = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    top = Math.min(top, r.top);
    left = Math.min(left, r.left);
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
  }
  if (!Number.isFinite(top)) return null;
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const pad = 6;
  top -= pad;
  left -= pad;
  right += pad;
  bottom += pad;
  top = Math.max(8, top);
  left = Math.max(8, left);
  right = Math.min(vw - 8, right);
  bottom = Math.min(vh - 8, bottom);
  if (bottom - top > vh * 0.62) {
    const maxH = Math.min(320, vh * 0.48);
    top = Math.max(8, bottom - maxH);
  }
  const width = right - left;
  const height = bottom - top;
  if (width < 8 || height < 8) return null;
  const radius = els.length === 1 ? getComputedStyle(els[0]).borderRadius || "12px" : "12px";
  return { top, left, width, height, radius };
}

function drawerRect(): DOMRect | null {
  const drawer = document.querySelector<HTMLElement>('[data-testid="chat-drawer"]');
  if (!drawer || drawer.getAttribute("aria-hidden") === "true") return null;
  const rect = drawer.getBoundingClientRect();
  if (rect.width < 20 || rect.right < 8 || rect.left > window.innerWidth - 8) return null;
  return rect;
}

/** 预填话术、输入框、卖家回复框的上沿。卡片不能压住这些字。 */
function composerTop(): number | null {
  const nodes = ["[data-testid='prefill-hint']", "[data-testid='chat-input']", "[data-tour='seller-reply']"]
    .map((sel) => document.querySelector<HTMLElement>(sel))
    .filter((el): el is HTMLElement => Boolean(el));
  const tops = nodes
    .map((el) => el.getBoundingClientRect())
    .filter((rect) => rect.width > 2 && rect.height > 2 && rect.bottom > 0 && rect.top < window.innerHeight)
    .map((rect) => rect.top);
  return tops.length ? Math.min(...tops) : null;
}

function holeInDrawer(hole: Hole | null, drawer: DOMRect | null): boolean {
  if (!hole || !drawer) return false;
  const cx = hole.left + hole.width / 2;
  return cx >= drawer.left && cx <= drawer.right;
}

function placeCard(hole: Hole | null, cardH: number, narrow: boolean): CardBox {
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const drawer = drawerRect();
  const inChat = holeInDrawer(hole, drawer);
  const composer = composerTop();

  if (narrow) {
    const width = vw - 24;
    if (!hole) {
      const maxHeight = vh - 24;
      const top = Math.max(12, (vh - Math.min(cardH, maxHeight)) / 2);
      return { top, left: 12, width, maxHeight };
    }
    let maxHeight = Math.min(vh * 0.38, 300);
    let top = 12;
    const targetLow = hole.top + hole.height / 2 > vh * 0.45;
    if (!inChat && hole && !targetLow) top = Math.max(12, vh - Math.min(cardH, maxHeight) - 12);
    const cardBottom = top + Math.min(cardH, maxHeight);
    if (hole && top < hole.top + hole.height && cardBottom > hole.top) {
      const below = hole.top + hole.height + 12;
      const limit = Math.min(vh - 12, composer ?? vh);
      if (below + 96 < limit) top = below;
    }
    if (composer && top < composer) maxHeight = Math.min(maxHeight, Math.max(96, composer - top - 8));
    if (hole && top < hole.top && top + Math.min(cardH, maxHeight) > hole.top && hole.top > top + 96) {
      maxHeight = Math.min(maxHeight, hole.top - top - 8);
    }
    return { top, left: 12, width, maxHeight };
  }

  if (inChat && drawer) {
    const room = drawer.left - 28;
    const width = Math.min(360, Math.max(220, room));
    const left = Math.max(12, drawer.left - width - 16);
    const top = hole
      ? Math.min(Math.max(12, hole.top - 8), Math.max(12, vh - Math.min(cardH, 320) - 12))
      : 16;
    return { top, left, width, maxHeight: vh - top - 12 };
  }

  const width = Math.min(360, vw - 32);
  const maxHeight = vh - 24;
  if (!hole) {
    return { top: Math.max(16, (vh - Math.min(cardH, maxHeight)) / 2), left: (vw - width) / 2, width, maxHeight };
  }
  const gap = 16;
  const top = Math.min(Math.max(12, hole.top), Math.max(12, vh - cardH - 12));
  let box: CardBox;
  if (hole.left >= width + gap + 12) {
    box = { top, left: Math.max(12, hole.left - width - gap), width, maxHeight: vh - 24 };
  } else if (vw - (hole.left + hole.width) >= width + gap + 12) {
    box = { top, left: hole.left + hole.width + gap, width, maxHeight: vh - 24 };
  } else if (hole.top > cardH + 28) {
    box = { top: hole.top - cardH - gap, left: Math.min(Math.max(12, hole.left), vw - width - 12), width, maxHeight: cardH };
  } else {
    box = {
      top: Math.min(vh - Math.min(cardH, maxHeight) - 12, hole.top + hole.height + gap),
      left: Math.min(Math.max(12, hole.left), vw - width - 12),
      width,
      maxHeight,
    };
  }
  if (drawer && box.left < drawer.right && box.left + box.width > drawer.left) {
    const room = drawer.left - 28;
    if (room >= 200) {
      const w = Math.min(box.width, room);
      return { ...box, left: Math.max(12, drawer.left - w - 16), width: w };
    }
  }
  return box;
}

function near(a: number, b: number) {
  return Math.abs(a - b) < 2;
}

function sameHole(a: Hole | null, b: Hole | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return near(a.top, b.top) && near(a.left, b.left) && near(a.width, b.width) && near(a.height, b.height);
}

function sameBox(a: CardBox | null, b: CardBox) {
  if (!a) return false;
  return near(a.top, b.top) && near(a.left, b.left) && near(a.width, b.width) && near(a.maxHeight, b.maxHeight);
}

function Dim({ hole }: { hole: Hole | null }) {
  const shade = "pointer-events-auto absolute bg-[#1c1612]/60";
  if (!hole) return <div className={`${shade} inset-0`} />;
  const bottom = hole.top + hole.height;
  const right = hole.left + hole.width;
  return (
    <>
      <div className={shade} style={{ top: 0, left: 0, right: 0, height: Math.max(0, hole.top) }} />
      <div className={shade} style={{ top: bottom, left: 0, right: 0, bottom: 0 }} />
      <div className={shade} style={{ top: hole.top, left: 0, width: Math.max(0, hole.left), height: hole.height }} />
      <div className={shade} style={{ top: hole.top, left: right, right: 0, height: hole.height }} />
    </>
  );
}

export function DemoTour() {
  const demo = useDemo();
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ stepId: StepId; text: string } | null>(null);
  const [stall, setStall] = useState<{ stepId: StepId; text: string } | null>(null);
  const [detailFor, setDetailFor] = useState<StepId | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [hole, setHole] = useState<Hole | null>(null);
  const [box, setBox] = useState<CardBox | null>(null);
  const [sourceCount, setSourceCount] = useState<string | null>(null);
  const cardRef = useRef<HTMLElement>(null);
  const routed = useRef<StepId | null>(null);
  const scrolled = useRef<StepId | null>(null);

  useEffect(() => {
    hydrateDemo();
    try {
      if (new URLSearchParams(window.location.search).get("demo") === "1" && !readDemo().active) {
        patchDemo({ active: true, stepId: "intro", trace: null, conversationId: undefined, stepEnteredAt: Date.now() });
      }
    } catch {
      /* 没有 location 时忽略 */
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onStart = () => {
      if (readDemo().active) return;
      patchDemo({ active: true, stepId: "intro", trace: null, conversationId: undefined, stepEnteredAt: Date.now() });
    };
    const onSent = () => {
      if (!readDemo().active) return;
      const step = readDemo().stepId;
      if (step === "s1-send") goTo("s1-reply");
      else if (step === "s2-send") goTo("s2-reply");
      else if (step === "s3-send") goTo("s3-wait");
      else if (step === "s4-send") goTo("s4-reply");
    };
    const onReplied = (event: Event) => {
      if (!readDemo().active) return;
      const detail = (event as CustomEvent<DemoReplyDetail>).detail;
      if (!detail) return;
      patchDemo({
        trace: detail.trace,
        ...(detail.conversationId ? { conversationId: detail.conversationId } : {}),
      });
      const step = readDemo().stepId;
      if (step === "s3-wait" && detail.hasConfirm) {
        goTo("s3-confirm");
        return;
      }
      if (step === "s3-wait" && !detail.hasConfirm) {
        setStall({
          stepId: "s3-wait",
          text:
            detail.status === "waiting_human"
              ? "这次直接转给了人工，没有生成确认卡。可以退出演示后重新开始。"
              : "回复到了，但没有看到确认卡。可以退出演示后重新开始。",
        });
      }
    };
    const onConfirmed = (event: Event) => {
      if (!readDemo().active) return;
      const detail = (event as CustomEvent<DemoConfirmDetail>).detail;
      if (detail?.trace) patchDemo({ trace: detail.trace });
      const step = readDemo().stepId;
      if (step === "s3-confirm" || step === "s3-wait") goTo("s3-done");
    };
    const onTook = () => {
      if (readDemo().stepId === "s5-takeover") goTo("s5-reply");
    };
    const onSeller = () => {
      if (readDemo().stepId === "s5-reply") goTo("s5-back");
    };
    window.addEventListener(DEMO_START, onStart);
    window.addEventListener(DEMO_MESSAGE_SENT, onSent);
    window.addEventListener(DEMO_AI_REPLIED, onReplied);
    window.addEventListener(DEMO_CONFIRMED, onConfirmed);
    window.addEventListener(DEMO_TOOK_OVER, onTook);
    window.addEventListener(DEMO_SELLER_REPLIED, onSeller);
    return () => {
      window.removeEventListener(DEMO_START, onStart);
      window.removeEventListener(DEMO_MESSAGE_SENT, onSent);
      window.removeEventListener(DEMO_AI_REPLIED, onReplied);
      window.removeEventListener(DEMO_CONFIRMED, onConfirmed);
      window.removeEventListener(DEMO_TOOK_OVER, onTook);
      window.removeEventListener(DEMO_SELLER_REPLIED, onSeller);
    };
  }, []);

  useEffect(() => {
    if (!demo.active) {
      routed.current = null;
      return;
    }
    const needsConv = demo.stepId === "s5-detail" || demo.stepId === "s5-takeover" || demo.stepId === "s5-reply";
    if (needsConv && !demo.conversationId) return;
    if (routed.current === demo.stepId) return;
    const dest = sellerConversationPath(demo.stepId, demo.conversationId) ?? STEPS[demo.stepId].path ?? null;
    routed.current = demo.stepId;
    if (!dest || window.location.pathname === dest) return;
    router.push(dest);
  }, [demo.active, demo.stepId, demo.conversationId, router]);

  useEffect(() => {
    if (!demo.active || demo.stepId !== "s5-list") return;
    const matched = pathname.match(/^\/seller\/c\/([^/]+)$/);
    if (!matched) return;
    patchDemo({ conversationId: matched[1] });
    goTo("s5-detail");
  }, [demo.active, demo.stepId, pathname]);

  useEffect(() => {
    if (!demo.active || demo.stepId !== "s6-board") return;
    let n = 0;
    const timer = window.setInterval(() => {
      const btn = document.querySelector<HTMLButtonElement>('[data-tour="range-7d"]');
      if (btn && btn.getAttribute("aria-pressed") !== "true") btn.click();
      n += 1;
      if ((btn && btn.getAttribute("aria-pressed") === "true") || n > 25) window.clearInterval(timer);
    }, 300);
    return () => window.clearInterval(timer);
  }, [demo.active, demo.stepId]);

  useEffect(() => {
    if (!demo.active || demo.stepId !== "s5-reply") return;
    const fire = () => emitDemo(DEMO_PREFILL, { text: SELLER_REPLY_DRAFT });
    fire();
    const timer = window.setTimeout(fire, 400);
    return () => window.clearTimeout(timer);
  }, [demo.active, demo.stepId]);

  const measure = useCallback(() => {
    if (!readDemo().active) return;
    const step = STEPS[readDemo().stepId];
    const arrived = step.id === "s5-back" && window.location.pathname.startsWith("/orders");
    const center = Boolean(step.center) && !arrived;
    const els = center ? [] : collectTargets(step.id, readDemo().conversationId);
    if (window.scrollX !== 0) window.scrollTo(0, window.scrollY);
    if (!center && els[0] && scrolled.current !== step.id) {
      const r = els[0].getBoundingClientRect();
      const vh = window.innerHeight;
      if (r.top < 8 || r.bottom > vh - 8) {
        const top = window.scrollY + r.top - Math.max(8, (vh - r.height) / 2);
        window.scrollTo({ top: Math.max(0, top), left: 0 });
      }
      scrolled.current = step.id;
    }
    const nextHole = center ? null : focusHole(els);
    const narrow = window.innerWidth < 720;
    const cardH = cardRef.current?.offsetHeight ?? 220;
    const nextBox = placeCard(nextHole, cardH, narrow);
    setHole((prev) => (sameHole(prev, nextHole) ? prev : nextHole));
    setBox((prev) => (sameBox(prev, nextBox) ? prev : nextBox));
    const count = document.querySelector("[data-testid='card-sources']")?.getAttribute("data-count") ?? null;
    setSourceCount((prev) => (prev === count ? prev : count));
  }, []);

  useEffect(() => {
    if (!demo.active) return;
    const kick = window.setTimeout(measure, 0);
    const timer = window.setInterval(measure, 200);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(kick);
      window.clearInterval(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [demo.active, demo.stepId, measure]);

  const begin = useCallback(async (next: StepId) => {
    setBusy(true);
    setError(null);
    try {
      await resetDemo();
      patchDemo({ active: true, stepId: next, trace: null, conversationId: undefined, stepEnteredAt: Date.now() });
      window.history.replaceState(null, "", "/?demo=1");
      window.location.reload();
    } catch {
      setError({ stepId: readDemo().stepId, text: "重置没有成功，数据还在。请再点一次。" });
      setBusy(false);
    }
  }, []);

  const leave = useCallback(() => {
    exitDemo();
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("demo");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    } catch {
      /* 忽略 */
    }
  }, []);

  const tryScript = useCallback(
    (draft: string) => {
      saveTryScript({ buyerId: "B001", draft });
      leave();
      router.push("/");
    },
    [leave, router],
  );

  if (!demo.active) return null;

  const step = STEPS[demo.stepId];
  const openDetail = detailFor === step.id;
  const stallText = stall?.stepId === step.id ? stall.text : null;
  const errorText = error?.stepId === step.id ? error.text : null;
  const arrivedBuyer = step.id === "s5-back" && pathname.startsWith("/orders");
  const missing = (!step.center && !hole) || (arrivedBuyer && !hole);
  const showTimer = Boolean(step.showTimer) || (missing && !step.center);
  const elapsed = Math.max(0, Math.floor((now - (demo.stepEnteredAt || now)) / 1000));
  let sentence = step.sentence;
  if (step.id === "s1-reply") sentence = sentence.replace("N", sourceCount ?? "几");
  let headline = missing && !step.showTimer ? step.waitCopy : sentence;
  if (step.id === "s1-reply" && missing && !step.showTimer && elapsed > 5) {
    headline = `${step.waitCopy}第一条消息会慢一点，模型在热身。`;
  }
  const trace = demo.trace as RouteTrace | null;
  const showPrimary = step.primary && !(step.primary.kind === "buyer" && arrivedBuyer);
  const showNav = step.advance === "narrate" || arrivedBuyer;
  const showExit = step.id !== "intro" && step.id !== "end";

  const goNext = () => {
    if (step.id === "intro") {
      void begin("s1-send");
      return;
    }
    if (step.id === "end") {
      leave();
      return;
    }
    const next = neighbor(step.id, 1);
    if (next) goTo(next);
  };
  const goPrev = () => {
    const prev = neighbor(step.id, -1);
    if (prev) goTo(prev);
  };
  const runPrimary = () => {
    const kind = step.primary?.kind;
    if (kind === "start") void begin("s1-send");
    else if (kind === "retry") void begin("intro");
    else if (kind === "exit") leave();
    else if (kind === "seller") goTo("s5-list");
    else if (kind === "board") goTo("s6-board");
    else if (kind === "buyer") router.push(BUYER_BACK);
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-[80]" data-testid="demo-tour" data-step={step.id} data-advance={arrivedBuyer ? "narrate" : (step.advance ?? "frame")}>
      <style>{`
        @keyframes qimu-demo-breathe {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.55); }
          50% { box-shadow: 0 0 0 10px rgba(220, 38, 38, 0); }
        }
        .qimu-demo-ring { animation: qimu-demo-breathe 1.6s ease-in-out infinite; }
      `}</style>
      <Dim hole={hole} />
      {hole ? (
        <div
          data-testid="demo-ring"
          className="qimu-demo-ring pointer-events-none absolute border-[3px] border-red-600"
          style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height, borderRadius: hole.radius }}
        />
      ) : null}
      <section
        ref={cardRef}
        role="dialog"
        aria-label="演示引导"
        data-testid="demo-card"
        className="pointer-events-auto absolute flex flex-col overflow-hidden rounded-2xl bg-white text-foreground shadow-lift ring-1 ring-black/5"
        style={
          box
            ? { top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight }
            : { top: 16, left: 16, width: 340, maxHeight: 420 }
        }
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold leading-5 text-white">{step.kicker}</span>
          <span className="text-xs font-medium leading-5 text-warm">演示 {step.progress}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <p data-testid="demo-sentence" className="text-[15px] font-medium leading-6 text-foreground">
            <RichText text={headline} />
          </p>
          {step.showFunnel ? (
            <div>
              <FunnelDiagram />
              <p className="mt-2 text-[13px] leading-5 text-warm">上面是漏斗的顺序。</p>
            </div>
          ) : null}
          {showTimer ? <p className="mt-1.5 text-xs leading-5 text-warm">已等 {elapsed} 秒</p> : null}
          {stallText ? <p className="mt-2 text-xs leading-5 text-risk">{stallText}</p> : null}
          {errorText ? <p className="mt-2 text-xs leading-5 text-risk">{errorText}</p> : null}
          <button
            type="button"
            data-testid="demo-expand"
            aria-expanded={openDetail}
            onClick={() => setDetailFor(openDetail ? null : step.id)}
            className="mt-2 text-xs font-medium leading-5 text-brand"
          >
            {openDetail ? "收起详情" : "展开详情"}
          </button>
          {openDetail ? (
            <div className="mt-2 rounded-xl bg-cream px-3 py-2 text-[13px] leading-5 text-warm">
              {step.detail ? <p>{step.detail}</p> : null}
              {step.showTrace && trace ? <TraceFacts trace={trace} /> : null}
              {step.showTrace && !trace ? <p className="mt-1.5">这一轮的路由数据还没到，数字不会先写死。</p> : null}
              {step.id === "end" ? (
                <ul className="mt-2 space-y-2">
                  {TRY_SCRIPTS.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        data-testid={`demo-try-${item.id}`}
                        onClick={() => tryScript(item.draft)}
                        className="w-full rounded-lg bg-white px-2.5 py-2 text-left ring-1 ring-line"
                      >
                        <span className="block text-[13px] font-semibold text-foreground">{item.title}</span>
                        <span className="mt-0.5 block text-[11px] leading-4 text-warm">{item.note} 点这里只填好话术。</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5">
          {showNav ? (
            <button
              type="button"
              data-testid="demo-prev"
              disabled={busy}
              onClick={goPrev}
              className="rounded-full px-3 py-1.5 text-xs font-medium leading-5 text-foreground disabled:opacity-40"
            >
              上一步
            </button>
          ) : null}
          {showExit ? (
            <button
              type="button"
              data-testid="demo-exit"
              disabled={busy}
              onClick={leave}
              className="rounded-full px-3 py-1.5 text-xs font-medium leading-5 text-warm"
            >
              退出演示
            </button>
          ) : null}
          <span className="ml-auto flex flex-wrap justify-end gap-2">
            {step.id === "end" ? (
              <button
                type="button"
                data-testid="demo-retry"
                disabled={busy}
                onClick={() => void begin("intro")}
                className="rounded-full border border-brand px-3 py-1.5 text-xs font-semibold leading-5 text-brand disabled:opacity-50"
              >
                {busy ? "重置中…" : "再演示一次"}
              </button>
            ) : null}
            {showPrimary && step.primary ? (
              <button
                type="button"
                data-testid={step.primary.testId}
                disabled={busy}
                onClick={runPrimary}
                className="rounded-full bg-red-600 px-3.5 py-1.5 text-xs font-semibold leading-5 text-white disabled:opacity-50"
              >
                {busy ? "请稍等…" : step.primary.label}
              </button>
            ) : null}
            {showNav ? (
              <button
                type="button"
                data-testid="demo-next"
                disabled={busy}
                onClick={goNext}
                className="rounded-full bg-brand px-3.5 py-1.5 text-xs font-semibold leading-5 text-white disabled:opacity-50"
              >
                下一步
              </button>
            ) : null}
          </span>
        </div>
      </section>
    </div>
  );
}
