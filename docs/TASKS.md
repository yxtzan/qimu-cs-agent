# TASKS — 任务看板

> 维护者：Claude（总指挥）。**Agent 不得修改本文件**（包括状态列）。任务有疑问写到 `docs/questions/`。
> 状态：`todo` → `doing` → `review`（已开 PR）→ `done`（Claude 审查通过）。状态由 Claude 根据交接文件更新。
> 编号：Codex = T0x，Cursor = T1x，Claude = T2x。

## 总览

| 编号 | 任务 | 负责 | 依赖 | 波次 | 预估 | 状态 |
|---|---|---|---|---|---|---|
| T00 | 项目脚手架 | Codex | — | 0 | 1h | done |
| T01 | decide() 三实现（Jev 为主） | Codex | T00 | 1 | 1.5h | done |
| T01b | Jev 延迟排查 + 兜底提速 | Codex | T01 | 1 | 45m | doing |
| T02 | 虚构数据 + seed + 商城只读 API | Codex | T01b | 1 | 3h | todo |
| T10 | 买家商城界面 | Cursor | T00 | 1 | 3h | done |
| T11 | 卖家端骨架 + PWA | Cursor | T00 | 1 | 2h | done |
| T03 | 工具层 + RAG + 知识库 API | Codex | T02 | 2 | 3h | todo |
| T04 | 大脑流水线核心（状态/风险/L1/L2/handler/聊天 API） | Codex | T01b T03 | 2 | 5h | todo |
| T12 | 买家客服聊天窗 | Cursor | T10 | 2 | 4h | done |
| T05 | L3 Agent + 转人工 + 卖家会话 API + 规则 API | Codex | T04 | 3 | 4h | todo |
| T13 | 人工接管台 + 知识库页 + 规则页 | Cursor | T11 | 3 | 3h | done |
| T06 | 种子流量 + 看板 API + 评测脚本 | Codex | T05 | 4 | 3h | todo |
| T14 | 路由看板页 | Cursor | T13 | 4 | 2.5h | done |
| T15a | 不依赖后端的打磨 | Cursor | T14 | 4 | 2h | doing |
| T15 | 前后端联调 | Cursor | T05 T15a | 5 | 2h | todo |
| T07 | (P1) 店铺 AI 助手 + Jev 批量打标 | Codex | T06 | 5 | 2.5h | todo |
| T20 | 演示剧本 + 最终审查 | Claude | 全部 | 5 | — | todo |

**并行规则**：同一波次里 Codex 和 Cursor 的任务可以同时进行（目录不重叠）。**两个 Agent 各用一份独立的本地克隆**（见 AGENTS.md §2），同一份克隆里同一时间只跑一个 Agent，所以 Codex 的 T01、T02 依次做。前端在后端接口完成前一律用 `NEXT_PUBLIC_USE_MOCK=1` 开发。

---

## T00 项目脚手架 — Codex

- 分支：`t00-scaffold`
- 必读：`AGENTS.md`、`docs/ARCHITECTURE.md` §2 §8、`docs/CONTRACTS.md` 通用约定

**要做**

1. 在仓库根目录初始化 Next.js（App Router、TypeScript strict、Tailwind、ESLint、`src/` 目录**不要**用）。保留仓库里已有的 `docs/`、`lib/types.ts`、`data/eval/`、`AGENTS.md`、`.cursor/`、`README.md`，不得覆盖。
2. `package.json` scripts：`dev` `build` `start` `lint` `typecheck`(`tsc --noEmit`) `seed` `eval`（后两个用 `tsx` 运行 `scripts/*.ts`，脚本先放占位，打印 "TODO: Txx"）。
3. `.gitignore` 加入 `data/runtime/`、`.env.local`。
4. `.env.example`：ARCHITECTURE §8 所有变量。到 openrouter.ai/models 查**当前可用**的模型，填入 `CLASSIFIER_LLM_MODEL` `GENERATION_MODEL` `AGENT_MODEL`（便宜、中文强、支持 tool calling，优先 DeepSeek / Qwen 系列）和 `EMBEDDING_MODEL`（多语言），在交接文件里说明选择理由和单价。
5. `lib/demo-clock.ts`：导出 `DEMO_NOW`（`2026-10-05T10:00:00+08:00`）和 `now()`（返回 DEMO_NOW 加上服务启动以来流逝的真实时间，这样演示中新消息的时间会往前走）。
6. `lib/llm/openrouter.ts`：三个函数 `chatCompletion()`（支持 tools、`response_format`）、`embed()`、`decisions()`，统一：从 env 读 key、8s 默认超时（可传参）、返回 `{ data, latencyMs, costUsd, estimated }`；无 key 时抛出可识别的 `NoApiKeyError`。请求带 `usage: { include: true }` 以拿到成本。
7. `lib/llm/cost.ts`：`usdToCny()`、`formatCny()`。
8. `lib/store/index.ts`：通用 JSON 仓库骨架——`readCollection<T>(name)`、`writeCollection<T>(name, data)`，读 `data/runtime/<name>.json`，不存在时从 `data/seed/<name>.json` 复制；进程内缓存 + 写入时落盘。（具体集合在 T02 填充。）
9. 占位页面：`app/(shop)/page.tsx`（显示"栖木 QIMU — 商城建设中"）、`app/seller/page.tsx`（"栖木商家 — 建设中"），以便 Cursor 接手。
10. `app/layout.tsx` 设置 `lang="zh-CN"`、标题「栖木 QIMU」。

**验收标准**

- [ ] `npm install && npm run dev` 后 `/` 和 `/seller` 都能打开
- [ ] `npm run typecheck` 和 `npm run lint` 通过
- [ ] 写一个临时脚本或测试证明 `chatCompletion()` 在有 key 时能返回一句中文回复，无 key 时抛 `NoApiKeyError`（交接文件里贴输出，**不要贴 key**）
- [ ] `lib/types.ts` 与仓库初始版本逐字一致

---

## T01 decide() 三实现（Jev 为主） — Codex

- 分支：`t01-decide`
- 依赖：T00
- 必读：`docs/ARCHITECTURE.md` §4.1–4.3、`docs/DECISIONS.md` D001 D004
- 需要 `OPENROUTER_API_KEY`（人类会在本地 `.env.local` 配好）
- 说明：团队决定**不做前置的 Jev 中文测试**，直接以 Jev 为 L2 和风险闸门的主力（见 D004）。中文效果改由 T06 的端到端评测来衡量。

**要做**

1. `lib/brain/decide/questions.ts`：意图表（20 项，id + 中文 criteria，与 ARCHITECTURE §4.1 一致）、风险问题（§4.2）、每个意图对应的 `Stage`。
2. `lib/brain/decide/jev.ts`：一次 `decisions()` 调用问 7 个问题（intent / multi_step / 4 个风险 / emotion），解析为 `DecideResult`。**先用 curl 或小脚本打一次真实请求，以实际返回格式为准**，把一次真实请求和响应（去掉 key）存到 `docs/reports/jev-sample.json`。
3. `lib/brain/decide/llm.ts`：用 `CLASSIFIER_LLM_MODEL` 做 JSON 结构化输出，提示词里给出同样的意图表和风险问题，返回同样结构（probabilities 只需要 top-3）。作为 Jev 的**运行时兜底**。
4. `lib/brain/decide/mock.ts`：关键词打分实现，无网络。
5. `lib/brain/decide/index.ts`：`decide(stateForModel, message, opts?)` 按 `CLASSIFIER_PROVIDER`（默认 `jev`）分发，**自动降级链**：jev 超时/报错 → llm → mock；没有 key 时直接用 mock。`DecideResult.provider` 填实际生效的那一个，降级原因写入 `error`。**绝不抛异常打断流水线**。
6. 并发控制：最多 4 个请求并发；遇到 429 退避重试 2 次（重试仍失败再降级）。
7. `scripts/try-decide.ts`：命令行输入一句话（可选附带 state JSON），打印 `DecideResult`、耗时和成本，方便人类亲眼看 Jev 的判断。

**验收标准**

- [ ] `docs/reports/jev-sample.json` 存有一次真实的 Jev 请求和响应
- [ ] `npx tsx scripts/try-decide.ts "我的快递到哪了"` 返回 `logistics_track`；`"衣服穿了全身起红疹，不处理就去12315"` 的 `health_safety` 和 `legal_threat` 都 ≥ 0.7（若达不到，如实记录分数，不要改题目描述去"凑"）
- [ ] 人为把 `JEV_MODEL` 改成不存在的模型 ID，`decide()` 自动降级到 llm 并在 `error` 中说明
- [ ] `CLASSIFIER_PROVIDER=mock` 或无 key 时 `decide()` 无网络可用
- [ ] 交接文件里记录：Jev 实测单次延迟、单次成本（T06 生成种子流量要用）

---

## T01b Jev 延迟排查 + 兜底提速 — Codex

- 分支：`t01b-latency`
- 依赖：T01
- 必读：`docs/handoff/T01.md`、`docs/DECISIONS.md` D001 D010、`docs/ARCHITECTURE.md` §1 §4.3
- 背景：T01 实测 Jev 单次调用约 **6.4 秒**（官方宣传 70–500ms），LLM 兜底 `qwen/qwen3.7-flash` 超过 8 秒超时（很可能开着"思考"模式）。按现在的数字，L2 不比 L3 快，"省钱又快"的故事只剩"省钱"。这个任务先查清楚慢在哪，再由 Claude 定 L2 方案。**只做测量和小修，不改架构。**

**要做**

1. `scripts/bench-decide.ts`：用下面 6 句话（不要用 `data/eval/cases.json` 里的句子），每种配置**各跑 5 轮**，记录每次的耗时、成本、结果，输出 p50 / p95：
   - 句子：「我的快递到哪了」「这件大衣能机洗吗」「衣服穿了全身起红疹，不处理就去12315」「M码有点紧能换L吗」「在吗」「上周买的外套换成L，顺便看看有没有券」
   - 配置：
     - A. Jev，7 题一次请求（现状）
     - B. Jev，只问 intent 1 题
     - C. Jev，只问 4 个风险 noul + emotion
     - D. Jev，7 题拆成 7 个请求**并行**发出（看延迟是否随题目数增长）
     - E. `CLASSIFIER_LLM_MODEL` 关闭思考模式（OpenRouter `reasoning` 参数，先查文档确认这个模型的正确写法，并验证真的关掉了：返回里没有 reasoning 内容、耗时明显下降）
     - F. `GENERATION_MODEL` 关闭思考模式，当分类器用（同样的 JSON schema）
     - G. 对照组：`GENERATION_MODEL` 发一句"你好"，`max_tokens: 5`，测纯网络 + 排队开销
   - 每种配置还要记下 6 句话的意图是否判对（人工给出期望值写在脚本里），给个粗略准确率。
2. 修复：`lib/brain/decide/llm.ts` 默认关闭思考模式；`lib/llm/openrouter.ts` 的 `chatCompletion` 增加一个可选的 `reasoning` 默认值读取（环境变量 `LLM_REASONING=off|on`，默认 `off`），让后续 handler 和 agent 默认也不思考。L3 agent 以后可以单独打开。
3. 降级链总时限：`decide()` 增加总预算（环境变量 `DECIDE_BUDGET_MS`，默认 9000），Jev 和 LLM 共享这个预算，超出直接降到 mock，保证 `decide()` 最坏情况不超过预算 + 50ms。
4. 报告 `docs/reports/T01b-latency.md`：一张表列出 A–G 的 p50 / p95 / 单次成本 / 粗略准确率，加上你的分析：Jev 慢在哪（网络？题目数？供应商排队？），以及 Jev 是否有更快的调用方式（如 OpenRouter 的 provider 路由参数、TypeSafe 文档里的 `System One API` 路径 `POST /api/v1/systemone`，**两条路径都实测一次**）。

**验收标准**

- [ ] 报告里 A–G 七种配置都有 5 轮实测数据（某个配置调用失败就如实记录错误）
- [ ] E、F 关闭思考后有实测耗时，并证明确实关掉了
- [ ] `JEV_MODEL=does-not-exist npx tsx scripts/try-decide.ts "我的快递到哪了"` 降级到 llm（不再是 mock），总耗时在预算内
- [ ] 报告最后给出你的推荐：L2 意图用哪个配置、风险检测用哪个配置；**最终由 Claude 决定**

---

## T02 虚构数据 + seed + 商城只读 API — Codex

- 分支：`t02-seed-data`
- 依赖：T00
- 必读：`docs/DATA_SPEC.md`（全部）、`docs/CONTRACTS.md` §1、`lib/types.ts`

**要做**

1. `scripts/seed.ts`：按 DATA_SPEC 生成 `data/seed/*.json`（固定随机种子，可复现）。商品 `images` 字段填空数组 `[]`（前端按类别和颜色自己画图，见 PRD §4.1）。英雄数据（§3）以常量手写，必须与表格**逐项一致**。
2. 写 10 篇知识库 `data/seed/kb/*.md`（§7），内容与业务规则（§6）、尺码表（§4）一致。
3. `npm run seed`：生成 seed（如不存在）→ 复制到 `data/runtime/`（覆盖，即"重置演示数据"）。知识库索引和种子流量留给 T03 / T06，这里先留钩子函数。
4. `lib/store/`：为 products / buyers / orders / coupons / rules 提供类型化的读写函数（如 `getOrder(id)`、`listOrders(buyerId, status?)`、`updateOrder()`）。
5. API：CONTRACTS §1 的全部 6 个接口。
6. `scripts/check-seed.ts`：校验数据自洽性——订单金额 = 单价 × 数量之和 − 优惠；状态和时间字段匹配（shipped 必须有 shippedAt 和 logistics）；物流事件时间递增；所有 productId / skuId 存在；英雄数据与 DATA_SPEC 一致。`npm run seed` 末尾自动运行。

**验收标准**

- [ ] `npm run seed` 成功，`check-seed` 全部通过
- [ ] `curl localhost:3000/api/orders?buyerId=B001` 返回包含 QM2026092801 / QM2026100201 / QM2026091501 的订单
- [ ] `curl localhost:3000/api/orders/QM2026092801?buyerId=B002` 返回 403
- [ ] 知识库 10 篇齐全，「7 天」「15 天」「金卡免退货运费」「满 99 包邮」等关键事实在所有文档中一致
- [ ] 交接文件里列出数据规模（商品 / 订单 / 售后 / 优惠券数量）

---

## T10 买家商城界面 — Cursor

- 分支：`t10-shop-ui`
- 依赖：T00
- 必读：`docs/PRD.md` §4.1 §7、`docs/CONTRACTS.md` §1、`lib/types.ts`

**要做**

1. `lib/api-client.ts`：封装 CONTRACTS 里**所有**接口的调用函数（这次只需实现商城部分，其余先写好函数签名），`NEXT_PUBLIC_USE_MOCK=1` 时返回 `lib/mock/` 下的 mock 数据（mock 数据至少包含 DATA_SPEC §3 的英雄买家、英雄订单和 8 个商品，形状严格符合类型）。
   > 注：`lib/mock/` 归 Cursor 所有。
2. 全局布局：顶栏（店铺 logo 文字「栖木 QIMU」、分类导航、「我的订单」、**买家切换器**下拉）。当前买家存在 React Context + localStorage（try/catch 包裹）。
3. 页面：`/` 首页、`/product/[id]` 详情、`/orders` 订单列表（状态 Tab）、`/orders/[id]` 订单详情（物流时间线、售后状态）。
4. 「问客服」「联系客服」按钮：先调用一个全局 `openChat({ productId?, orderId? })`（放在 Context 里，T12 实现聊天窗，这里先 `console.log`）。
5. 视觉遵守 PRD §7；商品图见 PRD §4.1（T10 完成时用的是 picsum 随机图，已在 T12 改为服装剪影）。

**验收标准**

- [ ] mock 模式下四个页面都能浏览，切换买家后订单列表随之变化
- [ ] 订单状态中文显示正确（待付款 / 待发货 / 已发货 / 已签收 / 已完成 / 已取消），售后状态同理
- [ ] 1440px 桌面宽度下美观；PR 附四个页面截图

---

## T11 卖家端骨架 + PWA — Cursor

- 分支：`t11-seller-shell`
- 依赖：T00（可与 T10 并行，注意 `lib/api-client.ts` 合并冲突——先合并 T10 再开始 T11，或只在 T11 里追加函数）
- 必读：`docs/PRD.md` §5 §7、`docs/CONTRACTS.md` §3

**要做**

1. `/seller` 布局：移动端优先（基准 390×844）；桌面端居中显示 430px 宽的"手机容器"，背景浅灰。底部 Tab：会话 / 看板 / 知识库 / 规则。
2. `/seller` 会话列表：四组（待人工 / 人工处理中 / AI 处理中 / 已结束；T11 时改为四组），每项显示头像、昵称、最后一句、相对时间、风险标签（橙色）、等待时长（待人工组）、未读红点。mock 数据至少 6 个会话覆盖三种状态。
3. `/seller/c/[id]` 会话详情：消息流（买家 / AI / 卖家 / 系统 四种样式）、顶部「接管」「交还 AI」按钮（先只改本地状态）、可折叠的「AI 上下文」面板（展示 DialogState：当前任务、槽位、最近动作、风险标签、转人工原因与摘要）。
4. 其余三个 Tab 先放标题占位。
5. PWA：`app/manifest.ts`（name「栖木商家」、short_name「栖木」、`start_url: /seller`、`display: standalone`、主题色 `#2F4F3E`）、图标（可以用 SVG 生成的 192/512 PNG，内容为「栖」字）、iOS `apple-touch-icon` 和 `apple-mobile-web-app-capable` meta。

**验收标准**

- [ ] 手机宽度（Chrome DevTools 390×844）下会话列表和详情好看、可用
- [ ] Lighthouse / DevTools Application 面板能识别 manifest
- [ ] PR 附手机宽度截图：会话列表、会话详情（AI 上下文面板展开）

---

## T03 工具层 + RAG + 知识库 API — Codex

- 分支：`t03-tools-rag`
- 依赖：T02
- 必读：`docs/CONTRACTS.md` §4 §9、`docs/ARCHITECTURE.md` §4.5 §5、`docs/DATA_SPEC.md` §4 §6

**要做**

1. `lib/tools/registry.ts`：工具注册表，每个工具有 `name`、中文 `description`、JSON Schema `parameters`、`kind: "read" | "write" | "action"`、`run(args, ctx)`。`ctx` 至少含 `buyerId`、`conversationId`。导出 `toOpenAITools()` 供 L3 使用。
2. 实现 CONTRACTS §9 的全部工具。读工具做归属校验；写工具**只创建 `PendingAction`**（存 `data/runtime/pending_actions.json`），并校验 DATA_SPEC §6 的业务规则，不满足时返回 `{ ok: false, reason: "中文原因" }`。
3. `lib/tools/execute-pending.ts`：`confirmPendingAction(id)` 真正修改订单 / 新建售后单（含 timeline），`cancelPendingAction(id)`。
4. `recommend_size`：DATA_SPEC §4 确定性算法，返回 `{ size, basis }`（basis 是中文解释）。写单元测试覆盖：160/50→M、158/47→S、斤换算、宽松版型、超出范围。
5. `lib/rag/`：`chunk.ts`、`index.ts`（embedding 或 bigram 两种模式，自动选择）、`search.ts`。索引存 `data/runtime/kb_index.json`。`npm run seed` 时为初始知识库建索引。
6. 知识库 API：CONTRACTS §4 全部接口。
7. `scripts/try-tools.ts`：命令行逐个调用工具打印结果，便于人类验证。

**验收标准**

- [ ] `npx tsx scripts/try-tools.ts` 输出全部工具的调用结果，其中：B001 的 QM2026092801 换 L 码 → 生成 PendingAction；换炭灰 L → 返回"缺货，预计 10-12 补货"；B003 的 QM2026100401 改地址可以、QM2026092801 被 B003 访问 → 拒绝
- [ ] 确认换货的 PendingAction 后，订单 QM2026092801 多了一条 exchange 售后单
- [ ] `POST /api/kb/search {"query":"真丝怎么洗"}` 第一条命中洗护指南的真丝章节（embedding 和 bigram 两种模式都要验证）
- [ ] `recommend_size` 单元测试通过

---

## T04 大脑流水线核心 — Codex

- 分支：`t04-pipeline`
- 依赖：T01、T03
- 必读：`docs/ARCHITECTURE.md`（全部，重点 §1 §3 §4）、`docs/DECISIONS.md`、`docs/CONTRACTS.md` §2、`docs/handoff/T01.md`

**要做**

1. `lib/brain/state.ts` + `slots.ts`：ARCHITECTURE §3。`slots.ts` 写单元测试（订单号、身高、体重含斤换算、尺码、中文"大码"等）。
2. `lib/brain/risk.ts`：模型分数 ∪ 硬关键词，返回 `{ handoff, hits, flags }`。
3. `lib/brain/rules.ts`：L1 匹配（quick_action 优先 → 正则 + maxLen），命中计数落盘；否定反馈时给上一条 L1 规则 `misfireCount++`。
4. `lib/brain/handlers/`：ARCHITECTURE §4.5 全部意图。缺槽位按"状态 → 唯一订单自动选 → options 卡片 → 追问"补全。咨询类走 RAG + `GENERATION_MODEL`，回复附 `sources` 卡片。
5. `lib/brain/pipeline.ts`：`handleMessage()` 实现 §1 的 ①–⑥ 和 ⑧（L3 先放一个占位：返回"这个问题我需要再确认一下"并 `unresolvedTurns++`，T05 替换）。**L1 命中时不等 decide()**：先同步跑硬关键词风险检查，未命中就立即回复，decide() 在后台继续跑，若模型风险分超阈值再追加转人工（见 ARCHITECTURE §1、D001 修订）。L2/L3 的具体模型配置以 T01b 报告后 Claude 的决定为准。
6. 确认 / 取消动作：`action.type === "confirm"` → 调 `confirmPendingAction` → 回复结果卡片，trace `layer = "action"`。**务必遵守 CONTRACTS §2「补充约定」五条**（动作落买家消息、确认卡片状态回填、同一轮共用 traceId、转人工状态流转、images 可为空）。
7. `lib/brain/trace.ts`：写 `data/runtime/traces.json`；每写一条 trace 同时更新 `Conversation.lastLayer`。
8. API：`POST /api/chat`、`GET /api/conversations/:id/messages`、`GET /api/conversations/latest`。
9. `scripts/chat-cli.ts`：命令行和客服对话（可选买家、可选 context），每轮打印回复和 trace 摘要，方便不打开前端就验证。

**验收标准**（用 chat-cli 验证，交接文件贴对话记录）

- [ ] B001 发「到哪了」→ L1 命中 R002 → 返回 QM2026100201 物流卡片
- [ ] B001 带 `context.productId=P002` 发「我160 50公斤穿什么码」→ L2 size_recommend → M
- [ ] B001 先说「我九月中旬买的碎花裙」再说「退款到哪了」→ 返回 AS20260920001 进度
- [ ] B001 带 `context.orderId=QM2026092801` 发「能换L吗」→ 确认卡片；确认后订单出现换货售后单
- [ ] B002 发「穿了全身起红疹 不处理就去12315」→ `layer=risk_gate`，会话 `status=waiting_human`
- [ ] B001 发「退款进度 再拖我就找律师」→ 风险闸门优先于 L1
- [ ] `CLASSIFIER_PROVIDER=mock` 且无 key 时以上流程都能走通（回复质量可以差）
- [ ] 每条消息都有 RouteTrace，字段齐全

---

## T12 买家客服聊天窗 — Cursor

- 分支：`t12-chat-widget`
- 依赖：T10
- 必读：`docs/PRD.md` §4.2、`docs/CONTRACTS.md` §2、`lib/types.ts` 中 `ChatMessage` `ChatCard` `ChatAction`

**要做**

0. **先修一个视觉问题**：T10 的商品图用了 picsum 随机风景照（路灯、咖啡、山景），和女装店不搭，演示时很出戏。改为在 `components/shop/ProductImage.tsx` 里按 PRD §4.1 生成 SVG 服装剪影，商城页面和聊天里的商品卡片共用。
1. 右下角悬浮按钮 → 右侧抽屉（420px）。实现 T10 留下的 `openChat({ productId?, orderId? })`。
2. 打开时调用 `GET /api/conversations/latest` 恢复会话。
3. 输入框 + 快捷按钮（查物流 / 退款进度 / 尺码推荐 / 转人工）+ 上下文条（可关闭）。
4. 渲染全部 9 种 `ChatCard`：订单、物流时间线、商品（可点击跳转）、售后进度、**确认卡片**（确认 / 取消按钮，处理后变为不可点击并显示结果）、选项卡片、尺码结果、优惠券、来源引用（可折叠）。
5. `quickReplies` 渲染为消息下方的小按钮。
6. 发送中显示"正在输入…"；接口失败显示可重试的错误气泡。
7. 人工模式：顶部条「人工客服 阿栖 为您服务」，每 2 秒轮询 `/messages?after=`。
8. 🔍 调试开关：请求带 `debug: true`，在 AI 回复下方显示一行小字（层级用 PRD §7 的配色徽标）：`L2 上下文层 · refund_progress · 0.91 · 186ms · ¥0.00002`。
9. mock 模式：在 `lib/mock/` 写一个**脚本化的假后端**，至少能演示：物流卡片、确认卡片、转人工、调试信息。

**验收标准**

- [ ] mock 模式下完整走通 PRD §8 剧本的第 1–4 步（回复内容可以是假的，卡片和交互必须真实）
- [ ] 从订单页点「联系客服」打开时，上下文条显示该订单
- [ ] PR 附截图：物流卡片、确认卡片（确认前后）、转人工状态、调试信息

---

## T05 L3 Agent + 转人工 + 卖家会话 API + 规则 API — Codex

- 分支：`t05-agent-handoff`
- 依赖：T04
- 必读：`docs/ARCHITECTURE.md` §4.4 §4.6 §4.7、`docs/CONTRACTS.md` §3 §5 §7

**要做**

1. `lib/brain/agent.ts`：ARCHITECTURE §4.6。系统提示词写在 `lib/brain/prompts/agent.ts`，中文；把服务原则写清楚（只基于工具结果回答、写操作必须生成确认、不确定就 `create_handoff`、不承诺政策以外的东西）。替换 T04 的 L3 占位。
2. 无 key / mock 模式下的 L3：返回"这个问题比较复杂，我帮您转接人工客服"并转人工（保证流程不断）。
3. `lib/brain/handoff.ts`：§4.7。进入 `waiting_human` 时写 `Conversation.handoffAt`，`release` 时清空。一句话摘要用 `GENERATION_MODEL` 生成（mock 用模板：`买家{昵称}，{意图中文}，{原因}`）。
4. 卖家会话 API：CONTRACTS §3 全部接口（包括 `takeover / reply / release / close`、可选的 `misfire`）。
5. 规则 API：CONTRACTS §5；`suggestion` 按 ARCHITECTURE §4.4 计算。
6. 人工模式下买家消息：不自动回复，`unreadForSeller++`。
7. 演示重置：`POST /api/admin/reset`（CONTRACTS §7）。

**验收标准**（chat-cli + curl，交接文件贴记录）

- [ ] B001「上周买的那件外套换成L码，顺便帮我看看有没有能用的券」→ L3，trace 中工具调用依次包含 list_orders / check_stock / request_exchange / list_coupons，回复带确认卡片和券信息；过期券不出现
- [ ] B003「两个订单都帮我处理下：没付款的取消，已经付了的改地址到…」→ L3 生成两个确认（或依次确认）
- [ ] 转人工 → `GET /api/conversations` 中该会话排在最前；`reply` 后买家端 `/messages?after=` 能取到卖家消息；`release` 后 AI 恢复回复
- [ ] `GET /api/rules` 中 R007、R008 的 `suggestion` 为 `delete`

---

## T13 人工接管台 + 知识库页 + 规则页 — Cursor

- 分支：`t13-seller-pages`
- 依赖：T11
- 必读：`docs/PRD.md` §5、`docs/CONTRACTS.md` §3 §4 §5

**要做**

0. 用上新字段：会话列表的等待时长改用 `handoffAt`，列表行加 `LayerBadge`（`lastLayer`）；mock 数据补上这两个字段。另外在真实浏览器 390×844 下确认右侧没有被裁切（T10、T11 的截图右侧都像被截掉一块，可能只是截图工具的问题，需要人眼确认）。
1. 会话详情接上真实 API（mock 模式仍可用）：接管 / 交还 AI / 回复 / 结束；每 2 秒轮询新消息；「AI 上下文」面板里增加**路由轨迹**：每条买家消息对应一行（层级徽标 + 意图 + 置信度 + 耗时），点击展开风险分数和工具调用。
2. 会话列表每 3 秒刷新；待人工会话有新消息时红点 + 列表顶部一条横幅「有 1 位买家等待人工」。
3. `/seller/kb`：文档列表；导入（上传 .md/.txt 或粘贴文本，导入中显示进度状态）；点击文档看分块；「试搜一下」输入框显示命中分块和分数。
4. `/seller/rules`：规则卡片列表（名称、正则、意图中文名、maxLen、开关、命中 / 误判次数、最后命中时间）；`suggestion=delete` 的显示橙色「建议删除」标签和原因；新增 / 编辑规则的底部弹层（正则实时校验）。

**验收标准**

- [ ] 买家端触发转人工后，卖家端 3 秒内出现红点；卖家回复后买家端 2 秒内看到
- [ ] 导入一篇新的 .md 后，「试搜一下」能搜到其中内容
- [ ] 关闭 R007 后，买家发「尺码不合适想退货」走 L2 refund_apply（与 Codex 联调验证）
- [ ] PR 附手机宽度截图：接管台（路由轨迹展开）、知识库导入、规则页

---

## T06 种子流量 + 看板 API + 评测脚本 — Codex

- 分支：`t06-analytics-eval`
- 依赖：T05
- 必读：`docs/ARCHITECTURE.md` §6 §7、`docs/CONTRACTS.md` §6、`data/eval/cases.json`

**要做**

1. `scripts/gen-traffic.ts`：ARCHITECTURE §7。生成约 60 个历史会话、约 300 条买家消息及对应 AI 回复和 RouteTrace（`isSimulated: true`）。消息文本要像真实买家（复用各意图的多种说法），层级、意图、置信度、延迟、成本的分布合理（L1 20–50ms、L2 150–600ms、L3 2–7s；成本按 T01 交接文件记录的 Jev 实测单价）。包含约 10 条低置信度样本和约 12 条风险命中。`npm run seed` 末尾调用。
2. `GET /api/analytics/routing`：CONTRACTS §6，按 `range` 聚合，**严格遵守 §6「统计口径」七条**（前端看板已按此实现）。
3. `scripts/eval.ts`（`npm run eval`）：按 `cases.json` 说明逐条执行（每条前重置 runtime），统计意图准确率、路由准确率、风险召回率、风险误报率、平均延迟，失败用例列表；结果写 `data/runtime/eval_latest.json`（并复制到 `data/seed/eval_latest.json` 以便看板默认展示）和 `docs/reports/T06-eval.md`。
4. `GET /api/eval/latest`。
5. 用默认配置（Jev）跑一次 eval，在交接文件里贴结果；分别在 R007 开启 / 关闭时跑 E58，记录差异（这是"规则层做减法"的证据）。

**验收标准**

- [ ] `npm run seed` 后看板 API 返回非空数据，各层占比接近 ARCHITECTURE §7
- [ ] `npm run eval` 跑完 60 条并生成报告
- [ ] 报告中失败用例逐条给出原因分析（分类错 / 槽位没补全 / 规则误吞 / 风险漏判）
- [ ] 报告包含 **Jev 中文表现**一节（代替原先取消的前置测试）：L2 用例上 Jev 的意图准确率、置信度分桶（<0.5 / 0.5–0.7 / 0.7–0.85 / ≥0.85）的数量和准确率、风险各项召回率与误报率，并给出 `L2_CONFIDENCE_THRESHOLD` 的调整建议（选使"被 L2 接下的消息准确率 ≥ 95%"的最低置信度）
- [ ] 若 Jev 意图准确率 < 70%，报告里明确写出，并用 `CLASSIFIER_PROVIDER=llm` 再跑一次作对比（是否切换由 Claude 决定）

---

## T14 路由看板页 — Cursor

- 分支：`t14-dashboard`
- 依赖：T13
- 必读：`docs/PRD.md` §5.1、`docs/CONTRACTS.md` §6

**要做**

1. `/seller/dashboard`，手机宽度布局，顶部「今天 / 近 7 天」切换。
2. 4 个指标卡：总消息数、自动解决率、转人工率、平均响应时间。
3. **漏斗**：风险闸门 → L1 → L2 → L3 → 人工，横向条形，显示数量、占比、平均延迟、每千条成本（¥）。层级配色按 PRD §7。
4. 时间分布堆叠柱状图（各层）、阶段分布（售前 / 售中 / 售后 / 其他）、意图 Top 8。
5. 低置信度样本列表（点击跳转到对应会话）。
6. 评测成绩卡（`latestEval`）：意图准确率、路由准确率、风险召回率、风险误报率、评测时间。
7. 底部小字：「含模拟历史数据」（`includesSimulated` 为 true 时）。
8. 图表库用 Recharts（或纯 SVG），不要引入重型库。

**验收标准**

- [ ] mock 和真实 API 下都能渲染；空数据时有空状态
- [ ] 在买家端发一条消息后，刷新看板数字会变化
- [ ] PR 附手机宽度截图（完整长图）

---

## T15a 不依赖后端的打磨 — Cursor

- 分支：`t15a-polish`
- 依赖：T14
- 说明：后端 T02–T05 还没做完，先把不需要真实接口的打磨做掉，联调留给 T15。

**要做**

1. 加载态、空状态、错误态全部检查一遍（买家端 4 个页面 + 聊天窗 + 卖家端 4 个 Tab + 会话详情），缺的补上，文案统一、口吻温和。
2. 修掉买家端首页开发模式下的 hydration 提示（`components/shop/TopBar.tsx` 的 `CategoryNav`，T13 交接里提到）。
3. 卖家端「设置」入口（会话 Tab 右上角齿轮）→ 设置页：「重置演示数据」按钮（二次确认，调用 `resetDemo()` → `POST /api/admin/reset`；mock 下调用 `__qimuMock.reset()` 的同等逻辑），成功后刷新；顺便显示当前模式（mock / 真实后端）和版本信息。
4. 买家端首页加一个不显眼的「演示指南」入口（右下角聊天按钮上方的小圆钮或页脚链接），浮层列出 PRD §8 剧本 6 步，每步一个可点击的快捷入口（如「以 林小满 身份打开订单 QM2026100201 并联系客服」：自动切换买家、跳转页面、打开聊天窗并带上上下文、把示例话术填进输入框但不自动发送）。第 5、6 步链接到卖家端对应页面。
5. 看板主结论卡里「74% 在 L1/L2 就解决了」和指标卡「自动解决率 86%」口径不同，观众容易困惑：在主结论卡的说明里加半句「（其余 12% 由大模型自动解决）」之类的过渡，让两个数字能对上。

**验收标准**

- [ ] mock 模式下演示指南 6 步都能一键进入对应场景
- [ ] 开发模式下首页没有 hydration 提示
- [ ] PR 附截图：演示指南浮层、设置页、任意两个空状态

---

## T15 前后端联调 — Cursor

- 分支：`t15-integration`
- 依赖：T05、T15a

**要做**

1. 把 `lib/api-client.ts` 的默认值改为「未设置 = 真实后端」（见 `docs/questions/T10-1.md`）。`.env.local` 设 `NEXT_PUBLIC_USE_MOCK=0`，按 PRD §8 演示剧本完整走一遍，修复所有前端问题；后端问题写到 `docs/questions/`（标明用例和复现步骤）。
2. 逐项核对 T12–T14 交接里列出的「待联调」项：确认卡片回写、`after` 增量轮询、同一轮共用 traceId、知识库上传字段、试搜请求体、规则 PATCH、看板口径（CONTRACTS §6）。

**验收标准**

- [ ] 真实后端下 PRD §8 剧本 6 步全部走通，录一段屏幕录像或附 6 张截图

---

## T07 (P1) 店铺 AI 助手 + Jev 批量打标 — Codex

- 分支：`t07-seller-assistant`
- 依赖：T06

**要做**

1. 卖家侧工具：`query_aftersales({ sinceDays, productId? })`、`tag_reasons({ afterSaleIds })`（用 Jev Choice 一次请求批量把 `reason` 归类为：尺码不合适 / 质量问题 / 色差 / 与描述不符 / 不喜欢了 / 物流问题 / 其他，写回 `reasonCategory`；Jev 不可用时用 LLM）、`aggregate({ groupBy })`、`export_csv()`。
2. `POST /api/seller/assistant`：用 `AGENT_MODEL` + 上述工具编排。
3. 验收用例：「上周退款最多的 3 个商品是哪些，按原因分类导出」→ 返回文字总结 + 步骤列表 + CSV。
4. 前端页面 `/seller/assistant` 由 Cursor 在 T15 之后视时间完成（届时 Claude 会补任务卡）。

---

## T20 演示剧本 + 最终审查 — Claude

在所有任务合并后：通读代码与报告、跑一遍剧本、写 `docs/DEMO_SCRIPT.md`（逐句台词 + 每一步要指给观众看的地方 + 面试官常见追问及回答）。
