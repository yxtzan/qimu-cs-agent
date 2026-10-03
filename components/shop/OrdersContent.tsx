"use client";

import { useMemo, useState } from "react";
import { getOrders } from "@/lib/api-client";
import type { OrderStatus } from "@/lib/types";
import { ORDER_STATUS_LABEL, ORDER_STATUS_ORDER } from "./labels";
import { OrderCard } from "./OrderCard";
import { BuyerGate, useShop } from "./ShopProvider";
import { EmptyState, ErrorState, friendlyError } from "./states";
import { useAsync } from "./useAsync";

type Tab = "all" | OrderStatus;

function OrdersInner() {
  const { buyerId, buyer } = useShop();
  const [tab, setTab] = useState<Tab>("all");
  const { data, error, loading, reload } = useAsync(() => getOrders(buyerId), [buyerId]);

  const counts = useMemo(() => {
    const c: Partial<Record<OrderStatus, number>> = {};
    data?.forEach((o) => {
      c[o.status] = (c[o.status] ?? 0) + 1;
    });
    return c;
  }, [data]);

  const visible = data?.filter((o) => tab === "all" || o.status === tab) ?? [];
  const tabs: { key: Tab; label: string; count: number | undefined }[] = [
    { key: "all", label: "全部", count: data?.length },
    ...ORDER_STATUS_ORDER.map((s) => ({ key: s as Tab, label: ORDER_STATUS_LABEL[s], count: counts[s] })),
  ];

  return (
    <main className="mx-auto w-full max-w-[960px] px-6 pb-4 pt-10">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">我的订单</h1>
          <p className="mt-1 text-sm text-warm">
            {buyer ? `${buyer.nickname} 的订单` : "加载中…"}
            {data ? ` · 共 ${data.length} 单` : ""}
          </p>
        </div>
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {tabs.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              className={`relative whitespace-nowrap px-4 py-3 text-sm transition ${
                active ? "font-medium text-brand" : "text-warm hover:text-foreground"
              }`}
            >
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className={`ml-1.5 text-xs ${active ? "text-brand" : "text-warm/80"}`}>{t.count}</span>
              )}
              {active && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-brand" />}
            </button>
          );
        })}
      </div>

      {error ? (
        <ErrorState message={friendlyError(error, "订单暂时没加载出来")} onRetry={reload} />
      ) : loading && !data ? (
        <div className="space-y-5">
          {[0, 1].map((i) => (
            <div key={i} className="h-56 animate-pulse rounded-card bg-white/70" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          title={tab === "all" ? `${buyer?.nickname ?? "你"}还没有下过单` : `没有「${ORDER_STATUS_LABEL[tab]}」的订单`}
          hint={
            tab === "all"
              ? "可以在右上角切换演示买家，看看其他人的订单；或者先去逛逛新品。"
              : "切换到其他状态看看，或者回到「全部」。"
          }
          actionHref={tab === "all" ? "/" : undefined}
          actionLabel="去逛逛"
        />
      ) : (
        <div className={`space-y-5 transition-opacity ${loading ? "opacity-60" : ""}`}>
          {visible.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
        </div>
      )}
    </main>
  );
}

export function OrdersContent() {
  return (
    <BuyerGate>
      <OrdersInner />
    </BuyerGate>
  );
}
