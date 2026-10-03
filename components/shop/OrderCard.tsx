"use client";

import Link from "next/link";
import type { Order, OrderItem } from "@/lib/types";
import { AFTER_SALE_TYPE_LABEL } from "./labels";
import { fullDateTime, money, relativeTime } from "./format";
import { ProductImage } from "./ProductImage";
import { AfterSaleStatusBadge, OrderStatusBadge } from "./StatusBadge";
import { useShop } from "./ShopProvider";

export function OrderItemRow({ item, linkToProduct = true }: { item: OrderItem; linkToProduct?: boolean }) {
  const body = (
    <>
      <div className="h-24 w-[72px] shrink-0 overflow-hidden rounded-lg bg-[#ece7dc]">
        <ProductImage color={item.color} name={item.productName} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium text-foreground">{item.productName}</div>
        <div className="mt-1 text-sm text-warm">
          {item.color} · {item.size}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm text-foreground">{money(item.unitPrice)}</div>
        <div className="mt-1 text-sm text-warm">× {item.quantity}</div>
      </div>
    </>
  );
  return linkToProduct ? (
    <Link href={`/product/${item.productId}`} className="flex items-center gap-4 rounded-lg transition hover:opacity-80">
      {body}
    </Link>
  ) : (
    <div className="flex items-center gap-4">{body}</div>
  );
}

export function OrderCard({ order }: { order: Order }) {
  const { openChat } = useShop();
  return (
    <article className="overflow-hidden rounded-card bg-white shadow-card" data-testid="order-card">
      <header className="flex items-center justify-between border-b border-line px-6 py-3.5 text-sm">
        <div className="flex items-center gap-4 text-warm">
          <span className="font-medium text-foreground">订单号 {order.id}</span>
          <span title={fullDateTime(order.createdAt)}>{relativeTime(order.createdAt)}下单</span>
        </div>
        <OrderStatusBadge status={order.status} />
      </header>

      <div className="space-y-4 px-6 py-5">
        {order.items.map((it) => (
          <OrderItemRow key={it.itemId} item={it} />
        ))}
      </div>

      {order.afterSales.length > 0 && (
        <div className="mx-6 mb-5 space-y-2 rounded-lg bg-cream px-4 py-3 text-sm">
          {order.afterSales.map((a) => (
            <div key={a.id} className="flex items-center gap-3">
              <span className="text-warm">售后</span>
              <span className="font-medium">{AFTER_SALE_TYPE_LABEL[a.type]}</span>
              <AfterSaleStatusBadge status={a.status} />
              <span className="ml-auto text-warm">{money(a.amount)}</span>
            </div>
          ))}
        </div>
      )}

      <footer className="flex items-center justify-between border-t border-line px-6 py-4">
        <div className="text-sm text-warm">
          共 {order.items.reduce((n, i) => n + i.quantity, 0)} 件 · 实付{" "}
          <span className="text-lg font-semibold text-foreground">{money(order.payAmount)}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => openChat({ orderId: order.id })}
            className="rounded-full border border-brand px-5 py-2 text-sm font-medium text-brand transition hover:bg-brand-soft"
          >
            联系客服
          </button>
          <Link
            href={`/orders/${order.id}`}
            className="rounded-full bg-brand px-5 py-2 text-sm font-medium text-white transition hover:bg-brand-dark"
          >
            查看详情
          </Link>
        </div>
      </footer>
    </article>
  );
}
