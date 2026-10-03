/**
 * T16 自测脚本：依次调用会话 / 规则 / 重置 API 并打印结果。
 *
 *   先在另一个终端运行 `npm run dev`，再运行：
 *   npx tsx scripts/try-conversation-api.ts [http://localhost:3000]
 *
 * 买家端聊天接口（/api/chat）要等 T04，所以「新建会话 + 追加买家消息」这一步直接调用数据层
 * （lib/store/conversations.ts）；数据层和服务器读写同一份 data/runtime/*.json。
 * 注意：脚本最后会调用 /api/admin/reset，演示数据会被重置。
 */
import { appendMessages, appendTrace, createConversation } from "../lib/store/conversations";
import type { ChatMessage, Conversation, PendingAction, RouteTrace, Rule } from "../lib/types";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
let failures = 0;

function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail !== undefined ? `  ← ${JSON.stringify(detail)}` : ""}`);
  if (!ok) failures++;
}

async function call<T = unknown>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(base + path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as T };
}

async function main() {
  console.log(`目标服务：${base}\n`);
  try {
    await fetch(base + "/api/buyers");
  } catch {
    console.error("连不上服务，请先在另一个终端运行 `npm run dev`。");
    process.exit(1);
  }

  // 0. 从干净的数据开始
  console.log("── 0. 重置到初始状态");
  check("POST /api/admin/reset → ok", (await call("POST", "/api/admin/reset")).data !== undefined);

  // 1. 新建会话 + 买家消息（数据层）
  console.log("\n── 1. 新建会话 → 追加买家消息（数据层）");
  const conv = createConversation("B001");
  const [buyerMsg] = appendMessages(conv.id, [{ role: "buyer", text: "到哪了" }]);
  const trace = appendTrace({
    conversationId: conv.id,
    messageId: buyerMsg.id,
    at: buyerMsg.createdAt,
    layer: "L1",
    intent: "logistics_track",
    ruleId: "R002",
    toolCalls: [],
    usedGeneration: false,
    latency: { totalMs: 5 },
    cost: { decideUsd: 0, generationUsd: 0, agentUsd: 0, totalUsd: 0 },
  });
  const [aiMsg] = appendMessages(conv.id, [{ role: "ai", text: "您的包裹正在运输中～", traceId: trace.id }]);
  console.log(`会话 ${conv.id}，消息 ${buyerMsg.id}、${aiMsg.id}，trace ${trace.id}`);

  const latest = await call<{ conversation: Conversation | null; messages: ChatMessage[] }>("GET", "/api/conversations/latest?buyerId=B001");
  check("GET /conversations/latest 取到刚建的会话和 2 条消息", latest.data.conversation?.id === conv.id && latest.data.messages.length === 2, latest.data);
  const none = await call<{ conversation: Conversation | null }>("GET", "/api/conversations/latest?buyerId=B002");
  check("没有会话的买家 latest → conversation=null", none.data.conversation === null, none.data);
  check("缺 buyerId → 400", (await call("GET", "/api/conversations/latest")).status === 400);

  // 2. 确认卡片回填
  console.log("\n── 2. 确认卡片状态回填");
  const pending: PendingAction = {
    id: "PA-T16",
    conversationId: conv.id,
    tool: "cancel_order",
    args: { orderId: "QM2026100401" },
    summary: "取消订单 QM2026100401",
    status: "pending",
    createdAt: buyerMsg.createdAt,
  };
  const { writeCollection } = await import("../lib/store");
  writeCollection("pending_actions", [pending]);
  const [cardMsg] = appendMessages(conv.id, [{ role: "ai", text: "请确认", card: { kind: "confirm", pendingAction: pending } }]);
  writeCollection("pending_actions", [{ ...pending, status: "confirmed", resolvedAt: buyerMsg.createdAt, result: "已取消" }]);
  const afterCard = await call<{ messages: ChatMessage[] }>("GET", `/api/conversations/${conv.id}/messages?after=${aiMsg.id}`);
  const card = afterCard.data.messages[0]?.card;
  check("确认卡片回填成最新状态 confirmed", afterCard.data.messages[0]?.id === cardMsg.id && card?.kind === "confirm" && card.pendingAction.status === "confirmed", card);

  // 3. 卖家接管 → 回复 → 买家轮询 → 交还 → 结束
  console.log("\n── 3. takeover → reply → /messages?after= → release → close");
  const list1 = await call<Conversation[]>("GET", "/api/conversations");
  check("GET /conversations 默认列表里有这个会话", list1.data.some((c) => c.id === conv.id), list1.data.map((c) => c.id));

  const took = await call<Conversation>("POST", `/api/conversations/${conv.id}/takeover`);
  check("takeover → mode=human, status=human_active, assignee=阿栖", took.data.mode === "human" && took.data.status === "human_active" && took.data.assignee === "阿栖", took.data);

  const [buyerMsg2] = appendMessages(conv.id, [{ role: "buyer", text: "怎么还没到" }]);
  const detail1 = await call<{ conversation: Conversation; messages: ChatMessage[]; traces: RouteTrace[]; pendingActions: PendingAction[] }>("GET", `/api/conversations/${conv.id}`);
  check("人工模式下买家消息让未读 +1，打开详情后归零", detail1.data.conversation.unreadForSeller === 0 && detail1.data.messages.some((m) => m.id === buyerMsg2.id), detail1.data.conversation);
  check("详情含 messages / traces / pendingActions", detail1.data.traces.length === 1 && detail1.data.pendingActions.length === 1, { t: detail1.data.traces.length, p: detail1.data.pendingActions.length });

  const reply = await call<ChatMessage>("POST", `/api/conversations/${conv.id}/reply`, { text: "您好，我是阿栖，帮您查一下" });
  check("reply → role=seller", reply.data.role === "seller", reply.data);
  check("reply 空内容 → 400", (await call("POST", `/api/conversations/${conv.id}/reply`, { text: "  " })).status === 400);

  const poll = await call<{ messages: ChatMessage[] }>("GET", `/api/conversations/${conv.id}/messages?after=${buyerMsg2.id}`);
  check("/messages?after= 取到卖家消息", poll.data.messages.length === 1 && poll.data.messages[0].role === "seller", poll.data.messages);

  const released = await call<Conversation>("POST", `/api/conversations/${conv.id}/release`);
  check("release → mode=ai, status=ai_active, handoffAt 清空, unresolvedTurns=0", released.data.mode === "ai" && released.data.status === "ai_active" && !released.data.handoffAt && released.data.state.unresolvedTurns === 0, released.data);
  const afterRelease = await call<{ messages: ChatMessage[] }>("GET", `/api/conversations/${conv.id}/messages`);
  check("release 插入系统消息「已切换回智能客服」", afterRelease.data.messages.some((m) => m.role === "system" && m.text === "已切换回智能客服"));

  // 未接管直接回复 → 自动接管
  const auto = await call<ChatMessage>("POST", `/api/conversations/${conv.id}/reply`, { text: "再补充一句" });
  const autoConv = await call<{ conversation: Conversation }>("GET", `/api/conversations/${conv.id}`);
  check("未接管时 reply 自动接管", auto.status === 200 && autoConv.data.conversation.status === "human_active", autoConv.data.conversation);

  const closed = await call<Conversation>("POST", `/api/conversations/${conv.id}/close`);
  check("close → status=closed", closed.data.status === "closed", closed.data);
  check("已结束的会话 takeover → 409", (await call("POST", `/api/conversations/${conv.id}/takeover`)).status === 409);
  check("不存在的会话 → 404", (await call("GET", "/api/conversations/C9999")).status === 404);
  const byStatus = await call<Conversation[]>("GET", "/api/conversations?status=closed");
  check("?status=closed 过滤", byStatus.data.length === 1 && byStatus.data[0].id === conv.id, byStatus.data);
  check("?status=乱写 → 400", (await call("GET", "/api/conversations?status=xxx")).status === 400);

  // 4. 转人工排序
  console.log("\n── 4. 列表排序：waiting_human 最前，等得最久的在最上");
  const a = createConversation("B002", { mode: "human", status: "waiting_human", handoffAt: "2026-10-05T09:50:00+08:00" });
  const b = createConversation("B003", { mode: "human", status: "waiting_human", handoffAt: "2026-10-05T09:40:00+08:00" });
  const c = createConversation("B004");
  const sorted = await call<Conversation[]>("GET", "/api/conversations");
  const ids = sorted.data.map((x) => x.id);
  check(`排序 ${b.id}(09:40) → ${a.id}(09:50) → 其余`, ids[0] === b.id && ids[1] === a.id && ids.includes(c.id), ids);

  // 5. 误判标记
  console.log("\n── 5. traces misfire");
  const rulesBefore = await call<Rule[]>("GET", "/api/rules");
  const r002 = rulesBefore.data.find((r) => r.id === "R002")!;
  const mis1 = await call<RouteTrace>("POST", `/api/traces/${trace.id}/misfire`);
  await call("POST", `/api/traces/${trace.id}/misfire`);
  const rulesAfter = await call<Rule[]>("GET", "/api/rules");
  check("misfire 返回 trace", mis1.data.id === trace.id, mis1.data);
  check(`R002 misfireCount ${r002.misfireCount} → ${r002.misfireCount + 1}（重复点击只算一次）`, rulesAfter.data.find((r) => r.id === "R002")!.misfireCount === r002.misfireCount + 1);
  check("不存在的 trace → 404", (await call("POST", "/api/traces/nope/misfire")).status === 404);

  // 6. 规则
  console.log("\n── 6. 规则增删改查");
  const sug = (id: string) => rulesBefore.data.find((r) => r.id === id)?.suggestion;
  check(`GET /rules 共 ${rulesBefore.data.length} 条`, rulesBefore.data.length === 8);
  check("R007 suggestion=delete（误判率 39%）", sug("R007") === "delete", sug("R007"));
  check("R008 suggestion=delete（满 7 天从未命中）", sug("R008") === "delete", sug("R008"));
  check("R001 / R002 suggestion=keep", sug("R001") === "keep" && sug("R002") === "keep", [sug("R001"), sug("R002")]);

  const created = await call<Rule>("POST", "/api/rules", { name: "测试规则", pattern: "^测试$", intent: "greeting", maxLen: 6, enabled: true });
  check("POST /rules → R009，计数 0，suggestion=keep", created.data.id === "R009" && created.data.hitCount === 0 && created.data.suggestion === "keep", created.data);
  const bad = await call<{ error: { code: string; message: string } }>("POST", "/api/rules", { name: "坏规则", pattern: "(未闭合", intent: "greeting", maxLen: 6, enabled: true });
  check("非法正则 → 400 且有中文提示", bad.status === 400 && /正则/.test(bad.data.error.message), bad);
  check("意图不存在 → 400", (await call("POST", "/api/rules", { name: "x", pattern: "x", intent: "nope", maxLen: 6, enabled: true })).status === 400);
  const patched = await call<Rule>("PATCH", `/api/rules/${created.data.id}`, { enabled: false, maxLen: 8 });
  check("PATCH → enabled=false, maxLen=8", patched.data.enabled === false && patched.data.maxLen === 8, patched.data);
  check("PATCH 非法正则 → 400", (await call("PATCH", `/api/rules/${created.data.id}`, { pattern: "[" })).status === 400);
  check("PATCH 不存在的规则 → 404", (await call("PATCH", "/api/rules/R999", { enabled: true })).status === 404);
  const del = await call<{ ok: boolean }>("DELETE", `/api/rules/${created.data.id}`);
  check("DELETE → { ok: true }", del.data.ok === true);
  check("再删一次 → 404", (await call("DELETE", `/api/rules/${created.data.id}`)).status === 404);

  // 7. 重置
  console.log("\n── 7. 重置后数据恢复");
  check("POST /admin/reset → { ok: true }", ((await call<{ ok: boolean }>("POST", "/api/admin/reset")).data).ok === true);
  const afterReset = await call<Conversation[]>("GET", "/api/conversations?includeSimulated=1");
  check("演示中产生的真实会话全部清空，只剩 T17 的模拟历史会话", afterReset.data.every((c) => c.isSimulated), afterReset.data.filter((c) => !c.isSimulated).length);
  const realAfterReset = await call<Conversation[]>("GET", "/api/conversations");
  check("卖家会话列表默认不含模拟会话（重置后为空）", realAfterReset.data.length === 0, realAfterReset.data.length);
  const rulesReset = await call<Rule[]>("GET", "/api/rules");
  check("规则恢复为 8 条、R002 误判数回到初始值", rulesReset.data.length === 8 && rulesReset.data.find((r) => r.id === "R002")!.misfireCount === r002.misfireCount, rulesReset.data.length);

  console.log(failures === 0 ? "\n全部通过 ✅" : `\n${failures} 项失败 ❌`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
