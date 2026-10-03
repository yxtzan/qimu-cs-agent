"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  closeConversation,
  getConversationDetail,
  releaseConversation,
  replyConversation,
  takeoverConversation,
} from "@/lib/api-client";
import { useAsync } from "@/components/shop/useAsync";
import { AiContextPanel } from "./AiContextPanel";
import { CONVERSATION_STATUS_CLASS, CONVERSATION_STATUS_LABEL } from "./labels";
import { MessageBubble } from "./MessageBubble";
import { useSeller } from "./SellerProvider";
import { waitText } from "./time";
import { Avatar, MemberBadge } from "./ui";

const POLL_MS = 3000;

function BackButton() {
  return (
    <Link
      href="/seller"
      aria-label="返回会话列表"
      className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground active:bg-brand-soft"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m15 5-7 7 7 7" />
      </svg>
    </Link>
  );
}

export function ConversationScreen({ id }: { id: string }) {
  const { buyers, refresh } = useSeller();
  const [tick, setTick] = useState(0);
  const [panelOpen, setPanelOpen] = useState<boolean | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(() => {
    setTick((t) => t + 1);
    refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), POLL_MS);
    return () => clearInterval(timer);
  }, []);

  const { data, error } = useAsync(() => getConversationDetail(id), [id, tick]);

  const traceById = useMemo(() => new Map((data?.traces ?? []).map((t) => [t.id, t])), [data?.traces]);

  // ── 消息流：首次加载 / 有新消息且用户本来就在底部时，滚到底 ──
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);
  const messageCount = data?.messages.length ?? 0;
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || messageCount === 0) return;
    const first = lastCountRef.current === 0;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (first || (messageCount > lastCountRef.current && nearBottom)) {
      el.scrollTo({ top: el.scrollHeight, behavior: first ? "auto" : "smooth" });
    }
    lastCountRef.current = messageCount;
  }, [messageCount]);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      setNotice(null);
      try {
        await fn();
        reload();
      } catch (e) {
        setNotice(e instanceof Error ? e.message : "操作失败，请稍后再试");
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  const send = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    void run(() => replyConversation(id, text));
  };

  // ── 错误 / 加载态 ──
  if (error && !data) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex h-14 items-center border-b border-line bg-cream px-4 pt-[env(safe-area-inset-top)]">
          <BackButton />
          <span className="text-base font-semibold">会话</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <p className="text-base font-medium text-foreground">没有找到这个会话</p>
          <p className="text-sm text-warm">{error.message}</p>
          <Link href="/seller" className="inline-flex min-h-[44px] items-center rounded-full bg-brand px-5 text-sm font-medium text-white">
            回到会话列表
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-1 flex-col" aria-busy>
        <div className="flex h-14 items-center border-b border-line bg-cream px-4 pt-[env(safe-area-inset-top)]">
          <BackButton />
          <div className="h-4 w-28 animate-pulse rounded bg-stone-200" />
        </div>
        <div className="flex-1 space-y-4 p-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`h-14 animate-pulse rounded-2xl bg-stone-200/70 ${i % 2 ? "ml-auto w-3/5" : "w-2/3"}`} />
          ))}
        </div>
      </div>
    );
  }

  const { conversation: c, messages, traces, pendingActions } = data;
  const buyer = buyers.get(c.buyerId);
  const name = buyer?.nickname ?? c.buyerId;
  const isHuman = c.status === "human_active";
  const isClosed = c.status === "closed";
  const canReply = isHuman;
  const open = panelOpen ?? c.status === "waiting_human";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 顶部：买家 + 状态 + 接管 / 交还 */}
      <header className="shrink-0 bg-cream pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center gap-2.5 px-4">
          <BackButton />
          <Avatar id={c.buyerId} name={name} size={36} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h1 className="truncate text-base font-semibold leading-5 text-foreground">{name}</h1>
              {buyer ? <MemberBadge level={buyer.memberLevel} /> : null}
            </div>
            <p className="truncate text-[11px] text-warm">
              {buyer?.heightCm ? `${buyer.heightCm}cm / ${buyer.weightKg}kg · ` : ""}
              会话 {c.id}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${CONVERSATION_STATUS_CLASS[c.status]}`}>
            {CONVERSATION_STATUS_LABEL[c.status]}
          </span>
        </div>

        <div className="flex min-h-[56px] items-center gap-2 border-t border-line bg-white px-4 py-2">
          <p className="min-w-0 flex-1 text-xs leading-5 text-warm">
            {c.status === "waiting_human" ? (
              <>
                <span className="font-semibold text-red-700">{waitText(c.updatedAt)}</span>
                <br />
                买家正在等人工回复
              </>
            ) : isHuman ? (
              <>
                <span className="font-semibold text-sky-700">{c.assignee ?? "阿栖"} 接管中</span>
                <br />
                AI 暂停回复，买家消息由你处理
              </>
            ) : isClosed ? (
              "会话已结束"
            ) : (
              <>
                <span className="font-semibold text-brand">AI 正在处理</span>
                <br />
                需要时可随时接管
              </>
            )}
          </p>

          {!isClosed && !isHuman ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => takeoverConversation(id))}
              className="inline-flex min-h-[44px] min-w-[88px] items-center justify-center rounded-full bg-brand px-5 text-[15px] font-semibold text-white shadow-card transition-colors active:bg-brand-dark disabled:opacity-60"
            >
              接管
            </button>
          ) : null}
          {isHuman ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => closeConversation(id))}
                className="inline-flex min-h-[44px] items-center justify-center rounded-full px-3 text-sm font-medium text-warm active:bg-stone-100 disabled:opacity-60"
              >
                结束
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => releaseConversation(id))}
                className="inline-flex min-h-[44px] min-w-[96px] items-center justify-center rounded-full border border-brand bg-white px-4 text-[15px] font-semibold text-brand transition-colors active:bg-brand-soft disabled:opacity-60"
              >
                交还 AI
              </button>
            </>
          ) : null}
        </div>
      </header>

      <AiContextPanel
        conversation={c}
        traces={traces}
        pendingActions={pendingActions}
        open={open}
        onToggle={() => setPanelOpen(!open)}
      />

      {/* 消息流 */}
      <div ref={scrollerRef} className="min-h-0 flex-1 space-y-3.5 overflow-y-auto overscroll-contain bg-cream px-3 py-4">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            trace={msg.traceId ? traceById.get(msg.traceId) : undefined}
            buyerId={c.buyerId}
            buyerName={name}
          />
        ))}
      </div>

      {notice ? (
        <p role="alert" className="shrink-0 bg-red-50 px-4 py-2 text-xs text-red-700">
          {notice}
        </p>
      ) : null}

      {/* 输入栏 */}
      <div className="shrink-0 border-t border-line bg-white px-3 pt-2 pb-[max(env(safe-area-inset-bottom),8px)]">
        {!canReply && !isClosed ? (
          <p className="pb-1.5 text-center text-[11px] text-warm">点击上方「接管」后，才能以人工身份回复买家</p>
        ) : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-center gap-2"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!canReply || busy}
            placeholder={canReply ? "回复买家…" : isClosed ? "会话已结束" : "接管后可回复"}
            enterKeyHint="send"
            aria-label="回复内容"
            className="min-h-[44px] min-w-0 flex-1 rounded-full bg-cream px-4 text-base text-foreground outline-none ring-1 ring-line transition focus:bg-white focus:ring-brand disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!canReply || busy || draft.trim() === ""}
            className="inline-flex min-h-[44px] min-w-[64px] items-center justify-center rounded-full bg-brand px-4 text-[15px] font-semibold text-white transition-colors active:bg-brand-dark disabled:bg-stone-300"
          >
            发送
          </button>
        </form>
      </div>
    </div>
  );
}
