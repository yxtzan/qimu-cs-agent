"use client";

import Link from "next/link";
import { useState } from "react";
import type { AfterSale, ChatCard, ChatMessage, Coupon, Logistics, Order, PendingAction, Product, Size } from "@/lib/types";
import { AFTER_SALE_TYPE_LABEL, LOGISTICS_STATUS_LABEL } from "@/components/shop/labels";
import { dateOnly, money, shortDateTime } from "@/components/shop/format";
import { ProductImage } from "@/components/shop/ProductImage";
import { AfterSaleStatusBadge, OrderStatusBadge, PlainBadge } from "@/components/shop/StatusBadge";

/** 确认卡片被买家处理后的状态（本地维护；后端若已把 PendingAction 改成非 pending，则以后端为准）。 */
export interface ConfirmResolution {
  status: "busy" | "confirmed" | "cancelled" | "failed";
  /** 处理结果的一句话（例如「已创建售后单 AS…」） */
  result?: string;
}

export interface CardContext {
  message: ChatMessage;
  /** 这条消息是不是整个对话里的最后一条（决定选项卡片是否还能点） */
  isLast: boolean;
  /** 有请求在飞行中 */
  sending: boolean;
  resolutionOf: (pendingActionId: string) => ConfirmResolution | undefined;
  chosenOf: (messageId: string) => string | undefined;
  onSelectOption: (messageId: string, value: string, label: string) => void;
  onConfirm: (pendingActionId: string, confirm: boolean) => void;
}

function Shell({
  title,
  right,
  children,
  accent = false,
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={`mt-2 overflow-hidden rounded-xl bg-white text-left shadow-card ${
        accent ? "ring-1 ring-brand/40" : "ring-1 ring-line"
      }`}
    >
      {title ? (
        <div className="flex items-center justify-between gap-2 border-b border-line/70 px-3.5 py-2">
          <span className="text-xs font-medium tracking-wide text-warm">{title}</span>
          {right}
        </div>
      ) : null}
      {children}
    </div>
  );
}

// ───────────────────────── 1. 订单卡片 ─────────────────────────

function OrderCardView({ order }: { order: Order }) {
  return (
    <Shell title={`订单 ${order.id}`} right={<OrderStatusBadge status={order.status} />}>
      <div className="space-y-2.5 px-3.5 py-3">
        {order.items.map((it) => (
          <div key={it.itemId} className="flex items-center gap-3">
            <div className="h-[58px] w-11 shrink-0 overflow-hidden rounded-md bg-[#ece7dc]">
              <ProductImage color={it.color} name={it.productName} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">{it.productName}</div>
              <div className="mt-0.5 text-xs text-warm">
                {it.color} · {it.size} · ×{it.quantity}
              </div>
            </div>
            <div className="shrink-0 text-sm text-foreground">{money(it.unitPrice)}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-line/70 bg-cream/60 px-3.5 py-2 text-xs text-warm">
        <span>
          实付 <b className="text-sm font-semibold text-foreground">{money(order.payAmount)}</b>
        </span>
        <Link href={`/orders/${order.id}`} className="font-medium text-brand hover:underline">
          查看订单详情 →
        </Link>
      </div>
    </Shell>
  );
}

// ───────────────────────── 2. 物流时间线卡片 ─────────────────────────

function LogisticsCardView({ orderId, logistics }: { orderId: string; logistics: Logistics }) {
  const [expanded, setExpanded] = useState(false);
  const events = expanded ? logistics.events : logistics.events.slice(0, 4);
  const delivered = logistics.status === "delivered";
  return (
    <Shell
      title={`${logistics.carrier} · ${logistics.trackingNo}`}
      right={<PlainBadge tone={delivered ? "green" : logistics.status === "exception" ? "orange" : "blue"}>{LOGISTICS_STATUS_LABEL[logistics.status]}</PlainBadge>}
    >
      <div className="px-3.5 pt-3 text-xs text-warm">
        订单 {orderId}
        {logistics.estimatedDelivery && !delivered ? (
          <span className="ml-2 text-brand">预计 {shortDateTime(logistics.estimatedDelivery).slice(0, 5)} 送达</span>
        ) : null}
      </div>
      <ol className="px-3.5 pb-1 pt-3" data-testid="logistics-timeline">
        {events.map((e, i) => {
          const first = i === 0;
          const last = i === events.length - 1;
          return (
            <li key={`${e.at}-${i}`} className="relative flex gap-3 pb-3.5">
              {!last && <span className="absolute left-[5px] top-3 h-full w-px bg-line" />}
              <span
                className={`relative z-10 mt-1 h-[11px] w-[11px] shrink-0 rounded-full border-2 ${
                  first ? "border-brand bg-brand" : "border-line bg-white"
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className={`text-[13px] leading-5 ${first ? "font-medium text-foreground" : "text-foreground/75"}`}>
                  {e.description}
                </div>
                <div className="mt-0.5 text-[11px] text-warm">
                  {shortDateTime(e.at)} · {e.location}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {logistics.events.length > 4 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full border-t border-line/70 py-2 text-xs font-medium text-brand hover:bg-brand-soft/50"
        >
          {expanded ? "收起" : `查看全部 ${logistics.events.length} 条轨迹`}
        </button>
      )}
    </Shell>
  );
}

// ───────────────────────── 3. 商品卡片 ─────────────────────────

function ProductCardView({ product }: { product: Product }) {
  return (
    <Link href={`/product/${product.id}`} className="mt-2 block">
      <div className="flex gap-3 overflow-hidden rounded-xl bg-white p-2.5 shadow-card ring-1 ring-line transition hover:ring-brand/50">
        <div className="h-[84px] w-16 shrink-0 overflow-hidden rounded-lg bg-[#ece7dc]">
          <ProductImage category={product.category} color={product.colors[0]} name={product.name} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
          <div>
            <div className="truncate text-sm font-medium text-foreground">{product.name}</div>
            <div className="mt-0.5 truncate text-xs text-warm">
              {product.category} · {product.colors.join(" / ")}
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-base font-semibold text-brand">{money(product.price)}</span>
            <span className="text-xs text-brand">查看商品 →</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ───────────────────────── 4. 售后进度卡片 ─────────────────────────

function AfterSaleCardView({ afterSale }: { afterSale: AfterSale }) {
  return (
    <Shell title={`售后单 ${afterSale.id}`} right={<AfterSaleStatusBadge status={afterSale.status} />}>
      <div className="px-3.5 pt-3 text-xs leading-5 text-warm">
        <span className="font-medium text-foreground">{AFTER_SALE_TYPE_LABEL[afterSale.type]}</span>
        {afterSale.type === "exchange" && afterSale.newSize ? <span> · 换为 {afterSale.newSize as Size} 码</span> : null}
        {afterSale.amount > 0 ? <span> · {money(afterSale.amount)}</span> : null}
        <span> · 订单 {afterSale.orderId}</span>
        {afterSale.reason ? <div className="truncate">原因：{afterSale.reason}</div> : null}
      </div>
      <ol className="px-3.5 pb-1 pt-3">
        {afterSale.timeline.map((t, i) => {
          const last = i === afterSale.timeline.length - 1;
          return (
            <li key={`${t.at}-${i}`} className="relative flex gap-3 pb-3">
              {i < afterSale.timeline.length - 1 && <span className="absolute left-[5px] top-3 h-full w-px bg-line" />}
              <span
                className={`relative z-10 mt-1 h-[11px] w-[11px] shrink-0 rounded-full border-2 ${
                  last ? "border-brand bg-brand" : "border-line bg-white"
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className={`text-[13px] leading-5 ${last ? "font-medium text-foreground" : "text-foreground/75"}`}>{t.note}</div>
                <div className="mt-0.5 text-[11px] text-warm">{shortDateTime(t.at)}</div>
              </div>
            </li>
          );
        })}
      </ol>
    </Shell>
  );
}

// ───────────────────────── 5. 确认卡片（演示亮点） ─────────────────────────

const TOOL_TITLE: Record<PendingAction["tool"], string> = {
  apply_refund: "申请退款",
  request_exchange: "申请换货",
  modify_address: "修改收货地址",
  cancel_order: "取消订单",
};

function ConfirmCardView({
  pending,
  resolution,
  disabled,
  onConfirm,
}: {
  pending: PendingAction;
  resolution?: ConfirmResolution;
  disabled: boolean;
  onConfirm: (pendingActionId: string, confirm: boolean) => void;
}) {
  // 后端已处理过（刷新 / 恢复会话时）→ 以后端状态为准；否则用本地状态
  const settled: ConfirmResolution | undefined =
    pending.status !== "pending"
      ? { status: pending.status === "confirmed" ? "confirmed" : pending.status === "cancelled" ? "cancelled" : "failed", result: pending.result }
      : resolution;
  const busy = settled?.status === "busy";
  const done = settled && !busy;

  const tone =
    settled?.status === "confirmed"
      ? { ring: "ring-success/40", badge: "bg-green-50 text-success", label: "已确认办理" }
      : settled?.status === "cancelled"
        ? { ring: "ring-line", badge: "bg-[#efece5] text-warm", label: "已取消" }
        : settled?.status === "failed"
          ? { ring: "ring-risk/40", badge: "bg-[#fbeee6] text-risk", label: "办理失败" }
          : { ring: "ring-brand/50", badge: "bg-amber-50 text-amber-700", label: "待您确认" };

  return (
    <div
      className={`mt-2 overflow-hidden rounded-xl bg-white text-left shadow-card ring-2 ${tone.ring} ${done || busy ? "" : "confirm-pulse"}`}
      data-testid="confirm-card"
      data-status={settled?.status ?? "pending"}
    >
      <div className="flex items-center justify-between gap-2 bg-brand-soft/70 px-3.5 py-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-brand">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
            <path d="M8 1.5 2.5 3.7v3.9c0 3.2 2.3 5.6 5.5 6.9 3.2-1.3 5.5-3.7 5.5-6.9V3.7L8 1.5Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            <path d="m5.6 8.1 1.8 1.8 3.2-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          请确认：{TOOL_TITLE[pending.tool]}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone.badge}`}>{busy ? "处理中…" : tone.label}</span>
      </div>
      <div className="px-3.5 py-3 text-sm leading-6 text-foreground">{pending.summary}</div>
      {done ? (
        <div
          className={`border-t border-line/70 px-3.5 py-2.5 text-xs leading-5 ${
            settled.status === "confirmed" ? "bg-green-50/60 text-success" : settled.status === "failed" ? "bg-[#fbeee6]/60 text-risk" : "bg-cream/60 text-warm"
          }`}
        >
          {settled.status === "confirmed" ? "✓ " : ""}
          {settled.result ?? (settled.status === "confirmed" ? "操作已完成" : settled.status === "cancelled" ? "您取消了本次操作，没有任何改动" : "请稍后再试或联系人工客服")}
        </div>
      ) : (
        <div className="flex gap-2 border-t border-line/70 px-3.5 py-2.5">
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => onConfirm(pending.id, true)}
            className="h-9 flex-1 rounded-full bg-brand text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-warm/40"
          >
            {busy ? "处理中…" : "确认"}
          </button>
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => onConfirm(pending.id, false)}
            className="h-9 flex-1 rounded-full border border-line bg-white text-sm font-medium text-foreground transition hover:bg-cream disabled:cursor-not-allowed disabled:text-warm/50"
          >
            取消
          </button>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── 6. 选项卡片 ─────────────────────────

function OptionsCardView({
  card,
  chosen,
  answered,
  disabled,
  onSelect,
}: {
  card: Extract<ChatCard, { kind: "options" }>;
  chosen?: string;
  answered: boolean;
  disabled: boolean;
  onSelect: (value: string, label: string) => void;
}) {
  const locked = answered || !!chosen || disabled;
  return (
    <Shell title={card.prompt}>
      <ul className="divide-y divide-line/70">
        {card.options.map((o) => {
          const isChosen = chosen === o.value;
          return (
            <li key={o.value}>
              <button
                type="button"
                disabled={locked}
                onClick={() => onSelect(o.value, o.label)}
                className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition ${
                  isChosen ? "bg-brand-soft" : locked ? "opacity-55" : "hover:bg-brand-soft/60"
                } disabled:cursor-default`}
              >
                {o.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.image} alt="" className="h-11 w-9 shrink-0 rounded object-cover" />
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{o.label}</span>
                  {o.sublabel ? <span className="mt-0.5 block truncate text-xs text-warm">{o.sublabel}</span> : null}
                </span>
                {isChosen ? (
                  <span className="text-xs font-medium text-brand">已选择 ✓</span>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="shrink-0 text-warm">
                    <path d="m5 3 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </Shell>
  );
}

// ───────────────────────── 7. 尺码结果卡片 ─────────────────────────

function SizeResultCardView({ card }: { card: Extract<ChatCard, { kind: "size_result" }> }) {
  return (
    <Shell title="尺码推荐">
      <div className="flex items-center gap-3.5 px-3.5 py-3">
        <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full bg-brand text-white shadow-card">
          <span className="text-xl font-semibold leading-none">{card.size}</span>
          <span className="mt-0.5 text-[10px] leading-none opacity-80">码</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">推荐 {card.size} 码</div>
          <p className="mt-0.5 text-xs leading-5 text-warm">{card.basis}</p>
        </div>
      </div>
      {card.productId ? (
        <div className="border-t border-line/70 bg-cream/60 px-3.5 py-2 text-right text-xs">
          <Link href={`/product/${card.productId}`} className="font-medium text-brand hover:underline">
            去商品页选择 {card.size} 码 →
          </Link>
        </div>
      ) : null}
    </Shell>
  );
}

// ───────────────────────── 8. 优惠券卡片 ─────────────────────────

function CouponRow({ c }: { c: Coupon }) {
  return (
    <li className="flex overflow-hidden rounded-lg bg-[#fbf3e6] ring-1 ring-[#ecd9b8]">
      <div className="flex w-[84px] shrink-0 flex-col items-center justify-center border-r border-dashed border-[#e0c99c] bg-[#f6e7c9] px-2 py-2.5 text-[#8a5a12]">
        <span className="text-[11px]">立减</span>
        <span className="text-xl font-semibold leading-6">¥{c.discount}</span>
      </div>
      <div className="min-w-0 flex-1 px-3 py-2">
        <div className="truncate text-sm font-medium text-foreground">{c.title}</div>
        <div className="mt-0.5 text-[11px] text-warm">
          {c.scope === "全店" ? "全店通用" : `仅限${c.scope}`} · {dateOnly(c.expiresAt).slice(5)} 到期
        </div>
      </div>
    </li>
  );
}

function CouponsCardView({ coupons }: { coupons: Coupon[] }) {
  return (
    <Shell title={`可用优惠券 · ${coupons.length} 张`}>
      {coupons.length === 0 ? (
        <p className="px-3.5 py-3 text-sm text-warm">暂无可用优惠券</p>
      ) : (
        <ul className="space-y-2 p-2.5">
          {coupons.map((c) => (
            <CouponRow key={c.id} c={c} />
          ))}
        </ul>
      )}
    </Shell>
  );
}

// ───────────────────────── 9. 来源引用卡片（可折叠） ─────────────────────────

function SourcesCardView({ sources }: { sources: Extract<ChatCard, { kind: "sources" }>["sources"] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 overflow-hidden rounded-xl bg-white/70 text-left ring-1 ring-line">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-xs text-warm hover:bg-cream/70"
      >
        <span className="flex items-center gap-1.5">
          <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden>
            <path d="M3 1.8h6.2L11.5 4v8.2H3V1.8Z M9 1.8V4h2.5 M5 7h4.5 M5 9.3h4.5" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          参考了 {sources.length} 条资料
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className={`transition ${open ? "rotate-180" : ""}`}>
          <path d="m3 4.5 3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul className="space-y-2 border-t border-line/70 px-3 py-2.5">
          {sources.map((s, i) => (
            <li key={`${s.docTitle}-${i}`} className="text-xs leading-5">
              <div className="font-medium text-foreground">
                《{s.docTitle}》{s.heading ? ` · ${s.heading}` : ""}
              </div>
              <p className="mt-0.5 border-l-2 border-brand/30 pl-2 text-warm">{s.snippet}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ───────────────────────── 分发 ─────────────────────────

export function CardView({ card, ctx }: { card: ChatCard; ctx: CardContext }) {
  switch (card.kind) {
    case "order":
      return <OrderCardView order={card.order} />;
    case "logistics":
      return <LogisticsCardView orderId={card.orderId} logistics={card.logistics} />;
    case "product":
      return <ProductCardView product={card.product} />;
    case "aftersale":
      return <AfterSaleCardView afterSale={card.afterSale} />;
    case "confirm":
      return (
        <ConfirmCardView
          pending={card.pendingAction}
          resolution={ctx.resolutionOf(card.pendingAction.id)}
          disabled={ctx.sending}
          onConfirm={ctx.onConfirm}
        />
      );
    case "options":
      return (
        <OptionsCardView
          card={card}
          chosen={ctx.chosenOf(ctx.message.id)}
          answered={!ctx.isLast}
          disabled={ctx.sending}
          onSelect={(value, label) => ctx.onSelectOption(ctx.message.id, value, label)}
        />
      );
    case "size_result":
      return <SizeResultCardView card={card} />;
    case "coupons":
      return <CouponsCardView coupons={card.coupons} />;
    case "sources":
      return <SourcesCardView sources={card.sources} />;
  }
}
