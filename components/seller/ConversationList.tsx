"use client";

import Link from "next/link";
import { relativeTime } from "@/components/shop/format";
import type { Buyer, Conversation, ConversationStatus } from "@/lib/types";
import { intentLabel } from "./labels";
import { useSeller } from "./SellerProvider";
import { waitText } from "./time";
import { friendlyError } from "@/components/shop/states";
import { Avatar, EmptyCard, ErrorCard, LayerBadge, MemberBadge, PageHeader, RiskChip } from "./ui";

interface Group {
  status: ConversationStatus;
  title: string;
  hint?: string;
  dot: string;
}

const GROUPS: Group[] = [
  { status: "waiting_human", title: "待人工", hint: "按等待时长排序", dot: "bg-red-600" },
  { status: "human_active", title: "人工处理中", dot: "bg-sky-500" },
  { status: "ai_active", title: "AI 处理中", dot: "bg-brand" },
  { status: "closed", title: "已结束", dot: "bg-stone-300" },
];

function Row({ c, buyer }: { c: Conversation; buyer?: Buyer }) {
  const name = buyer?.nickname ?? c.buyerId;
  const waiting = c.status === "waiting_human";
  const intent = c.state.currentTask?.intent ?? c.state.lastIntent;
  return (
    <Link
      href={`/seller/c/${c.id}`}
      className="flex min-h-[76px] gap-3 px-3.5 py-3 transition-colors active:bg-brand-soft/60"
    >
      <span className="relative shrink-0">
        <Avatar id={c.buyerId} name={name} />
        {c.unreadForSeller > 0 ? (
          <span
            aria-label={`${c.unreadForSeller} 条未读`}
            className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold leading-none text-white ring-2 ring-white"
          >
            {c.unreadForSeller > 9 ? "9+" : c.unreadForSeller}
          </span>
        ) : null}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[15px] font-semibold text-foreground">{name}</span>
            {buyer ? <MemberBadge level={buyer.memberLevel} /> : null}
          </span>
          <time dateTime={c.updatedAt} title={c.updatedAt.slice(0, 16).replace("T", " ")} className="shrink-0 text-xs text-warm">
            {relativeTime(c.updatedAt)}
          </time>
        </span>

        <span
          className={`mt-0.5 block truncate text-sm ${c.unreadForSeller > 0 ? "font-medium text-foreground" : "text-warm"}`}
        >
          {c.lastMessagePreview}
        </span>

        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {waiting ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-1.5 py-0.5 text-[11px] font-medium leading-4 text-red-700">
              <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <circle cx="6" cy="6" r="4.6" />
                <path d="M6 3.4V6l1.8 1.1" />
              </svg>
              {waitText(c.handoffAt ?? c.updatedAt)}
            </span>
          ) : null}
          {c.riskFlags.map((r) => (
            <RiskChip key={r} risk={r} />
          ))}
          {c.lastLayer ? <LayerBadge layer={c.lastLayer} /> : null}
          {!waiting && c.status === "human_active" ? (
            <span className="rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium leading-4 text-sky-700">
              {c.assignee ?? "阿栖"} 接管中
            </span>
          ) : null}
          {intent && c.riskFlags.length === 0 && !waiting ? (
            <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] leading-4 text-stone-600">{intentLabel(intent)}</span>
          ) : null}
        </span>
      </span>
    </Link>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3 px-4 pt-4" aria-busy>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex animate-pulse gap-3 rounded-card bg-white p-3.5 shadow-card">
          <div className="h-11 w-11 rounded-full bg-stone-200" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-24 rounded bg-stone-200" />
            <div className="h-3 w-4/5 rounded bg-stone-100" />
            <div className="h-3 w-1/3 rounded bg-stone-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ConversationList() {
  const { conversations, error, buyers, waitingCount, refresh } = useSeller();

  return (
    <>
      <PageHeader
        title="会话"
        subtitle="栖木商家 · 阿栖 在线"
        right={
          <div className="flex items-center gap-1">
            {waitingCount > 0 ? (
              <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-red-50 px-3 text-xs font-semibold text-red-700 ring-1 ring-red-200">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-600" />
                {waitingCount} 个待人工
              </span>
            ) : (
              <span className="inline-flex min-h-8 items-center rounded-full bg-brand-soft px-3 text-xs font-medium text-brand">
                暂无待人工
              </span>
            )}
            <Link
              href="/seller/settings"
              aria-label="设置"
              className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-warm active:bg-stone-200"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
              </svg>
            </Link>
          </div>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6">
        {waitingCount > 0 && conversations ? (
          <Link
            href={`/seller/c/${conversations.find((c) => c.status === "waiting_human")?.id ?? ""}`}
            role="status"
            className="mx-4 mt-3 flex min-h-[48px] items-center gap-2.5 rounded-card bg-red-600 px-3.5 text-white shadow-card active:bg-red-700"
          >
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
            </span>
            <span className="min-w-0 flex-1 text-sm font-semibold">有 {waitingCount} 位买家等待人工</span>
            <span className="shrink-0 text-xs font-medium text-white/90">去处理 ›</span>
          </Link>
        ) : null}

        {conversations === null && !error ? <Skeleton /> : null}

        {error && conversations === null ? (
          <div className="m-4">
            <ErrorCard title="会话暂时没加载出来" message={friendlyError(error, "网络好像不太稳定")} onRetry={refresh} />
          </div>
        ) : null}

        {conversations && conversations.length === 0 ? (
          <div className="m-4">
            <EmptyCard title="还没有买家来咨询" hint="买家在商城里点「联系客服」发来消息后，会话就会出现在这里。">
              <Link
                href="/"
                target="_blank"
                className="inline-flex min-h-[44px] items-center rounded-full bg-brand px-5 text-sm font-semibold text-white active:bg-brand-dark"
              >
                打开买家端 ↗
              </Link>
            </EmptyCard>
          </div>
        ) : null}

        {conversations && conversations.length > 0
          ? GROUPS.map((g) => {
              const list = conversations.filter((c) => c.status === g.status);
              if (list.length === 0 && g.status !== "waiting_human") return null;
              return (
                <section key={g.status} className="px-4 pt-4" aria-label={g.title}>
                  <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-foreground">
                    <span className={`h-2 w-2 rounded-full ${g.dot}`} />
                    {g.title}
                    <span className="font-normal text-warm">{list.length}</span>
                    {g.hint && list.length > 0 ? <span className="ml-auto text-[11px] font-normal text-warm">{g.hint}</span> : null}
                  </h2>
                  {list.length === 0 ? (
                    <p className="rounded-card bg-white px-4 py-5 text-center text-sm text-warm shadow-card">
                      没有需要人工处理的会话 🎉
                    </p>
                  ) : (
                    <ul className="divide-y divide-line overflow-hidden rounded-card bg-white shadow-card">
                      {list.map((c) => (
                        <li key={c.id}>
                          <Row c={c} buyer={buyers.get(c.buyerId)} />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })
          : null}
      </div>
    </>
  );
}
