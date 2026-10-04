"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useShop } from "@/components/shop/ShopProvider";
import { STEPS } from "./steps";
import { clearTryScript, peekTryScript, useDemo } from "./storage";

/**
 * 买家端才有 ShopProvider。演示步需要「切买家、打开聊天、填话术」时在这里做。
 * 卖家端页面不会挂这个组件。
 */
export function DemoShopBridge() {
  const demo = useDemo();
  const { ready, buyerId, chatOpen, setBuyerId, openChat } = useShop();
  const seen = useRef<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!ready) return;
    const script = peekTryScript();
    if (!script) return;
    setBuyerId(script.buyerId);
    if (pathname !== "/") router.push("/");
    openChat({ draft: script.draft, newConversation: true });
    const timer = window.setTimeout(() => clearTryScript(), 800);
    return () => window.clearTimeout(timer);
  }, [ready, pathname, router, setBuyerId, openChat]);

  useEffect(() => {
    if (!ready || !demo.active) return;
    const step = STEPS[demo.stepId];
    if (!step.shop) {
      seen.current = demo.stepId;
      return;
    }
    // 先等买家切过去再打开聊天。同一次渲染里又换买家又打开，会把「恢复上次对话」的请求取消掉。
    // 买家还没切过去时不要记「这一步已经处理」，否则切完之后会被当成重复渲染，话术填不进去。
    if (buyerId !== step.shop.buyerId) {
      setBuyerId(step.shop.buyerId);
      return;
    }
    const entered = seen.current !== demo.stepId;
    // 聊天窗被关掉时再打开。只有「点发送」这种新的一步才新开对话，避免把刚回来的卡片清掉。
    if (!entered && chatOpen) return;
    seen.current = demo.stepId;
    const fresh = step.shop.fresh && (entered || !chatOpen);
    openChat({
      ...step.shop.target,
      ...(fresh && step.shop.draft ? { draft: step.shop.draft, newConversation: true } : {}),
    });
  }, [ready, demo.active, demo.stepId, buyerId, chatOpen, setBuyerId, openChat]);

  return null;
}
