"use client";

import Link from "next/link";
import { relativeTime } from "@/components/shop/format";
import type { Buyer, Conversation, ConversationStatus } from "@/lib/types";
import { intentLabel } from "./labels";
import { useSeller } from "./SellerProvider";
import { waitText } from "./time";
import { Avatar, MemberBadge, PageHeader, RiskChip } from "./ui";

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
              {waitText(c.updatedAt)}
            </span>
          ) : null}
          {c.riskFlags.map((r) => (
            <RiskChip key={r} risk={r} />
          ))}
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
  const { conversations, error, buyers, waitingCount } = useSeller();

  return (
    <>
      <PageHeader
        title="会话"
        subtitle="栖木商家 · 阿栖 在线"
        right={
          waitingCount > 0 ? (
            <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-red-50 px-3 text-xs font-semibold text-red-700 ring-1 ring-red-200">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-600" />
              {waitingCount} 个待人工
            </span>
          ) : (
            <span className="inline-flex min-h-8 items-center rounded-full bg-brand-soft px-3 text-xs font-medium text-brand">
              暂无待人工
            </span>
          )
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6">
        {conversations === null && !error ? <Skeleton /> : null}

        {error && conversations === null ? (
          <div className="m-4 rounded-card bg-white p-4 text-sm text-warm shadow-card">
            会话加载失败：{error.message}
          </div>
        ) : null}

        {conversations
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
