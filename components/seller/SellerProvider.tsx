"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getBuyers, listConversations } from "@/lib/api-client";
import type { Buyer, Conversation } from "@/lib/types";
import { useAsync } from "@/components/shop/useAsync";

interface SellerContextValue {
  /** null = 首次加载中 */
  conversations: Conversation[] | null;
  error: Error | null;
  buyers: Map<string, Buyer>;
  waitingCount: number;
  /** 立即重新拉取会话列表（接管 / 交还 / 回复之后调用）。 */
  refresh: () => void;
}

const SellerContext = createContext<SellerContextValue | null>(null);

const POLL_MS = 3000; // 任务卡：会话列表每 3 秒刷新

export function SellerProvider({ children }: { children: React.ReactNode }) {
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const convs = useAsync(() => listConversations(), [tick]);
  const buyerList = useAsync(() => getBuyers(), []);

  const buyers = useMemo(() => new Map((buyerList.data ?? []).map((b) => [b.id, b])), [buyerList.data]);

  const value = useMemo<SellerContextValue>(
    () => ({
      conversations: convs.data,
      error: convs.error,
      buyers,
      waitingCount: (convs.data ?? []).filter((c) => c.status === "waiting_human").length,
      refresh,
    }),
    [convs.data, convs.error, buyers, refresh],
  );

  return <SellerContext.Provider value={value}>{children}</SellerContext.Provider>;
}

export function useSeller(): SellerContextValue {
  const ctx = useContext(SellerContext);
  if (!ctx) throw new Error("useSeller must be used inside <SellerProvider>");
  return ctx;
}
