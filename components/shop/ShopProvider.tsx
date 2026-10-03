"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { getBuyers } from "@/lib/api-client";
import type { Buyer } from "@/lib/types";

const STORAGE_KEY = "qimu.buyerId";
const DEFAULT_BUYER_ID = "B001";

export interface ChatTarget {
  productId?: string;
  orderId?: string;
}

interface ShopContextValue {
  buyers: Buyer[];
  /** 当前演示买家；买家列表加载完之前为 null */
  buyer: Buyer | null;
  /** 当前买家 id（始终有值，加载前用默认 B001） */
  buyerId: string;
  /** localStorage 中的买家已读取完毕（读取前不要发依赖 buyerId 的请求） */
  ready: boolean;
  setBuyerId: (id: string) => void;
  /**
   * 打开客服聊天窗（右侧抽屉，components/chat/ChatWidget.tsx）。
   * target 决定聊天窗里"上下文条"显示的商品 / 订单，并作为 context 随消息发给后端。
   */
  openChat: (target?: ChatTarget) => void;
  closeChat: () => void;
  chatOpen: boolean;
  chatTarget: ChatTarget | null;
}

const ShopContext = createContext<ShopContextValue | null>(null);

// 当前买家存在 localStorage（try/catch 包裹；不可用时退化为内存），用 useSyncExternalStore 读取，
// 这样服务端渲染/水合阶段用默认买家，水合后自动切换到存储的买家，无需在 effect 里 setState。
let memoryBuyerId: string | null = null;
const buyerListeners = new Set<() => void>();

function subscribeBuyer(listener: () => void) {
  buyerListeners.add(listener);
  return () => {
    buyerListeners.delete(listener);
  };
}

function getBuyerSnapshot(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? memoryBuyerId ?? DEFAULT_BUYER_ID;
  } catch {
    return memoryBuyerId ?? DEFAULT_BUYER_ID;
  }
}

const getServerBuyerSnapshot = () => DEFAULT_BUYER_ID;

function storeBuyerId(id: string) {
  memoryBuyerId = id;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* localStorage 不可用（隐私模式等）时忽略，仅保留内存状态 */
  }
  buyerListeners.forEach((l) => l());
}

const subscribeNothing = () => () => {};

export function ShopProvider({ children }: { children: ReactNode }) {
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const storedBuyerId = useSyncExternalStore(subscribeBuyer, getBuyerSnapshot, getServerBuyerSnapshot);
  // 水合完成后为 true（服务端与水合阶段为 false）
  const ready = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  const [chatOpen, setChatOpen] = useState(false);
  const [chatTarget, setChatTarget] = useState<ChatTarget | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBuyers()
      .then((list) => {
        if (!cancelled) setBuyers(list);
      })
      .catch((e) => console.error("加载买家列表失败", e));
    return () => {
      cancelled = true;
    };
  }, []);

  // 存储里的买家 id 不在列表里（例如重置过数据）→ 回落到第一个
  const buyerId =
    buyers.length > 0 && !buyers.some((b) => b.id === storedBuyerId) ? buyers[0].id : storedBuyerId;

  const setBuyerId = useCallback((id: string) => {
    storeBuyerId(id);
    setChatTarget(null); // 换了买家，原来的「正在咨询」订单 / 商品不再适用
  }, []);

  const openChat = useCallback((target?: ChatTarget) => {
    setChatTarget(target ?? null);
    setChatOpen(true);
  }, []);

  const closeChat = useCallback(() => setChatOpen(false), []);

  const value = useMemo<ShopContextValue>(
    () => ({
      buyers,
      buyer: buyers.find((b) => b.id === buyerId) ?? null,
      buyerId,
      ready,
      setBuyerId,
      openChat,
      closeChat,
      chatOpen,
      chatTarget,
    }),
    [buyers, buyerId, ready, setBuyerId, openChat, closeChat, chatOpen, chatTarget],
  );

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop(): ShopContextValue {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error("useShop 必须在 ShopProvider 内使用");
  return ctx;
}

/** 等到当前买家确定后再渲染子内容，避免先用默认买家请求一次、再切换造成闪烁。 */
export function BuyerGate({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const { ready } = useShop();
  return <>{ready ? children : fallback}</>;
}
