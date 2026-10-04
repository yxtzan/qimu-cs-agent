"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ApiError, getOrder } from "@/lib/api-client";
import type { AfterSale, Logistics, Order } from "@/lib/types";
import { AFTER_SALE_TYPE_LABEL, LOGISTICS_STATUS_LABEL } from "./labels";
import { fullDateTime, maskPhone, money, shortDateTime } from "./format";
import { OrderItemRow } from "./OrderCard";
import { BuyerGate, useShop } from "./ShopProvider";
import { AfterSaleStatusBadge, OrderStatusBadge, PlainBadge } from "./StatusBadge";
import { ErrorState, friendlyError } from "./states";
import { useAsync } from "./useAsync";

function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-card bg-white p-6 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

// ───────────────────────── 进度条 ─────────────────────────

function Stepper({ order }: { order: Order }) {
  const steps: { label: string; at?: string }[] = [
    { label: "已下单", at: order.createdAt },
    { label: "已付款", at: order.paidAt },
    { label: "已发货", at: order.shippedAt },
    { label: "已签收", at: order.deliveredAt },
    { label: "已完成" },
  ];
  const reached = { pending_payment: 0, paid: 1, shipped: 2, delivered: 3, completed: 4, cancelled: -1 }[order.status];

  if (order.status === "cancelled") {
    return (
      <div className="rounded-lg bg-[#efece5] px-5 py-4 text-sm text-warm">
        订单已取消{order.remark ? `：${order.remark}` : ""}
      </div>
    );
  }
  return (
    <ol className="flex items-start">
      {steps.map((s, i) => {
        const done = i <= reached;
        return (
          <li key={s.label} className="relative flex flex-1 flex-col items-center text-center">
            {i > 0 && (
              <span
                className={`absolute right-1/2 top-[11px] h-0.5 w-full ${i <= reached ? "bg-brand" : "bg-line"}`}
                aria-hidden
              />
            )}
            <span
              className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                done ? "bg-brand text-white" : "border-2 border-line bg-white text-transparent"
              }`}
            >
              {done ? "✓" : "·"}
            </span>
            <span className={`mt-2 text-sm ${done ? "font-medium text-foreground" : "text-warm"}`}>{s.label}</span>
            <span className="mt-0.5 h-4 text-xs text-warm">{done && s.at ? shortDateTime(s.at) : ""}</span>
          </li>
        );
      })}
    </ol>
  );
}

// ───────────────────────── 物流时间线 ─────────────────────────

function LogisticsTimeline({ logistics }: { logistics: Logistics }) {
  return (
    <div data-testid="logistics">
      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg bg-cream px-4 py-3 text-sm">
        <span className="font-medium">{logistics.carrier}</span>
        <span className="text-warm">运单号 {logistics.trackingNo}</span>
        <PlainBadge tone={logistics.status === "exception" ? "orange" : logistics.status === "delivered" ? "green" : "blue"}>
          {LOGISTICS_STATUS_LABEL[logistics.status]}
        </PlainBadge>
        {logistics.estimatedDelivery && logistics.status !== "delivered" && (
          <span className="ml-auto text-warm">预计 {logistics.estimatedDelivery.slice(5, 10)} 送达</span>
        )}
      </div>
      <ol className="ml-1">
        {logistics.events.map((e, i) => {
          const latest = i === 0;
          const last = i === logistics.events.length - 1;
          return (
            <li key={e.at + e.description} className="relative flex gap-4 pb-5 last:pb-0">
              {!last && <span className="absolute left-[5px] top-4 h-full w-px bg-line" aria-hidden />}
              <span
                className={`relative z-10 mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full ${
                  latest ? "bg-brand ring-4 ring-brand/15" : "bg-line"
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className={`text-sm leading-relaxed ${latest ? "font-medium text-foreground" : "text-foreground/70"}`}>
                  {e.description}
                </div>
                <div className="mt-0.5 text-xs text-warm">
                  {fullDateTime(e.at)} · {e.location}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ───────────────────────── 售后 ─────────────────────────

function AfterSaleBlock({ a, order }: { a: AfterSale; order: Order }) {
  const item = order.items.find((i) => i.itemId === a.itemId);
  return (
    <div className="rounded-lg border border-line p-5" data-testid="aftersale">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium">{AFTER_SALE_TYPE_LABEL[a.type]}</span>
        <AfterSaleStatusBadge status={a.status} />
        <span className="ml-auto text-sm text-warm">售后单 {a.id}</span>
      </div>
      <dl className="mt-4 grid grid-cols-[72px_1fr] gap-y-2 text-sm">
        {item && (
          <>
            <dt className="text-warm">商品</dt>
            <dd>
              {item.productName}（{item.color} · {item.size}）
            </dd>
          </>
        )}
        <dt className="text-warm">原因</dt>
        <dd>
          {a.reason}
          {a.reasonCategory && <span className="ml-2 text-warm">· {a.reasonCategory}</span>}
        </dd>
        <dt className="text-warm">{a.type === "exchange" ? "换货" : "退款金额"}</dt>
        <dd className="font-medium">
          {a.type === "exchange" ? [a.newColor, a.newSize].filter(Boolean).join(" · ") || "—" : money(a.amount)}
        </dd>
        <dt className="text-warm">申请时间</dt>
        <dd>{fullDateTime(a.createdAt)}</dd>
      </dl>
      <ol className="mt-5 border-t border-line pt-5">
        {[...a.timeline].reverse().map((t, i, arr) => (
          <li key={t.at + t.status} className="relative flex gap-3 pb-4 last:pb-0">
            {i < arr.length - 1 && <span className="absolute left-[4px] top-3.5 h-full w-px bg-line" aria-hidden />}
            <span className={`relative z-10 mt-1.5 h-[9px] w-[9px] shrink-0 rounded-full ${i === 0 ? "bg-brand" : "bg-line"}`} />
            <div>
              <div className={`text-sm ${i === 0 ? "font-medium" : "text-foreground/70"}`}>{t.note}</div>
              <div className="mt-0.5 text-xs text-warm">{fullDateTime(t.at)}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ───────────────────────── 页面 ─────────────────────────

function Detail({ order }: { order: Order }) {
  const { openChat } = useShop();
  return (
    <main className="mx-auto w-full max-w-[1100px] px-6 pb-4 pt-8">
      <nav className="mb-5 flex items-center gap-2 text-sm text-warm" aria-label="面包屑">
        <Link href="/orders" className="hover:text-brand">
          我的订单
        </Link>
        <span>/</span>
        <span className="text-foreground">{order.id}</span>
      </nav>

      <div className="mb-6 flex items-center gap-4">
        <h1 className="text-2xl font-semibold">订单详情</h1>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="grid grid-cols-12 items-start gap-6">
        <div className="col-span-8 space-y-6">
          <section className="rounded-card bg-white px-8 py-7 shadow-card">
            <Stepper order={order} />
          </section>

          <Card title="商品清单">
            <div className="space-y-4">
              {order.items.map((it) => (
                <OrderItemRow key={it.itemId} item={it} />
              ))}
            </div>
          </Card>

          {order.logistics ? (
            <Card title="物流信息">
              <LogisticsTimeline logistics={order.logistics} />
            </Card>
          ) : (
            order.status !== "cancelled" && (
              <Card title="物流信息">
                <p className="text-sm text-warm">
                  {order.status === "pending_payment"
                    ? "订单尚未付款，付款后 48 小时内发货。"
                    : "商家正在备货，付款后 48 小时内发出，发货后这里会显示物流进度。"}
                </p>
              </Card>
            )
          )}

          {order.afterSales.length > 0 && (
            <Card title="售后">
              <div className="space-y-4">
                {order.afterSales.map((a) => (
                  <AfterSaleBlock key={a.id} a={a} order={order} />
                ))}
              </div>
            </Card>
          )}
        </div>

        <aside className="sticky top-24 col-span-4 space-y-6">
          <Card title="金额明细">
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-warm">商品总额</dt>
                <dd>{money(order.totalAmount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-warm">优惠</dt>
                <dd className={order.discount > 0 ? "text-success" : ""}>
                  {order.discount > 0 ? `-${money(order.discount)}` : money(0)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-line pt-3">
                <dt className="font-medium">实付款</dt>
                <dd className="text-xl font-semibold text-brand">{money(order.payAmount)}</dd>
              </div>
            </dl>
          </Card>

          <Card title="收货信息">
            <div className="space-y-1 text-sm">
              <div className="font-medium">
                {order.address.name} <span className="ml-2 font-normal text-warm">{maskPhone(order.address.phone)}</span>
              </div>
              <div className="leading-relaxed text-foreground/75">
                {order.address.region} {order.address.detail}
              </div>
            </div>
          </Card>

          <Card title="订单信息">
            <dl className="grid grid-cols-[64px_1fr] gap-y-2 text-sm">
              <dt className="text-warm">订单号</dt>
              <dd>{order.id}</dd>
              <dt className="text-warm">下单</dt>
              <dd>{fullDateTime(order.createdAt)}</dd>
              {order.paidAt && (
                <>
                  <dt className="text-warm">付款</dt>
                  <dd>{fullDateTime(order.paidAt)}</dd>
                </>
              )}
              {order.shippedAt && (
                <>
                  <dt className="text-warm">发货</dt>
                  <dd>{fullDateTime(order.shippedAt)}</dd>
                </>
              )}
              {order.deliveredAt && (
                <>
                  <dt className="text-warm">签收</dt>
                  <dd>{fullDateTime(order.deliveredAt)}</dd>
                </>
              )}
              {order.remark && order.status !== "cancelled" && (
                <>
                  <dt className="text-warm">备注</dt>
                  <dd>{order.remark}</dd>
                </>
              )}
            </dl>
          </Card>

          <button
            type="button"
            onClick={() => openChat({ orderId: order.id })}
            className="h-12 w-full rounded-full bg-brand text-[15px] font-medium text-white transition hover:bg-brand-dark"
          >
            联系客服
          </button>
        </aside>
      </div>
    </main>
  );
}

function OrderDetailInner({ id }: { id: string }) {
  const { buyerId, buyer } = useShop();
  const { data, error, loading, reload } = useAsync(() => getOrder(id, buyerId), [id, buyerId]);
  // 聊天里确认办理成功后，订单上的售后是新写进去的，这里再拉一次，左边才能看到
  useEffect(() => {
    const onUpdate = (event: Event) => {
      const orderId = (event as CustomEvent<{ orderId?: string }>).detail?.orderId;
      if (orderId && orderId !== id) return;
      reload();
    };
    window.addEventListener("qimu:order-updated", onUpdate);
    return () => window.removeEventListener("qimu:order-updated", onUpdate);
  }, [id, reload]);

  if (error) {
    const forbidden = error instanceof ApiError && error.status === 403;
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <main className="mx-auto w-full max-w-[640px] flex-1 px-6 py-20">
        <ErrorState
          message={
            forbidden
              ? `这个订单不属于「${buyer?.nickname ?? "当前买家"}」`
              : missing
                ? "没有找到这个订单"
                : friendlyError(error, "订单暂时没加载出来")
          }
          onRetry={forbidden || missing ? undefined : reload}
          backHref="/orders"
          backLabel="回到我的订单"
        />
        {forbidden && <p className="mt-4 text-center text-sm text-warm">可以在右上角切换买家，或回到自己的订单列表。</p>}
      </main>
    );
  }
  if (loading && !data) {
    return (
      <main className="mx-auto w-full max-w-[1100px] px-6 pt-12">
        <div className="h-40 animate-pulse rounded-card bg-white/70" />
      </main>
    );
  }
  return data ? <Detail order={data} /> : null;
}

export function OrderDetail({ id }: { id: string }) {
  return (
    <BuyerGate>
      <OrderDetailInner id={id} />
    </BuyerGate>
  );
}
