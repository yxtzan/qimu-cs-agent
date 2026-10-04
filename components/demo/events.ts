import type { Conversation, RouteTrace } from "@/lib/types";

/** 演示导览用的 window 事件。现有组件只负责派发，导览层负责听。 */
export const DEMO_START = "qimu:demo-start";
export const DEMO_MESSAGE_SENT = "qimu:demo-message-sent";
export const DEMO_AI_REPLIED = "qimu:demo-ai-replied";
export const DEMO_CONFIRMED = "qimu:demo-confirmed";
export const DEMO_TOOK_OVER = "qimu:demo-took-over";
export const DEMO_SELLER_REPLIED = "qimu:demo-seller-replied";
export const DEMO_PREFILL = "qimu:demo-prefill";

export interface DemoReplyDetail {
  trace: RouteTrace | null;
  conversationId: string;
  status: Conversation["status"];
  hasConfirm: boolean;
}

export interface DemoConfirmDetail {
  trace: RouteTrace | null;
}

export interface DemoPrefillDetail {
  text: string;
}

export function emitDemo(name: string, detail?: unknown) {
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch {
    /* 私密模式等极端情况下忽略 */
  }
}
