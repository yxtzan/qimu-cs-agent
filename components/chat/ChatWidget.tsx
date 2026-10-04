"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getConversationMessages,
  getLatestConversation,
  getOrder,
  getProduct,
  sendChat,
  type ChatRequest,
  type ChatResponse,
} from "@/lib/api-client";
import { nowIso } from "@/lib/demo-clock";
import type { ChatAction, ChatMessage, Conversation, RouteTrace } from "@/lib/types";
import { money } from "@/components/shop/format";
import { ProductImage } from "@/components/shop/ProductImage";
import { type ChatTarget, useShop } from "@/components/shop/ShopProvider";
import { OrderStatusBadge } from "@/components/shop/StatusBadge";
import { useAsync } from "@/components/shop/useAsync";
import { CardView, type CardContext, type ConfirmResolution } from "./ChatCards";
import { DebugLine } from "./DebugLine";

const DEBUG_KEY = "qimu.chatDebug";
const POLL_MS = 2000;

type Page = NonNullable<ChatRequest["context"]>["page"];

/** 界面上的消息 = 契约消息 + 本地状态（乐观发送中 / 发送失败） */
type UiMessage = ChatMessage & { local?: "sending" | "failed" };

interface SendInput {
  text?: string;
  action?: ChatAction;
}

interface SendError {
  input: SendInput;
  label?: string;
  message: string;
}

const QUICK_BUTTONS: { label: string; action: ChatAction }[] = [
  { label: "查物流", action: { type: "quick_action", name: "track_logistics" } },
  { label: "退款进度", action: { type: "quick_action", name: "refund_progress" } },
  { label: "尺码推荐", action: { type: "quick_action", name: "size_recommend" } },
  { label: "转人工", action: { type: "quick_action", name: "human" } },
];

function pageOf(pathname: string): Page {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/product/")) return "product";
  if (pathname === "/orders") return "orders";
  if (pathname.startsWith("/orders/")) return "order_detail";
  return undefined;
}

/** 悬浮按钮打开时，根据当前页面自动带上上下文（商品页 → 该商品，订单详情页 → 该订单）。 */
function targetFromPath(pathname: string): ChatTarget | undefined {
  const p = pathname.match(/^\/product\/([^/]+)/);
  if (p) return { productId: decodeURIComponent(p[1]) };
  const o = pathname.match(/^\/orders\/([^/]+)/);
  if (o) return { orderId: decodeURIComponent(o[1]) };
  return undefined;
}

const hhmm = (iso: string) => iso.slice(11, 16);

// ───────────────────────── 小部件 ─────────────────────────

function Avatar({ role }: { role: ChatMessage["role"] }) {
  if (role === "seller") {
    return (
      <span aria-hidden className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#c9a24a] text-xs font-semibold text-white">
        栖
      </span>
    );
  }
  return (
    <span aria-hidden className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-white">
      AI
    </span>
  );
}

function TypingBubble() {
  return (
    <div className="flex gap-2" data-testid="typing">
      <Avatar role="ai" />
      <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 text-sm text-warm shadow-card">
        <span>正在输入</span>
        <span className="flex gap-0.5" aria-hidden>
          <i className="typing-dot" />
          <i className="typing-dot" style={{ animationDelay: "0.15s" }} />
          <i className="typing-dot" style={{ animationDelay: "0.3s" }} />
        </span>
      </div>
    </div>
  );
}

function ProductContext({ productId }: { productId: string }) {
  const { data } = useAsync(() => getProduct(productId), [productId]);
  return (
    <>
      <div className="h-11 w-8 shrink-0 overflow-hidden rounded bg-[#ece7dc]">
        {data ? <ProductImage category={data.category} color={data.colors[0]} name={data.name} /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-warm">正在咨询商品</div>
        <div className="truncate text-sm font-medium text-foreground">{data?.name ?? productId}</div>
      </div>
      {data ? <span className="shrink-0 text-sm font-semibold text-brand">{money(data.price)}</span> : null}
    </>
  );
}

function OrderContext({ orderId, buyerId }: { orderId: string; buyerId: string }) {
  const { data, error } = useAsync(() => getOrder(orderId, buyerId), [orderId, buyerId]);
  const first = data?.items[0];
  return (
    <>
      <div className="h-11 w-8 shrink-0 overflow-hidden rounded bg-[#ece7dc]">
        {first ? <ProductImage color={first.color} name={first.productName} /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-warm">正在咨询：订单 {orderId}</div>
        <div className="truncate text-sm font-medium text-foreground">
          {first
            ? `${first.productName}${data && data.items.length > 1 ? ` 等 ${data.items.length} 件` : ""}`
            : error
              ? "暂时无法读取该订单信息"
              : "加载中…"}
        </div>
      </div>
      {data ? <OrderStatusBadge status={data.status} /> : null}
    </>
  );
}

function ContextBar({ target, buyerId, onClose }: { target: ChatTarget; buyerId: string; onClose: () => void }) {
  return (
    <div className="mx-3 mb-2 flex items-center gap-2.5 rounded-xl bg-white px-2.5 py-2 shadow-card ring-1 ring-line" data-testid="context-bar">
      {target.orderId ? <OrderContext orderId={target.orderId} buyerId={buyerId} /> : target.productId ? <ProductContext productId={target.productId} /> : null}
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭上下文"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-warm hover:bg-cream hover:text-foreground"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path d="m2.5 2.5 7 7m0-7-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

// ───────────────────────── 主体 ─────────────────────────

interface PanelProps {
  buyerId: string;
  nickname: string;
  open: boolean;
  target: ChatTarget | null;
  /** 演示指南每点一次「开始」就 +1，用来丢掉当前会话、让后端新建 */
  chatSession: number;
  page: Page;
  onFabClick: () => void;
  onClose: () => void;
}

function ChatPanel({ buyerId, nickname, open, target, chatSession, page, onFabClick, onClose }: PanelProps) {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [traces, setTraces] = useState<Record<string, RouteTrace>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<SendError | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [prefilled, setPrefilled] = useState(false);
  const [resolutions, setResolutions] = useState<Record<string, ConfirmResolution>>({});
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [unseen, setUnseen] = useState(0);
  const [dismissed, setDismissed] = useState<ChatTarget | null>(null);
  const [debug, setDebug] = useState(() => {
    try {
      return window.localStorage.getItem(DEBUG_KEY) === "1";
    } catch {
      return false;
    }
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sendingRef = useRef(false);
  const pollingRef = useRef(false);
  const loadedOnce = useRef(false);
  const appliedSession = useRef(0);
  const loadGen = useRef(0);
  const localSeq = useRef(0);
  // 轮询等异步回调里要读到最新值
  const convRef = useRef<Conversation | null>(null);
  const messagesRef = useRef<UiMessage[]>([]);
  const openRef = useRef(open);
  const debugRef = useRef(debug);
  const contextRef = useRef<NonNullable<ChatRequest["context"]>>({});

  const targetVisible = target !== null && dismissed !== target && (!!target.orderId || !!target.productId);
  const activeTarget = targetVisible ? target : null;

  useEffect(() => {
    convRef.current = conversation;
    messagesRef.current = messages;
    openRef.current = open;
    debugRef.current = debug;
    contextRef.current = {
      ...(activeTarget?.orderId ? { orderId: activeTarget.orderId } : {}),
      ...(activeTarget?.productId ? { productId: activeTarget.productId } : {}),
      ...(page ? { page } : {}),
    };
  });

  const dropConversation = useCallback(() => {
    convRef.current = null;
    messagesRef.current = [];
    setConversation(null);
    setMessages([]);
    setTraces({});
    setResolutions({});
    setChosen({});
    setError(null);
    setLoaded(true);
  }, []);

  // 首次打开：恢复最近一次未关闭的会话。
  // 演示指南的「开始」会递增 chatSession：丢掉本地会话，下一条消息不带 conversationId。
  useEffect(() => {
    if (!open) return;
    if (chatSession > 0 && appliedSession.current !== chatSession) {
      appliedSession.current = chatSession;
      loadGen.current += 1;
      loadedOnce.current = true;
      dropConversation();
      return;
    }
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    const gen = ++loadGen.current;
    getLatestConversation(buyerId)
      .then((res) => {
        if (gen !== loadGen.current) return;
        if (res.conversation) {
          setConversation(res.conversation);
          setMessages(res.messages);
        }
      })
      .catch(() => {
        /* 恢复失败不打扰买家：当作新会话 */
      })
      .finally(() => {
        if (gen === loadGen.current) setLoaded(true);
      });
    return () => {
      loadGen.current += 1;
    };
  }, [open, buyerId, chatSession, dropConversation]);

  // 点了「开始」但还没发出去就关掉：下次从悬浮按钮打开时，仍恢复最近会话
  useEffect(() => {
    if (open || convRef.current) return;
    loadedOnce.current = false;
  }, [open]);

  // 演示指南：带着示例话术打开聊天窗 → 填进输入框（不自动发送），并提示买家点「发送」
  useEffect(() => {
    const text = open ? target?.draft : undefined;
    if (!text) return;
    const t = setTimeout(() => {
      setDraft(text);
      setPrefilled(true);
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }, 60);
    return () => clearTimeout(t);
  }, [open, target]);

  // 打开时清零未读提示、聚焦输入框；Esc 关闭
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setUnseen(0);
      inputRef.current?.focus();
    }, 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // 新消息 → 滚到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, sending, error, open, loaded]);

  function mergeServerMessages(incoming: ChatMessage[]) {
    const known = new Set(messagesRef.current.map((m) => m.id));
    const fresh = incoming.filter((m) => !known.has(m.id));
    if (fresh.length === 0) return;
    setMessages((prev) => {
      const ids = new Set(prev.map((m) => m.id));
      return [...prev, ...fresh.filter((m) => !ids.has(m.id))];
    });
    if (!openRef.current) setUnseen((n) => n + fresh.filter((m) => m.role !== "buyer").length);
  }

  const humanMode = conversation?.mode === "human";
  const convId = conversation?.id;

  // 人工模式：每 2 秒轮询新消息（含卖家回复、系统消息；交还 AI 后 mode 变回 ai 自动停止）
  useEffect(() => {
    if (!humanMode || !convId) return;
    const timer = setInterval(async () => {
      if (pollingRef.current || sendingRef.current) return;
      pollingRef.current = true;
      try {
        const serverMsgs = messagesRef.current.filter((m) => !m.local);
        const after = serverMsgs[serverMsgs.length - 1]?.id;
        const res = await getConversationMessages(convId, after);
        if (sendingRef.current) return;
        mergeServerMessages(res.messages);
        setConversation(res.conversation);
      } catch {
        /* 轮询失败静默重试 */
      } finally {
        pollingRef.current = false;
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [humanMode, convId]);

  function applyResponse(res: ChatResponse, localId?: string) {
    setMessages((prev) => {
      const base = prev.filter((m) => m.id !== localId);
      const ids = new Set(base.map((m) => m.id));
      const incoming: UiMessage[] = res.messages.filter((m) => !ids.has(m.id));
      // 后端返回了 trace 但没在消息上写 traceId 时，挂到本次最后一条非买家消息上
      if (res.trace && !incoming.some((m) => m.traceId === res.trace!.id)) {
        for (let i = incoming.length - 1; i >= 0; i--) {
          if (incoming[i].role !== "buyer" && !incoming[i].traceId) {
            incoming[i] = { ...incoming[i], traceId: res.trace.id };
            break;
          }
        }
      }
      return [...base, ...incoming];
    });
    if (res.trace) {
      const t = res.trace;
      setTraces((p) => ({ ...p, [t.id]: t }));
    }
    setConversation(res.conversation);
    if (!openRef.current) setUnseen((n) => n + res.messages.filter((m) => m.role !== "buyer").length);
  }

  /** 发送一条消息 / 动作。成功返回响应，失败返回 null（并在对话里显示可重试的错误气泡）。 */
  async function send(input: SendInput, label?: string): Promise<ChatResponse | null> {
    if (sendingRef.current) return null;
    sendingRef.current = true;
    setSending(true);
    setError(null);

    let localId: string | undefined;
    const bubbleText = label ?? input.text;
    if (bubbleText) {
      localSeq.current += 1;
      localId = `local-${localSeq.current}`;
      const optimistic: UiMessage = {
        id: localId,
        conversationId: convRef.current?.id ?? "",
        role: "buyer",
        text: bubbleText,
        createdAt: nowIso(),
        local: "sending",
      };
      setMessages((prev) => [...prev, optimistic]);
    }
    const conv = convRef.current;
    const req: ChatRequest = {
      buyerId,
      conversationId: conv && conv.status !== "closed" ? conv.id : undefined,
      ...(input.text ? { text: input.text } : {}),
      ...(input.action ? { action: input.action } : {}),
      context: contextRef.current,
      debug: debugRef.current || undefined,
    };
    try {
      const res = await sendChat(req);
      applyResponse(res, localId);
      return res;
    } catch (e) {
      if (localId) setMessages((prev) => prev.map((m) => (m.id === localId ? { ...m, local: "failed" } : m)));
      setError({ input, label, message: e instanceof Error && e.message && !e.message.startsWith("not implemented") ? e.message : "客服暂时没有回应，请稍后重试" });
      return null;
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  function submitDraft() {
    const text = draft.trim();
    if (!text || sendingRef.current) return;
    setDraft("");
    setPrefilled(false);
    void send({ text });
  }

  function sendAction(action: ChatAction, label: string) {
    void send({ action }, label);
  }

  async function onConfirm(pendingActionId: string, confirm: boolean) {
    if (sendingRef.current) return;
    setResolutions((p) => ({ ...p, [pendingActionId]: { status: "busy" } }));
    const res = await send({ action: { type: "confirm", pendingActionId, confirm } });
    if (!res) {
      setResolutions((p) => {
        const next = { ...p };
        delete next[pendingActionId];
        return next;
      });
      return;
    }
    const ai = res.messages.filter((m) => m.role !== "buyer");
    if (!confirm) {
      setResolutions((p) => ({ ...p, [pendingActionId]: { status: "cancelled", result: "您取消了本次操作，没有任何改动" } }));
      return;
    }
    const ok = ai.some((m) => m.card?.kind === "aftersale" || m.card?.kind === "order");
    const af = ai.find((m) => m.card?.kind === "aftersale")?.card;
    setResolutions((p) => ({
      ...p,
      [pendingActionId]: {
        status: ok ? "confirmed" : "failed",
        result: af && af.kind === "aftersale" ? `已提交，售后单号 ${af.afterSale.id}` : (ai[0]?.text ?? undefined),
      },
    }));
  }

  function onSelectOption(messageId: string, value: string, label: string) {
    if (sendingRef.current) return;
    setChosen((p) => ({ ...p, [messageId]: value }));
    sendAction({ type: "select_option", value }, label);
  }

  function retry() {
    if (!error) return;
    const { input, label } = error;
    setMessages((prev) => prev.filter((m) => m.local !== "failed"));
    setError(null);
    if (input.action?.type === "confirm") {
      void onConfirm(input.action.pendingActionId, input.action.confirm);
    } else {
      void send(input, label);
    }
  }

  function toggleDebug() {
    const next = !debug;
    setDebug(next);
    try {
      window.localStorage.setItem(DEBUG_KEY, next ? "1" : "0");
    } catch {
      /* 忽略 */
    }
  }

  // ── 渲染 ──

  const status = conversation?.status;
  const closed = status === "closed";
  const lastId = messages[messages.length - 1]?.id;

  // 同一个 traceId 的多条消息，只在最后一条下面显示调试行
  const lastOfTrace = new Map<string, string>();
  for (const m of messages) if (m.traceId) lastOfTrace.set(m.traceId, m.id);

  function renderMessage(m: UiMessage, i: number) {
    const prev = messages[i - 1];
    const showTime = !prev || Date.parse(m.createdAt) - Date.parse(prev.createdAt) >= 3 * 60 * 1000;
    const timeEl = showTime ? <div className="py-1 text-center text-[11px] text-warm/80">{hhmm(m.createdAt)}</div> : null;

    const trace = debug && m.traceId && lastOfTrace.get(m.traceId) === m.id ? traces[m.traceId] : undefined;
    const ctx: CardContext = {
      message: m,
      isLast: m.id === lastId,
      sending,
      resolutionOf: (id) => resolutions[id],
      chosenOf: (id) => chosen[id],
      onSelectOption,
      onConfirm: (id, c) => void onConfirm(id, c),
    };

    if (m.role === "system") {
      return (
        <div key={m.id}>
          {timeEl}
          <div className="flex flex-col items-center py-0.5">
            <span className="rounded-full bg-[#e8e4da] px-3 py-1 text-xs text-[#6a655b]">{m.text}</span>
            {trace && (
              <div className="mt-1 max-w-[88%]">
                <DebugLine trace={trace} />
              </div>
            )}
          </div>
        </div>
      );
    }

    if (m.role === "buyer") {
      return (
        <div key={m.id}>
          {timeEl}
          <div className="flex justify-end">
            <div className="max-w-[80%]">
              <div
                className={`whitespace-pre-wrap break-words rounded-2xl rounded-tr-md px-3.5 py-2 text-[15px] leading-6 text-white ${
                  m.local === "failed" ? "bg-risk/80" : "bg-brand"
                } ${m.local === "sending" ? "opacity-70" : ""}`}
              >
                {m.text}
              </div>
              {m.local === "failed" && <div className="mt-0.5 text-right text-[11px] text-risk">未发送成功</div>}
            </div>
          </div>
        </div>
      );
    }

    const isSeller = m.role === "seller";
    return (
      <div key={m.id}>
        {timeEl}
        <div className="flex gap-2">
          <Avatar role={m.role} />
          <div className="min-w-0 max-w-[88%]">
            {isSeller && <div className="mb-0.5 text-[11px] text-warm">人工客服 阿栖</div>}
            {m.text && (
              <div
                className={`whitespace-pre-wrap break-words rounded-2xl rounded-tl-md px-3.5 py-2 text-[15px] leading-6 text-foreground shadow-card ${
                  isSeller ? "bg-[#fbf3e1] ring-1 ring-[#ecd9b8]" : "bg-white"
                }`}
              >
                {m.text}
              </div>
            )}
            {m.card && <CardView card={m.card} ctx={ctx} />}
            {m.quickReplies && m.quickReplies.length > 0 && m.id === lastId && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {m.quickReplies.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    disabled={sending}
                    onClick={() => sendAction(q.action, q.action.type === "text" ? q.action.text : q.label)}
                    className="rounded-full border border-brand/40 bg-white px-3 py-1 text-xs font-medium text-brand transition hover:bg-brand-soft disabled:opacity-50"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            )}
            {trace && <DebugLine trace={trace} />}
          </div>
        </div>
      </div>
    );
  }

  const placeholder = humanMode ? "给人工客服留言…" : closed ? "会话已结束，发送消息开始新的咨询" : "请输入您想咨询的问题…";

  return (
    <>
      {/* 悬浮按钮 */}
      {!open && (
        <button
          type="button"
          onClick={onFabClick}
          aria-label="联系客服"
          data-testid="chat-fab"
          className="fixed bottom-6 right-6 z-40 flex h-14 items-center gap-2 rounded-full bg-brand pl-4 pr-5 text-white shadow-lift transition hover:-translate-y-0.5 hover:bg-brand-dark"
        >
          <svg width="22" height="22" viewBox="0 0 20 20" aria-hidden>
            <path
              d="M4 4.5h12a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H9l-3.5 3v-3H4A1.5 1.5 0 0 1 2.5 12V6A1.5 1.5 0 0 1 4 4.5Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <circle cx="7.2" cy="9" r="0.9" fill="currentColor" />
            <circle cx="10" cy="9" r="0.9" fill="currentColor" />
            <circle cx="12.8" cy="9" r="0.9" fill="currentColor" />
          </svg>
          <span className="text-sm font-medium">联系客服</span>
          {unseen > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-risk px-1 text-[11px] font-semibold text-white ring-2 ring-background">
              {unseen}
            </span>
          )}
        </button>
      )}

      {/* 抽屉 */}
      <aside
        role="dialog"
        aria-label="客服聊天窗"
        aria-hidden={!open}
        inert={!open}
        data-testid="chat-drawer"
        data-conversation-id={conversation?.id}
        data-status={status}
        className={`fixed right-0 top-0 z-50 flex h-dvh w-[420px] max-w-full flex-col bg-cream shadow-lift transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* 顶栏 */}
        <header className="flex shrink-0 items-center gap-3 bg-brand px-4 py-3 text-white">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-base font-semibold">栖</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold leading-5">栖木客服</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-white/75">
              <span className={`h-1.5 w-1.5 rounded-full ${status === "human_active" ? "bg-[#f3c969]" : "bg-[#8fe0a8]"}`} />
              {status === "human_active" ? "人工客服 阿栖" : status === "waiting_human" ? "等待人工接入" : `AI 智能客服小栖 · ${nickname}`}
            </div>
          </div>
          <button
            type="button"
            onClick={toggleDebug}
            aria-pressed={debug}
            title="调试：显示每条回复由哪一层处理、耗时与成本"
            data-testid="debug-toggle"
            className={`flex h-8 items-center gap-1 rounded-full px-2.5 text-xs transition ${
              debug ? "bg-white text-brand" : "bg-white/10 text-white/85 hover:bg-white/20"
            }`}
          >
            <span aria-hidden>🔍</span>
            <span>调试</span>
            <span className={`ml-0.5 h-3.5 w-6 rounded-full p-0.5 transition ${debug ? "bg-brand" : "bg-white/30"}`}>
              <span className={`block h-2.5 w-2.5 rounded-full bg-white transition-transform ${debug ? "translate-x-2.5" : ""}`} />
            </span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭客服窗口"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/85 hover:bg-white/15"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <path d="m2.5 2.5 9 9m0-9-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        {/* 人工模式 / 结束 状态条 */}
        {status === "human_active" && (
          <div className="shrink-0 border-b border-[#ecd9b8] bg-[#fbf3e1] px-4 py-2 text-sm text-[#7a5410]" data-testid="human-banner">
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#c9a24a]" />
            人工客服 阿栖 为您服务
          </div>
        )}
        {status === "waiting_human" && (
          <div className="shrink-0 border-b border-[#ecd9b8] bg-[#fbf3e1] px-4 py-2 text-sm text-[#7a5410]" data-testid="human-banner">
            <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-[#c9a24a]" />
            已转接人工客服，阿栖正在赶来…
          </div>
        )}
        {closed && <div className="shrink-0 border-b border-line bg-[#efece5] px-4 py-2 text-sm text-warm">本次会话已结束</div>}

        {/* 消息区 */}
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-3.5 py-4" data-testid="chat-scroll">
          {messages.length === 0 && (
            <div className="flex gap-2">
              <Avatar role="ai" />
              <div className="max-w-[88%]">
                <div className="rounded-2xl rounded-tl-md bg-white px-3.5 py-2 text-[15px] leading-6 text-foreground shadow-card">
                  {loaded || !open ? (
                    <>
                      您好{nickname ? `，${nickname}` : ""}，我是栖木智能客服小栖～
                      <br />
                      订单、物流、售后、尺码，都可以直接问我。
                    </>
                  ) : (
                    "正在恢复上次的对话…"
                  )}
                </div>
              </div>
            </div>
          )}
          {messages.map(renderMessage)}
          {sending && !humanMode && <TypingBubble />}
          {error && (
            <div className="flex gap-2" data-testid="error-bubble">
              <span aria-hidden className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#fbeee6] text-sm text-risk">
                !
              </span>
              <div className="rounded-2xl rounded-tl-md bg-[#fbeee6] px-3.5 py-2 text-sm leading-6 text-risk ring-1 ring-risk/20">
                <div>{error.message}</div>
                <button type="button" onClick={retry} className="mt-1 rounded-full bg-risk px-3 py-0.5 text-xs font-medium text-white hover:opacity-90">
                  重试
                </button>
              </div>
            </div>
          )}
          {debug && messages.length > 0 && !Object.keys(traces).length && !sending && (
            <p className="text-center text-[11px] text-warm/80">调试已开启：之后的每条 AI 回复下方会显示处理层级、耗时与成本</p>
          )}
        </div>

        {/* 输入区 */}
        <div className="shrink-0 border-t border-line bg-cream pb-3 pt-2.5">
          {activeTarget && <ContextBar target={activeTarget} buyerId={buyerId} onClose={() => setDismissed(target)} />}
          {!humanMode && (
            <div className="flex gap-1.5 overflow-x-auto px-3 pb-2.5">
              {QUICK_BUTTONS.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  disabled={sending}
                  onClick={() => sendAction(q.action, q.label)}
                  className="shrink-0 rounded-full border border-line bg-white px-3.5 py-1.5 text-[13px] text-foreground transition hover:border-brand/50 hover:text-brand disabled:opacity-50"
                >
                  {q.label}
                </button>
              ))}
            </div>
          )}
          {prefilled && draft.trim() && !sending ? (
            <p data-testid="prefill-hint" className="fade-up mx-3 mb-2 flex items-center gap-1.5 rounded-lg bg-brand-soft px-3 py-1.5 text-xs text-brand">
              <span aria-hidden>✍️</span>
              示例话术已填好，点右边的「发送」就能继续演示
            </p>
          ) : null}
          <form
            className="flex items-center gap-2 px-3"
            onSubmit={(e) => {
              e.preventDefault();
              submitDraft();
            }}
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setPrefilled(false);
              }}
              onKeyDown={(e) => {
                // 中文输入法选词时的回车不算发送
                if (e.key === "Enter" && e.nativeEvent.isComposing) e.preventDefault();
              }}
              maxLength={500}
              placeholder={placeholder}
              aria-label="输入消息"
              data-testid="chat-input"
              className="h-11 min-w-0 flex-1 rounded-full border border-line bg-white px-4 text-[15px] text-foreground outline-none transition placeholder:text-warm/70 focus:border-brand"
            />
            <button
              type="submit"
              disabled={!draft.trim() || sending}
              data-testid="chat-send"
              className="h-11 shrink-0 rounded-full bg-brand px-5 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-warm/40"
            >
              发送
            </button>
          </form>
          <div className="mt-2 px-4 text-center text-[11px] text-warm/80">
            AI 客服可能出错，涉及退款等操作会先请您确认 ·{" "}
            <Link href="/orders" className="text-brand hover:underline">
              我的订单
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}

export function ChatWidget() {
  const { ready, buyerId, buyer, chatOpen, chatTarget, chatSession, openChat, closeChat } = useShop();
  const pathname = usePathname();
  // 客户端水合完成后才渲染：调试开关等从 localStorage 读取，避免水合不一致
  if (!ready) return null;
  return (
    <ChatPanel
      key={buyerId}
      buyerId={buyerId}
      nickname={buyer?.nickname ?? ""}
      open={chatOpen}
      target={chatTarget}
      chatSession={chatSession}
      page={pageOf(pathname)}
      onFabClick={() => openChat(targetFromPath(pathname))}
      onClose={closeChat}
    />
  );
}
