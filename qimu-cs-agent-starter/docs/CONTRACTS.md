# CONTRACTS — 类型与 API 契约

> 维护者：Claude（总指挥）。Agent 不得修改。变更请求写到 `docs/questions/`。
> 类型定义的唯一来源是 **`lib/types.ts`**，本文只说明接口。

## 通用约定

- 所有接口前缀 `/api`，JSON 收发（知识库上传除外，用 multipart）。
- 成功：HTTP 200，直接返回数据对象（不包 `{data: ...}`）。
- 失败：HTTP 4xx/5xx，返回 `{ "error": { "code": string, "message": string } }`，`message` 用中文，可直接展示。
- 演示没有登录。买家身份通过 `buyerId` 传递（前端顶栏的买家切换器决定）；卖家端不需要身份，客服名固定为「阿栖」。
- 时间一律 ISO 8601 带 `+08:00`；业务"当前时间"取 `lib/demo-clock.ts` 的 `DEMO_NOW`。
- 前端调用统一走 `lib/api-client.ts`。`NEXT_PUBLIC_USE_MOCK=1` 时 api-client 返回本地 mock（形状必须与本契约一致）。

---

## 1. 商城（买家端）

### `GET /api/buyers` → `Buyer[]`
买家切换器用。

### `GET /api/products?category=&q=` → `Product[]`
`category` 可选（`ProductCategory`）；`q` 可选，按名称/标签模糊匹配。按 `sales` 倒序。

### `GET /api/products/:id` → `Product`
404：`{error:{code:"NOT_FOUND"}}`

### `GET /api/orders?buyerId=B001&status=` → `Order[]`
`status` 可选（`OrderStatus`）。按 `createdAt` 倒序。

### `GET /api/orders/:id?buyerId=B001` → `Order`
订单不属于该买家 → 403。

### `GET /api/coupons?buyerId=B001` → `Coupon[]`

---

## 2. 客服聊天（买家端）

### `POST /api/chat`

请求：
```ts
{
  buyerId: string;
  conversationId?: string;          // 首次不传，后端新建
  text?: string;                    // 买家输入的文字
  action?: ChatAction;              // 快捷按钮 / 确认卡片 / 选项卡片 / 快捷回复
  context?: { orderId?: string; productId?: string; page?: "home" | "product" | "orders" | "order_detail" };
  debug?: boolean;                  // true 时返回 trace
}
```
`text` 与 `action` 至少一个。

响应：
```ts
{
  conversation: Conversation;       // 最新会话（含 state）
  messages: ChatMessage[];          // 本次新增的消息（含刚发的买家消息 + AI 回复 / 系统消息），按时间正序
  trace?: RouteTrace;               // debug=true 时返回
}
```
人工模式下：`messages` 只含买家消息本身（AI 不回复），卖家回复通过轮询获取。

### `GET /api/conversations/:id/messages?after=<messageId>` → `{ messages: ChatMessage[]; conversation: Conversation }`
买家端人工模式时每 2 秒轮询；卖家端会话详情也用它轮询。`after` 不传则返回全部。

### `GET /api/conversations/latest?buyerId=B001` → `{ conversation: Conversation | null; messages: ChatMessage[] }`
买家打开聊天窗时恢复最近一次未关闭的会话。

---

## 3. 卖家端

### `GET /api/conversations?status=` → `Conversation[]`
`status` 可选（`ConversationStatus`）。排序：`waiting_human` 在最前（按等待时长倒序），其余按 `updatedAt` 倒序。默认**不含** `isSimulated` 会话，`?includeSimulated=1` 时包含。

### `GET /api/conversations/:id` → `{ conversation: Conversation; messages: ChatMessage[]; traces: RouteTrace[]; pendingActions: PendingAction[] }`
会话详情 / 人工接管台。读取后 `unreadForSeller` 归零。

### `POST /api/conversations/:id/takeover` → `Conversation`
`mode="human"`, `status="human_active"`, `assignee="阿栖"`；向买家插入系统消息「人工客服 阿栖 已接入」。

### `POST /api/conversations/:id/reply` 请求 `{ text: string }` → `ChatMessage`
`role="seller"`。若会话尚未接管则自动接管。

### `POST /api/conversations/:id/release` → `Conversation`
交还 AI：`mode="ai"`, `status="ai_active"`；插入系统消息「已切换回智能客服」；`unresolvedTurns` 归零。

### `POST /api/conversations/:id/close` → `Conversation`

### `POST /api/traces/:id/misfire` → `RouteTrace`（P1）
卖家标记该条路由为误判；若是 L1 规则命中则对应规则 `misfireCount++`。

---

## 4. 知识库

### `GET /api/kb` → `KbDoc[]`

### `POST /api/kb/import`
两种方式：
- `multipart/form-data`：字段 `file`（.md / .txt，≤ 1MB），可选 `title`
- JSON：`{ title: string; content: string }`

→ `KbDoc`（导入并完成索引后返回；有 key 用 embedding，否则 bigram）

### `DELETE /api/kb/:id` → `{ ok: true }`

### `GET /api/kb/:id/chunks` → `KbChunk[]`

### `POST /api/kb/search` 请求 `{ query: string; topK?: number }` → `KbSearchHit[]`
卖家端「试搜一下」。

---

## 5. 规则

### `GET /api/rules` → `Rule[]`（含后端计算的 `suggestion`）
### `POST /api/rules` 请求 `Omit<Rule, "id"|"hitCount"|"misfireCount"|"lastHitAt"|"createdAt"|"suggestion">` → `Rule`
后端校验 `pattern` 是合法正则，否则 400。
### `PATCH /api/rules/:id` 请求 `Partial<Pick<Rule, "name"|"pattern"|"intent"|"maxLen"|"enabled">>` → `Rule`
### `DELETE /api/rules/:id` → `{ ok: true }`

---

## 6. 看板 / 评测

### `GET /api/analytics/routing?range=today|7d&includeSimulated=1` → `RoutingAnalytics`
`includeSimulated` 默认 1。

### `GET /api/eval/latest` → `EvalReport | null`

---

## 7. 演示管理

### `POST /api/admin/reset` → `{ ok: true }`
重置演示数据（等同 `npm run seed` 的复制 + 索引 + 种子流量步骤）。卖家端设置页调用。由 Codex 在 T05 实现。

## 8. 店铺 AI 助手（P1）

### `POST /api/seller/assistant` 请求 `{ message: string }` → `{ text: string; steps: { tool: string; summary: string }[]; csv?: { filename: string; content: string } }`

---

## 9. 工具清单（L2 handler 和 L3 agent 共用，`lib/tools`）

| 工具 | 类型 | 参数 | 说明 |
|---|---|---|---|
| `list_orders` | 读 | `{ status?, sinceDays? }` | 当前买家的订单 |
| `get_order` | 读 | `{ orderId }` | 校验归属 |
| `track_logistics` | 读 | `{ orderId }` | |
| `get_aftersale` | 读 | `{ orderId }` | 订单的售后单 |
| `search_products` | 读 | `{ query, category? }` | |
| `get_product` | 读 | `{ productId }` | |
| `check_stock` | 读 | `{ productId, size?, color? }` | |
| `recommend_size` | 读 | `{ heightCm, weightKg, productId? }` | 确定性计算 |
| `list_coupons` | 读 | `{ }` | 当前买家未使用且未过期 |
| `search_kb` | 读 | `{ query }` | RAG |
| `apply_refund` | **写** | `{ orderId, itemId, type: "refund_only"\|"return_refund", reason }` | 只生成 PendingAction |
| `request_exchange` | **写** | `{ orderId, itemId, newSize?, newColor? }` | 只生成 PendingAction；校验库存 |
| `modify_address` | **写** | `{ orderId, address }` | 仅 `paid` 状态可改 |
| `cancel_order` | **写** | `{ orderId }` | 仅 `pending_payment`/`paid` |
| `create_handoff` | 动作 | `{ reason }` | 转人工 |

工具执行时从上下文注入 `buyerId`，**模型无法查询其他买家的数据**（越权访问防护）。
写工具被确认（`POST /api/chat` 带 `action:{type:"confirm", confirm:true}`）后，真正修改订单/售后数据，并在聊天中返回 `aftersale` 或 `order` 卡片。
