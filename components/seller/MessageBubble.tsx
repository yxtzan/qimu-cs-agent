"use client";

import type { ChatCard, ChatMessage, RouteTrace } from "@/lib/types";
import { formatCny } from "@/lib/llm/cost";
import {
  AFTER_SALE_STATUS_LABEL,
  AFTER_SALE_TYPE_LABEL,
  LOGISTICS_STATUS_LABEL,
  ORDER_STATUS_LABEL,
} from "@/components/shop/labels";
import { money, shortDateTime } from "@/components/shop/format";
import { intentLabel, PENDING_STATUS_LABEL } from "./labels";
import { bubbleTime } from "./time";
import { Avatar, LayerBadge } from "./ui";

// ───────────────────────── 卡片摘要（卖家端只需要"看得懂"，不需要买家端那么完整） ─────────────────────────

function CardShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-2 rounded-lg bg-white/80 p-2.5 text-xs leading-5 text-foreground ring-1 ring-black/5">
      <p className="mb-1 text-[11px] font-medium tracking-wide text-warm">{title}</p>
      {children}
    </div>
  );
}

function CardPreview({ card }: { card: ChatCard }) {
  switch (card.kind) {
    case "order":
      return (
        <CardShell title="订单卡片">
          <p className="font-medium">{card.order.id}</p>
          <p className="text-warm">
            {ORDER_STATUS_LABEL[card.order.status]} · 实付 {money(card.order.payAmount)}
          </p>
        </CardShell>
      );
    case "logistics": {
      const latest = card.logistics.events[0];
      return (
        <CardShell title="物流卡片">
          <p className="font-medium">
            {card.logistics.carrier} {card.logistics.trackingNo}
          </p>
          <p className={card.logistics.status === "exception" ? "text-risk" : "text-warm"}>
            {LOGISTICS_STATUS_LABEL[card.logistics.status]}
            {latest ? ` · ${shortDateTime(latest.at)} ${latest.location}` : ""}
          </p>
        </CardShell>
      );
    }
    case "product":
      return (
        <CardShell title="商品卡片">
          <p className="font-medium">{card.product.name}</p>
          <p className="text-warm">{money(card.product.price)}</p>
        </CardShell>
      );
    case "aftersale":
      return (
        <CardShell title="售后卡片">
          <p className="font-medium">
            {card.afterSale.id} · {AFTER_SALE_TYPE_LABEL[card.afterSale.type]}
          </p>
          <p className="text-warm">
            {AFTER_SALE_STATUS_LABEL[card.afterSale.status]} · {money(card.afterSale.amount)}
          </p>
        </CardShell>
      );
    case "confirm":
      return (
        <CardShell title="确认卡片（写操作需买家确认）">
          <p className="font-medium">{card.pendingAction.summary}</p>
          <p className={card.pendingAction.status === "pending" ? "text-amber-700" : "text-warm"}>
            {PENDING_STATUS_LABEL[card.pendingAction.status]}
          </p>
        </CardShell>
      );
    case "options":
      return (
        <CardShell title="选项卡片">
          <p>{card.prompt}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {card.options.map((o) => (
              <span key={o.value} className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-600">
                {o.label}
              </span>
            ))}
          </div>
        </CardShell>
      );
    case "size_result":
      return (
        <CardShell title="尺码推荐">
          <p className="font-medium">推荐 {card.size} 码</p>
          <p className="text-warm">{card.basis}</p>
        </CardShell>
      );
    case "coupons":
      return (
        <CardShell title="优惠券">
          {card.coupons.length === 0 ? (
            <p className="text-warm">暂无可用优惠券</p>
          ) : (
            <ul className="space-y-0.5">
              {card.coupons.map((c) => (
                <li key={c.id} className="flex justify-between gap-2">
                  <span className="font-medium">{c.title}</span>
                  <span className="text-warm">{c.scope}</span>
                </li>
              ))}
            </ul>
          )}
        </CardShell>
      );
    case "sources":
      return (
        <CardShell title="知识库引用">
          <ul className="space-y-1">
            {card.sources.map((s, i) => (
              <li key={i}>
                <span className="font-medium">
                  {s.docTitle}
                  {s.heading ? ` · ${s.heading}` : ""}
                </span>
                <p className="line-clamp-2 text-warm">{s.snippet}</p>
              </li>
            ))}
          </ul>
        </CardShell>
      );
  }
}

// ───────────────────────── 路由轨迹行（"白盒"：这条回复是谁处理的、多快、多贵） ─────────────────────────

export function TraceLine({ trace, end = false }: { trace: RouteTrace; end?: boolean }) {
  const parts: string[] = [];
  if (trace.intent) parts.push(intentLabel(trace.intent));
  if (trace.confidence !== undefined) parts.push(`置信度 ${trace.confidence.toFixed(2)}`);
  if (trace.ruleId) parts.push(`规则 ${trace.ruleId}`);
  parts.push(`${trace.latency.totalMs}ms`);
  parts.push(formatCny(trace.cost.totalUsd));
  return (
    <div className={`mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] leading-4 text-warm ${end ? "justify-end" : ""}`}>
      <LayerBadge layer={trace.layer} />
      <span>{parts.join(" · ")}</span>
      {trace.escalatedFrom ? <span className="text-risk">（由 {trace.escalatedFrom} 升级）</span> : null}
      {trace.toolCalls.length > 0 ? (
        <span className="basis-full text-[11px] text-warm/90">
          工具：{trace.toolCalls.map((t) => `${t.name}${t.ok ? "" : "✗"} ${t.ms}ms`).join(" → ")}
        </span>
      ) : null}
    </div>
  );
}

// ───────────────────────── 气泡 ─────────────────────────

interface Props {
  message: ChatMessage;
  trace?: RouteTrace;
  buyerId: string;
  buyerName: string;
}

export function MessageBubble({ message, trace, buyerId, buyerName }: Props) {
  if (message.role === "system") {
    return (
      <div className="flex flex-col items-center py-1">
        <span className="rounded-full bg-stone-200/70 px-3 py-1 text-xs text-stone-600">{message.text}</span>
        <span className="mt-0.5 text-[10px] text-warm/80">{bubbleTime(message.createdAt)}</span>
        {trace ? (
          <div className="mt-0.5 flex justify-center">
            <TraceLine trace={trace} />
          </div>
        ) : null}
      </div>
    );
  }

  const isBuyer = message.role === "buyer";
  const isAi = message.role === "ai";

  const bubbleClass = isBuyer
    ? "bg-white text-foreground shadow-card rounded-2xl rounded-tl-md"
    : isAi
      ? "bg-brand-soft text-foreground rounded-2xl rounded-tr-md ring-1 ring-brand/10"
      : "bg-brand text-white rounded-2xl rounded-tr-md";

  return (
    <div className={`flex gap-2 ${isBuyer ? "" : "flex-row-reverse"}`}>
      {isBuyer ? (
        <Avatar id={buyerId} name={buyerName} size={32} className="mt-5" />
      ) : (
        <span
          aria-hidden
          className={`mt-5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
            isAi ? "bg-purple-100 text-purple-700" : "bg-brand text-white"
          }`}
        >
          {isAi ? "AI" : "栖"}
        </span>
      )}

      <div className={`flex min-w-0 max-w-[78%] flex-col ${isBuyer ? "items-start" : "items-end"}`}>
        <div className={`mb-1 flex items-center gap-1.5 text-[11px] text-warm ${isBuyer ? "" : "flex-row-reverse"}`}>
          <span>{isBuyer ? buyerName : isAi ? "AI 客服" : "阿栖（人工）"}</span>
          <span>{bubbleTime(message.createdAt)}</span>
        </div>
        <div className={`px-3 py-2 text-[15px] leading-6 ${bubbleClass}`}>
          <p className="whitespace-pre-wrap break-words">{message.text}</p>
          {message.card ? <CardPreview card={message.card} /> : null}
        </div>
        {trace ? (
          <TraceLine trace={trace} end={!isBuyer} />
        ) : null}
      </div>
    </div>
  );
}
