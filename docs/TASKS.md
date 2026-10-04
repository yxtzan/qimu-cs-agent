# TASKS — 任务看板

> 维护者：Claude（总指挥）。**Agent 不得修改本文件**（包括状态列）。任务有疑问写到 `docs/questions/`。
> 状态：`todo` → `doing` → `review`（已开 PR）→ `done`（Claude 审查通过）。状态由 Claude 根据交接文件更新。
> 编号：Codex = T0x，Cursor = T1x，Claude = T2x。

## 总览

| 编号 | 任务 | 负责 | 依赖 | 波次 | 预估 | 状态 |
|---|---|---|---|---|---|---|
| T00 | 项目脚手架 | Codex | — | 0 | 1h | done |
| T01 | decide() 三实现（Jev 为主） | Codex | T00 | 1 | 1.5h | done |
| T01b | Jev 延迟排查 + 兜底提速 | Codex | T01 | 1 | 45m | done |
| T02 | 虚构数据 + seed + 商城只读 API | Codex | T01b | 1 | 3h | done |
| T10 | 买家商城界面 | Cursor | T00 | 1 | 3h | done |
| T11 | 卖家端骨架 + PWA | Cursor | T00 | 1 | 2h | done |
| T03 | 工具层 + RAG + 知识库 API | Codex | T02 | 2 | 3h | done |
| T04 | 大脑流水线核心（状态/风险/L1/L2/handler/聊天 API） | Codex | T01b T03 T16 | 2 | 4.5h | done |
| T12 | 买家客服聊天窗 | Cursor | T10 | 2 | 4h | done |
| T05 | L3 Agent + 转人工 + 重置提速 | Codex | T04 | 3 | 3h | done |
| T05b | 转人工摘要不阻塞 + T06 补跑评测 + L3 延迟拆解 | Codex | T05 | 5 | 1.5h | done |
| T13 | 人工接管台 + 知识库页 + 规则页 | Cursor | T11 | 3 | 3h | done |
| T06 | 评测脚本 + 评测 API | **Cursor**（2026-10-04 改派） | T04 | 4 | 2h | done（T05 合并后补跑一次） |
| T14 | 路由看板页 | Cursor | T13 | 4 | 2.5h | done |
| T15a | 不依赖后端的打磨 | Cursor | T14 | 4 | 2h | done |
| T16 | 会话数据层 + 卖家会话 / 规则 / 重置 API | Cursor | T02 T15a | 4 | 2.5h | done |
| T17 | 种子流量 + 看板 API | Cursor | T16 | 4 | 2h | done |
| T18 | 演示剧本自动化冒烟测试（Playwright） | Cursor | T17 | 4 | 2h | done |
| T08 | 边界情况处理（评测发现的问题 + 风险闸门补强） | Cursor | T06（在 T05 之后合并） | 5 | 2h | done |
| T09 | 风险问法修订 + 关键词等待上限 + 文案驱动流程清理 + L3 通用循环修复 | Codex | T05b T08 | 5 | 2.5h | doing |
| T15 | 前后端联调 | Cursor | T05 T08 T18（T05b 合并后 rebase） | 5 | 2h | done |
| T15b | 演示打磨：看板数字如实 + 演示现场小修 | Cursor | T15 | 5 | 1.5h | doing |
| T07 | (P1) 店铺 AI 助手 + Jev 批量打标 | Codex | T06 | 5 | 2.5h | todo |
| T20 | 演示剧本 + 最终审查 | Claude | 全部 | 5 | — | todo |

**2026-10-04 重排**：后端是关键路径，把不依赖流水线的后端活（会话数据层、卖家会话 / 规则 / 重置 API、种子流量、看板 API）从 Codex 的 T04–T06 里拆出来，交给 Cursor 做 T16、T17。Cursor 写过这些接口的 mock，对契约最熟。Codex 的关键路径 T03 → T04 → T05 → T06 因此缩短约 3.5 小时。

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
5. `lib/rag/`：`chunk.ts`、`index.ts`（embedding 或 bigram 两种模式，自动选择）、`search.ts`。索引存 `data/runtime/kb_index.json`。`npm run seed` 时为初始知识库建索引。重置演示数据时也要重建索引：T16 已合并，用 `registerResetHook("kb-index", …)` 注册；然后把注册钩子的模块登记到 `lib/store/reset-hooks.ts`（加一行 import；文件若还不存在就新建，只放 import 行），**不要**在 `app/api/admin/reset/route.ts` 或 `scripts/seed.ts` 里直接 import。T16 的数据层函数签名见 `docs/handoff/T16.md`。PendingAction 的集合名固定为 `pending_actions`（T16 会读它）。
6. 知识库 API：CONTRACTS §4 全部接口。
7. `scripts/try-tools.ts`：命令行逐个调用工具打印结果，便于人类验证。
8. 顺手修一处知识库内容：`data/seed/kb/退换货政策.md` 里写了「燕麦色 L 码目前有 3 件」这类**具体库存数字**。库存是会变的（演示里一换货就变成 2 件），知识库只写规则，不写实时数据；改成「是否有货以客服实时查询为准」。其他文档如有类似写法一并改掉，改完重跑 `npm run check-seed`。

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
7. `lib/brain/trace.ts`：通过 `lib/store/conversations.ts`（T16 提供）写 RouteTrace；每写一条 trace 同时更新 `Conversation.lastLayer`。**会话、消息、trace 的读写一律用 T16 的数据层，不要自己另建存储。**
8. API：`POST /api/chat`。（`/messages`、`/latest` 已由 T16 实现。）
8b. `lib/brain/decide/warmup.ts`：Jev 预热与保温（ARCHITECTURE §4.3、D010）。服务端第一次处理请求时异步发一次预热调用（不阻塞这次请求），之后每 `JEV_KEEPALIVE_MS` 发一次最小请求；`0` 表示关闭；预热调用不写 RouteTrace，成本记在日志里；没有 key 或 provider 不是 jev 时不启动。
8c. **接线须知（来自 T03 / T16 交接）**：
   - 工具一律通过 `runTool(name, args, ctx)` 调用，读 `result.data`；`ctx.buyerId` / `ctx.conversationId` 来自请求和会话，**永远不从模型参数读**。确认 / 取消用 `confirmPendingAction(id, ctx)` / `cancelPendingAction(id, ctx)`，成功返回 `{ pendingAction, card? }`，直接用 card 生成结果消息。
   - `create_handoff` 只返回 `{ handoff: true, reason }` 指令，由流水线调用 T16 数据层真正切换会话（T05 再补摘要）。
   - 会话 / 消息 / trace 用 `@/lib/store/conversations` 的函数（签名见 `docs/handoff/T16.md`）：`appendTrace` 会自动更新 `lastLayer`；转人工那一轮要自己写 `unreadForSeller`、`handoffAt`、`status`、`mode`。
   - RAG 用 `searchKnowledgeWithMetrics()`，把检索耗时和成本记进 trace。**在线查询的 embedding 超时改为 2 秒**（T03 默认 8 秒），超时直接用 bigram 结果，保证 L2 咨询类回复整体在 1.5 秒左右（PRD §6）；这条改动在 `lib/rag/` 里，属于你的目录。
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
- [ ] 用真实后端跑演示冒烟测试（T18）：`NEXT_PUBLIC_USE_MOCK=0 npm run e2e`，第 1、2、4 步必须通过（第 3、5 步依赖 T05，失败可以接受），交接文件贴结果。第一次运行前先 `npx playwright install chromium`

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

## T05 L3 Agent + 转人工 — Codex

- 分支：`t05-agent-handoff`
- 依赖：T04
- 必读：`docs/ARCHITECTURE.md` §4.6 §4.7、`docs/CONTRACTS.md` §2「补充约定」
- 说明：卖家会话 API、规则 API、重置 API 已改由 Cursor 在 T16 完成，本任务只做大脑部分。

**要做**

1. `lib/brain/agent.ts`：ARCHITECTURE §4.6。系统提示词写在 `lib/brain/prompts/agent.ts`，中文；把服务原则写清楚（只基于工具结果回答、写操作必须生成确认、不确定就 `create_handoff`、不承诺政策以外的东西）。替换 T04 的 L3 占位。L3 可单独打开思考模式（环境变量 `AGENT_REASONING=on|off`，默认 off，先测 off 的效果）。
2. 无 key / mock 模式下的 L3：返回"这个问题比较复杂，我帮您转接人工客服"并转人工（保证流程不断）。
3. `lib/brain/handoff.ts`：§4.7 + CONTRACTS §2 补充约定第 4 条。进入 `waiting_human` 时写 `handoffAt`。一句话摘要用 `GENERATION_MODEL` 生成（mock 用模板：`买家{昵称}，{意图中文}，{原因}`）。
4. 人工模式下买家消息：不自动回复，`unreadForSeller++`（T04 已实现，确认即可）。
5. **重置提速**：T04 实测每次「重置演示数据」要重建 10 篇知识库的向量索引，耗时 40–70 秒——演示现场点一次重置要等一分钟，E2E 每步也被拖慢。改为**按内容缓存向量**：以「分块文本 + 模型名」的哈希为键，把向量存到 `data/runtime/embedding_cache.json`（重置时**保留**这个文件，像 T17 保留 eval_latest 那样），重置时内容没变的分块直接复用。目标：第二次起重置 < 5 秒。
6. 接 T04 交接的接口：替换 `lib/brain/agent.ts` 的 `runAgent(ctx)`，返回 `HandlerResult`；L3 的费用记到 `cost.agentUsd`，不要混进 `generationUsd`；L3 不能绕过风险闸门和写操作确认。

**验收标准**（chat-cli + curl，交接文件贴记录）

- [ ] B001「上周买的那件外套换成L码，顺便帮我看看有没有能用的券」→ L3，trace 中工具调用依次包含 list_orders / check_stock / request_exchange / list_coupons，回复带确认卡片和券信息；过期券不出现
- [ ] B003「两个订单都帮我处理下：没付款的取消，已经付了的改地址到…」→ L3 生成两个确认（或依次确认）
- [ ] 转人工后 `GET /api/conversations`（T16）里该会话排在最前、`handoffAt` 有值；卖家 `reply` 后买家端 `/messages?after=` 能取到；`release` 后 AI 恢复回复
- [ ] L3 单条平均延迟和成本写进交接文件
- [ ] `NEXT_PUBLIC_USE_MOCK=0 npm run e2e` 6 步全部通过（第 3 步 L3 超时上限 30 秒，不够可以在交接文件里说明实测耗时）

---

## T05b 转人工摘要不阻塞 + T06 补跑评测 + L3 延迟拆解 — Codex

- 分支：`t05b-followups`
- 依赖：T05（已合并）
- 必读：`docs/handoff/T05.md`、`docs/handoff/T06.md`、`docs/reports/T06-eval.md`、`docs/DECISIONS.md` D011 D012、`lib/brain/background.ts`
- 说明：T05 让转人工时**等**模型生成一句话摘要（最多 2.5 秒）再回复买家，连硬关键词命中的风险闸门也要等——这一步原本是毫秒级的，演示「过敏 + 12315」时会明显变慢。摘要是给卖家看的，买家不需要等它。另外 T06 的评测要在 T05 合并后补跑一次。

**要做（按顺序）**

1. **先补跑评测**（在当前 main 上、改任何代码之前）：`npm run eval`（真实 Jev）。提交更新后的 `docs/reports/T06-eval.md` / `.json`、`data/seed/eval_latest.json`，并在 `docs/handoff/T06.md` 的对比表补上「T05 合并后」一列，下面逐条写 E51–E57 的结果（层级、工具序列、延迟、通过与否）。注意 E46 的期望已由 Claude 放宽为 L2/L3（见 T06-3 答复），对比时注明。
2. **转人工摘要改为后台生成**（`lib/brain/handoff.ts`）：进入转人工时立即写入系统消息和**模板摘要**并返回；模型摘要用 `lib/brain/background.ts` 的后台任务生成，完成后更新会话摘要。摘要费用在后台完成后补记到这一轮 trace 的 `generationUsd` / `totalUsd`（用现有的 trace 更新方式；做不到就记日志并在交接里说明）。**不要改 `lib/brain/pipeline.ts` 的风险闸门那几行**（T08 正在改）；确实需要动 pipeline，只能改文件底部的 `handoffMessages` 函数。
3. **L3 延迟拆解**：T05 实测整轮平均约 10.9 秒，其中 Agent 自身约 5.7 秒。用第 1 步的评测数据和 `[agent-step]` 日志，在交接里写清楚一条 L3 消息的时间花在哪（decide / 预读订单 / 每次模型调用 / 工具 / 摘要），并给出 1–2 条最有效的提速建议。**这一条只分析、不改代码。**

**目录归属（本任务特批）**：`docs/reports/T06-eval.md` `docs/reports/T06-eval.json` `data/seed/eval_latest.json` `docs/handoff/T06.md`（只补对比列和 E51–E57 结果）。

**验收标准**

- [ ] 补跑评测的报告已提交，T06 交接里有两次结果对比
- [ ] B002「穿了全身起红疹 不处理就去12315」：买家收到转人工消息的时间回到 1 秒以内（trace 的 totalMs 或 chat-cli 计时），卖家端稍后能看到模型摘要
- [ ] `npm run typecheck` `npm run lint`、`scripts/check-agent.ts`、`scripts/check-t05-api.ts` 通过；`NEXT_PUBLIC_USE_MOCK=0 npm run e2e` 6 步全部通过
- [ ] 交接里有 L3 延迟拆解和提速建议
- [ ] 限时 1.5 小时

---

## T09 风险问法修订 + 关键词等待上限 + 文案驱动流程清理 + L3 通用循环修复 — Codex

- 分支：`t09-risk-polish`
- 依赖：T05b、T08（都合并后再开工）
- 必读：`docs/questions/T08-1.md` `T08-2.md` 的 Claude 答复、`docs/ARCHITECTURE.md` §4.2（问法已修订）、`docs/DECISIONS.md` D011、`docs/handoff/T08.md`、`lib/brain/caution.ts`
- 说明：T08 的评测发现，「这件是防过敏面料吗」「敏感肌穿羊毛会扎吗」这类购买前咨询会被 Jev 判成健康风险（0.46–0.71），原因是风险问题问的是「买家是否**提到**过敏」。另有两处小取舍和一处 T08 遗留的文案驱动流程。T08 期间借给 Cursor 的大脑文件已归还给你。

**要做**

1. **风险问法修订**（`lib/brain/decide/questions.ts`）：`legal_threat`、`health_safety` 的 instructions 改成 ARCHITECTURE §4.2 的新文字（`true` / `false` 的 criteria 跟着改成同样的意思）。llm 兜底分类器如果用同一段文字，一起生效。
2. **关键词等待上限**（`lib/brain/pipeline.ts` 风险闸门那几行）：关键词命中后等分类器最多 `KEYWORD_RISK_WAIT_MS`（默认 2500，加进 `.env.example`），超时按关键词转人工，trace 里注明 `decideProvider` 缺失或超时。
3. **从关键词降级来的黄标不加安抚语**（`lib/brain/caution.ts`）：这种情况只确保有「转人工」按钮；模型自己判出的黄标照旧加安抚语。用 `RiskResult` 里已有的降级信息判断。
4. **流程不看文案**（`lib/brain/handlers/index.ts` 的 `runHandler` + 抛这类错误的地方，如 `lib/tools/write-rules.ts`）：需要转人工的报错带结构化字段（例如 `ToolError` / `HandlerFailure` 加 `handoff: true`），`runHandler` 只看这个字段，删掉 `/转人工|人工审核|人工确认/` 正则。**买家看到的文字和是否转人工的结果都保持不变**，只是判断方式变了。
5. **修 `scripts/check-pipeline.ts`**：T05 之后在 main 上报「缺少 aftersale 卡片」（T08 交接里有复现）。查清是脚本的期望过时还是流水线真的少了卡片；是后者就修流水线并在交接里说明。

6. **L3 通用循环的三处失败**（`lib/brain/agent.ts`）。T05b 补跑评测（`docs/reports/T05b-eval-T05-only.md`）里：
   - E39「会让我被闺蜜嫉妒死哈哈」、E50「付不了款怎么办」、E56「大衣和开衫哪个更保暖，顺便告诉我怎么洗」都是模型**没调工具就直接回答**，被 `if (!calls || …) return failed()` 一律当成失败转人工。改为：第一轮模型调用对涉及商品 / 订单 / 政策事实的请求用 `toolChoice: 'required'`（先查再答）；分类器意图是 `other` / `greeting` 的闲聊，允许不调工具的简短回复（≤ 80 字、不含数字），否则仍转人工。规则要通用，不能按句子写。
   - E53「同色开衫 + 有没有我的码 + 用券后多少钱」：通用循环收尾时只用卡片模板，漏答了其余问题。改为：**通用循环**里有结构化卡片时，回复文字用模型的最终总结 + 卡片；D012 的两个有界组合维持模板收尾不变。
   - E57「到哪了，另外我想把上周那件外套退了」：`apply_refund` 失败后转人工。查清失败原因（参数、itemId、缺退款原因，还是规则不允许）：是正常的业务拒绝，就把原因告诉买家、不转人工；是参数问题，就修工具说明或提示词。

**验收标准**（交接文件贴记录）

- [ ] `npm run typecheck` `npm run lint`、`lib/brain/*.test.ts` `lib/tools/*.test.ts` 全部通过（caution 测试按第 3 条更新）；`scripts/check-pipeline.ts` 通过
- [ ] `npm run eval -- --only E38` 连跑 3 次都不触发风险闸门；「这件是防过敏面料吗」（B001，`productId=P013`）和「我闺蜜是律师，她说这件挺好看」都不转人工，贴 Jev 分数
- [ ] 「穿了全身起红疹 不处理就去12315」「穿了一天脖子痒得睡不着」「我要让所有人都知道你们家东西什么质量」仍然转人工（或至少进黄区，照实贴分数）
- [ ] 全量 `npm run eval`（真实 Jev）：风险召回 100%，宽口径风险误报 0；和 T05b 补跑结果逐条对比，有变化逐条解释
- [ ] 把 Jev 人为调到超时（例如临时把 Jev 超时设成 1ms）时，带「12315」的消息在 3 秒内转人工
- [ ] `npm run eval -- --only E39,E50,E53,E56,E57` 逐条贴结果（层级、工具、回复原文）；不转人工的那几条，回复里不能出现工具结果之外的事实
- [ ] `NEXT_PUBLIC_USE_MOCK=0 npm run e2e` 6 步全部通过
- [ ] 限时 2.5 小时

---

## T15b 演示打磨：看板数字如实 + 演示现场小修 — Cursor

- 分支：`t15b-demo-polish`
- 依赖：T15（已合并）。可以和 Codex 的 T09 并行（目录不重叠）。
- 必读：`docs/handoff/T15.md`、`docs/handoff/T05.md`（L3 真实成本）、`docs/reports/T05b-latency.md`、`lib/analytics/gen-traffic.ts`、`components/seller/DashboardScreen.tsx`
- 说明：Claude 审 T15 截图时发现看板写着「L3 单条是 L2 的 53 倍成本、处理 9% 的消息花掉 84% 的成本」。这个数来自**种子流量**：L3 的模拟成本按 $0.002–0.005/条编的，而 T05 实测 L3 每条约 $0.00011（agent）+ $0.000059（分类）≈ $0.00017，真实只有 L2 的 2–3 倍。演示时被追问就穿帮了，必须改成和实测一致。另有几处演示现场会碰到的小问题。

**要做**

1. **种子流量的 L3 成本改成实测口径**（`lib/analytics/gen-traffic.ts`）：L3 的 `agentUsd` 在 $0.00008–0.0002 之间（T05：两条验收平均 $0.000112；T05b 评测的 L3 trace 可作参考），转人工的 L3 同理。延迟保持 2–7s 不变或按 T05b 实测略调（3–9s），文件头注释同步改，并写清数据来源。
2. **看板对比卡讲真话**（`components/seller/DashboardScreen.tsx`）：现在只比成本。改成**成本和延迟都比**，例如「L3 只处理了 9% 的消息，单条成本是 L2 的 3 倍，平均要等 4.7 秒（L2 0.46 秒）」。倍数都从数据算，不写死；倍数 < 1.5 时那半句不显示。结论句保留「尽量把消息挡在前面几层」，理由改成「又快又省」。
3. **关掉 Next 开发角标**（`next.config.ts`，本任务特批）：`devIndicators: false`。截图里左下角的「N」挡住了卖家端底部导航的「会话」。
4. **售后单号可读**（`lib/tools/execute-pending.ts`，本任务特批，**只改单号生成那几行**）：现在是 `AS-e0ccaa76-8e45-…` 这种长串，和种子数据的 `AS20260920001` 不一致。改为 `AS` + DEMO 当天日期 `YYYYMMDD` + 当天序号三位（在现有售后单里找同日期最大序号 +1）。PendingAction 的 id 不用改。
5. **演示指南加「重置演示数据」按钮**（`components/shop/DemoGuide.tsx`）：放在指南底部，点了先确认，再调 `POST /api/admin/reset`，成功后刷新页面。T15 交接说「同一订单换过一次再走第 3 步会转人工」，现场玩乱了要能一键回到初始状态。
6. **（可选）确认后订单页刷新**：在订单详情页点聊天里的「确认办理」成功后，左边订单页没有出现新的售后信息（T15 截图 3b）。若订单详情页本来就会展示售后，确认成功后触发一次页面数据刷新；若页面不展示售后，就不做。

**目录归属（本任务特批）**：`next.config.ts`（只加 `devIndicators`）、`lib/tools/execute-pending.ts`（只改售后单号生成）。其余都是你的目录。不改 `lib/brain/**`（Codex 的 T09 正在改）。

**验收标准**

- [ ] 重置后看板「近 7 天」：L3 每千条成本在 ¥1–2 左右（汇率按代码里的），对比卡同时出现成本倍数和延迟；附手机宽度截图
- [ ] 第 3 步确认后的售后单号形如 `AS20261005001`；再走一次（重置后）仍从 001 开始
- [ ] 演示指南里点「重置演示数据」→ 确认 → 页面刷新，回到初始状态（第 3 步可以再走一次并出确认卡）
- [ ] 截图里没有 Next 开发角标
- [ ] `npm run typecheck` `npm run lint` 通过；`NEXT_PUBLIC_USE_MOCK=0 npm run e2e` 6 步全部通过（e2e 如果断言了售后单号格式，按新格式更新）
- [ ] 限时 1.5 小时

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

## T08 边界情况处理（评测发现的问题 + 风险闸门补强） — Cursor

- 分支：`t08-edge-cases`
- 依赖：T06（已合并）。**和 T05 并行开发，但必须在 T05 之后合并**：如果你先做完，等 T05 合并后把分支 rebase 到最新 main，重跑验收再推。
- 必读：`docs/questions/T06-1.md` `T06-2.md` `T06-3.md` 里 Claude 的答复、`docs/DECISIONS.md` D011、`docs/ARCHITECTURE.md` §4.2 §4.5、`docs/reports/T06-eval.md`、`lib/brain/pipeline.ts`、`lib/brain/risk.ts`
- 说明：T06 评测和讲解手册的复盘找出了几处「拿不准时处理得太粗」的地方：该给方案的直接转人工、关键词误伤、黄色区间没有动作、情绪黄标门槛写错。本任务按 D011 把它们补上。改动都小，**不要借机重构**。

**要做**

1. **质量问题先给方案**（`lib/brain/handlers/index.ts` 的 `qualityIssue`）：订单已签收且在 7 天无理由期内（DEMO_NOW 计）→ 致歉 + 说明可 7 天无理由退换（金卡会员免退货运费）+ 快捷回复「换个颜色」「申请退货」「是质量问题，转人工」，不自动转人工；已过 7 天、在 15 天质量期内且金额 > ¥500 → 维持转人工；其他情况维持现状。
2. **尺码超范围不自动转**（`lib/tools/recommend-size.ts` + `lib/brain/handlers/read.ts` 的 `sizeRecommend`）：工具对超范围返回结构化结果（例如 `{ outOfRange: true, maxSize: 'XL', ... }`），不再抛带「建议转人工」文案的错误；handler 回复说明本店尺码表上限（XL：身高 175cm、体重 70kg）、这款可能没有合适尺码，附「转人工」快捷回复，买家点了才转。`runHandler` 里那条匹配文案的正则这次不动（只是尺码不再走到它）。
3. **情绪黄标门槛 bug**（`lib/brain/risk.ts`）：情绪是 0–3 分，黄标门槛改为 ≥ 1.5；四个风险项仍是 ≥ 0.5。在 `risk.test.ts` 补测试。
4. **关键词误伤降级**（`lib/brain/risk.ts` + pipeline 里风险闸门那几行）：硬关键词命中后**不再立刻转人工**，而是等这一轮的 `decide()` 结果（它本来就在跑，受 `DECIDE_BUDGET_MS` 约束）：
   - `decideProvider` 是 `jev` 或 `llm`，且该风险项的模型分数 < 0.3 → 不转，改为黄标（进入第 5 条的黄区处理）；
   - 其他情况（模型分 ≥ 0.3、decide 失败、mock）→ 照旧转人工。
   - L1 命中的消息同样适用：只有在**关键词命中**时 L1 才等 decide，其余 L1 消息仍然不等。
5. **黄色区间要有动作**（新文件 `lib/brain/caution.ts`，pipeline 只加一行调用）：这一轮有黄标、没有转人工、最终由 L2 或 L3 回复时，在第一条 AI 消息前加一句固定的安抚语（按风险类型选模板，**不调模型**），并确保回复里有「转人工」快捷回复。L1 回复不处理。调用点放在 L2/L3 结果写入消息之前的**同一个位置**，方便和 T05 合并。
6. **连续两轮黄标 → 转人工**（同在 `caution.ts`）：同一会话里上一条买家消息的 trace 有黄标（用同一套门槛从 `riskScores` 算），这一条又有黄标 → 用现有的 `enterHandoff` 转人工，原因「连续两轮情绪或风险偏高」，`trace.handoffReason` 同步写。
7. **观测**：把 `decision.multiStep` 写进 `RouteTrace.multiStep`（字段已由 Claude 加在 `lib/types.ts`）。
8. **Jev 保温**（`lib/brain/decide/warmup.ts`、`lib/store/reset-hooks.ts` 只加 import 行、`.env.example`）：导出 `warmJevNow()`，重置演示数据完成后调用一次（没有 key 或 provider 不是 jev 时什么都不做）；`JEV_KEEPALIVE_MS` 默认值改为 120000（代码和 `.env.example` 一起改）。
9. **评测报告文案**（`lib/eval/report.ts`）：未通过列表里 E58 的原因后面加「预期内失败（R007 为反面教材规则）」。判定逻辑不变、总分照算。

**目录归属（本任务特批）**：`lib/brain/handlers/index.ts` `lib/brain/handlers/read.ts` `lib/brain/risk.ts` `lib/brain/risk.test.ts` `lib/brain/caution.ts`（新建） `lib/brain/trace.ts` `lib/brain/decide/warmup.ts` `lib/tools/recommend-size.ts` `.env.example`（只改 `JEV_KEEPALIVE_MS` 一行）、`lib/brain/pipeline.ts`（**只加调用行和风险闸门那几行**，逻辑放进新文件）。**不要碰** `lib/brain/agent.ts` `lib/brain/prompts/**` `lib/brain/handoff.ts` `lib/rag/**`——T05 正在改它们。不改 `data/eval/**`。

**验收标准**（chat-cli 或 `npm run eval -- --only`，交接文件贴记录）

- [ ] `npm run typecheck` `npm run lint` 通过，`risk.test.ts` 新增用例通过
- [ ] E40「有点小失望，外套比图片颜色深一点」→ 不转人工，回复提到 7 天无理由，带三个快捷回复
- [ ] E59「身高185体重90kg有合适的吗」→ 不转人工，回复说明尺码上限，带「转人工」快捷回复；点它才转
- [ ] B001「我闺蜜是律师，她说这件挺好看」、B001 带 `productId=P013`「这件是防过敏面料吗」→ Jev 正常时不转人工（若 Jev 分数 ≥ 0.3 导致仍转，照实写分数，不要为它调阈值）
- [ ] B002「穿了全身起红疹 不处理就去12315」→ 仍然 `layer=risk_gate` 转人工
- [ ] 黄区演示：找一句能让情绪分落在 1.5–2.5 的话（例如「什么破快递，三天了还没动」）→ 回复带安抚语和「转人工」按钮；同一会话再发一句不满的话 → 转人工。若 Jev 分数没进黄区，换句话，交接里照实记录分数
- [ ] trace 里有 `multiStep`；重置演示数据后日志里能看到一次 Jev 预热
- [ ] `npm run eval` 全量（真实 Jev）：风险召回仍 100%，宽口径风险误报仍 0；E40、E59 通过；其他原本通过的用例没有变成失败（有变化逐条解释）
- [ ] `NEXT_PUBLIC_USE_MOCK=0 npm run e2e`：不依赖 T05 的步骤仍全部通过
- [ ] 限时 2 小时

---

## T06 评测脚本 + 评测 API — Cursor（2026-10-04 由 Codex 改派）

- 分支：`t06-eval`
- 依赖：T04（流水线已合并）。T05 还在做，L3 类用例（E51–E57）在 T05 合并前会失败，属正常，合并后重跑一次即可。
- 必读：`data/eval/cases.json`（顶部 `_readme` 写了执行规则）、`docs/CONTRACTS.md` §6、`docs/handoff/T04.md`、`scripts/chat-cli.ts`（照它的方式在进程内调用流水线）、`docs/reports/T01b-latency.md`
- 说明：评测是演示的"成绩单"，也代替了当初取消的 Jev 中文前置测试。你写过看板，评测成绩卡要读的就是这里的产出。

**要做**

1. `lib/eval/run.ts` + `scripts/eval.ts`（`npm run eval`）：
   - **进程内**调用流水线（和 `scripts/chat-cli.ts` 一样），每条用例处理完调用 `drainBackgroundTasks()`（`lib/brain/background.ts`），再读该轮买家消息对应的**最终** RouteTrace——L1 和风险闸门的最终 trace 是后台写的。
   - 每条用例用**新会话**；`setup.context` 作为请求的 context，`setup.prior` 在同一会话里先依次发送。
   - 重置策略：开始时调用一次 `resetDemoData()`（记得 import `lib/store/reset-hooks`）。如果单次重置 < 10 秒（T05 合并后会这样），改为每条用例前都重置；否则只在开始时重置一次，并在报告里注明。
   - 判定按 `cases.json` 的 `_readme`：layer（字符串或数组）、intent、riskHit（子集）、handoff、tools（子集，仅非 mock 模式检查）。
   - 指标：意图准确率、路由准确率、风险召回率、风险误报率、平均延迟和 p95（按层分开）、总成本；失败用例逐条列出 期望 / 实际 / 原因分类（分类错 / 槽位没补全 / 规则误吞 / 风险漏判 / 依赖 T05）。
   - 并发最多 4，或干脆串行；遇到 429 退避。
2. 结果写 `data/runtime/eval_latest.json`（`EvalReport` 类型，看板会自动显示成绩卡），同时复制一份到 `data/seed/eval_latest.json`；完整报告写 `docs/reports/T06-eval.md`。
3. `GET /api/eval/latest`：读 runtime 文件，没有就返回 `null`。
4. 报告里必须有 **「Jev 中文表现」**一节：L2 用例上的意图准确率；置信度分桶（<0.5 / 0.5–0.7 / 0.7–0.85 / ≥0.85）的数量和准确率；风险各项召回率和误报率；`L2_CONFIDENCE_THRESHOLD` 的建议值（使"被 L2 接下的消息准确率 ≥ 95%"的最低置信度）。若 Jev 意图准确率 < 70%，明确写出，并用 `CLASSIFIER_PROVIDER=llm` 再跑一次做对比。
5. 「规则层做减法」证据：分别在 R007 开启 / 关闭时跑 E58，记录结果差异。
6. `--provider jev|llm|mock`、`--only E01,E02` 两个参数，方便调试。

**目录归属（本任务特批）**：`lib/eval/**`、`scripts/eval.ts`、`app/api/eval/**`、`docs/reports/T06-eval.md`、`data/seed/eval_latest.json`。不要改 `lib/brain/**`；发现流水线的 bug 写到 `docs/questions/`，由 Codex 修。

**验收标准**

- [ ] 真实后端（默认 Jev）下 `npm run eval` 跑完 60 条，生成报告和 `eval_latest.json`，看板评测卡显示真实数字
- [ ] 失败用例逐条有原因分类
- [ ] 「Jev 中文表现」一节齐全，给出阈值建议
- [ ] T05 合并后重跑一次，交接文件里附两次结果的对比
- [ ] 限时 2 小时，够用即可

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

## T16 会话数据层 + 卖家会话 / 规则 / 重置 API — Cursor

- 分支：`t16-conversation-api`
- 依赖：T02（`lib/store` 和规则数据）、T15a
- 必读：`docs/CONTRACTS.md` §2（含「补充约定」）§3 §5 §7、`docs/ARCHITECTURE.md` §4.4 §4.7、`lib/store/index.ts`、`docs/handoff/T02.md`
- 说明：这是你第一次写后端。你在 `lib/mock/` 里已经实现过这些接口的全部行为，这次是把它们搬到服务端、存进 JSON 文件。Codex 的 T04 会直接用你写的数据层，所以**接口要稳、函数命名要清楚**。

**要做**

1. `lib/store/conversations.ts`：会话、消息、RouteTrace 三个集合的类型化读写（基于 `lib/store/index.ts` 的 `readCollection / writeCollection`）。至少提供：`createConversation(buyerId)`、`getConversation(id)`、`updateConversation(id, patch)`、`listConversations({ status?, includeSimulated? })`（排序按 CONTRACTS §3）、`getLatestOpenConversation(buyerId)`、`appendMessages(conversationId, messages)`、`listMessages(conversationId, { after? })`、`appendTrace(trace)`、`listTraces({ conversationId?, since?, includeSimulated? })`。每个函数写一行中文注释。
2. 消息里确认卡片的回填（CONTRACTS §2 补充约定第 2 条）：`listMessages` 返回前，把 `card.kind === "confirm"` 的 `pendingAction` 用 `readCollection("pending_actions")` 里的最新状态替换（pending_actions 由 Codex 的 T03 写入；集合不存在时原样返回）。
3. `lib/store/reset.ts`：`resetDemoData()` = 把 `data/seed/*.json` 复制到 `data/runtime/`、清空进程内缓存，然后依次执行通过 `registerResetHook(name, fn)` 注册的钩子（T03 会注册知识库索引，T17 注册种子流量）。`npm run seed` 也应改为调用它——这一步在 `scripts/seed.ts` 里只改一行调用，属于允许的跨目录改动，交接文件里写明。
4. `lib/rules/suggestion.ts`：按 ARCHITECTURE §4.4 计算 `suggestion`（含「创建满 7 天」口径）。
5. API（都只做参数校验 + 调数据层）：
   - 聊天读取：`GET /api/conversations/:id/messages?after=`、`GET /api/conversations/latest?buyerId=`
   - 卖家会话：CONTRACTS §3 全部（列表、详情、takeover、reply、release、close、traces misfire）；状态流转按 CONTRACTS §2 补充约定第 4 条，release 时清空 `handoffAt`、`unreadForSeller` 和 `state.unresolvedTurns` 归零，并插入对应系统消息。
   - 规则：CONTRACTS §5 全部，`pattern` 非法返回 400。misfire 接口若对应 trace 有 `ruleId`，该规则 `misfireCount++`。
   - 重置：`POST /api/admin/reset` → `resetDemoData()`。
6. `scripts/try-conversation-api.ts`：用 fetch 依次调用以上接口（需要先 `npm run dev`），打印结果，方便人类验证。
7. 把前端 `lib/api-client.ts` 里这些接口的真实路径和你的实现对一遍，有出入以契约为准改一边。

**目录归属（本任务特批）**：`lib/store/conversations.ts`、`lib/store/reset.ts`、`lib/rules/**`、`app/api/conversations/**`、`app/api/rules/**`、`app/api/traces/**`、`app/api/admin/**`、`scripts/try-conversation-api.ts`。其他后端目录不要动。

**验收标准**

- [ ] `npm run typecheck && npm run lint` 通过
- [ ] `scripts/try-conversation-api.ts` 跑通：新建会话 → 追加消息 → takeover → reply → `/messages?after=` 取到卖家消息 → release → close；规则增删改查；R007、R008 `suggestion=delete`；非法正则返回 400；reset 后数据恢复
- [ ] 卖家端在 `NEXT_PUBLIC_USE_MOCK=0` 下能打开会话列表和规则页（会话列表可以是空的，因为聊天接口要等 T04）

---

## T17 种子流量 + 看板 API — Cursor

- 分支：`t17-analytics-api`
- 依赖：T16
- 必读：`docs/ARCHITECTURE.md` §6 §7、`docs/CONTRACTS.md` §6（含「统计口径」七条）、`docs/handoff/T01b.md`（Jev 实测延迟和单价）

**要做**

1. `lib/analytics/gen-traffic.ts` + `scripts/gen-traffic.ts`：ARCHITECTURE §7。生成约 60 个历史会话、约 300 条买家消息及对应 AI 回复和 RouteTrace（全部 `isSimulated: true`），写入 T16 的数据层。消息文本要像真实买家（复用各意图的多种说法）；分布：层级占比约 风险 4% / L1 22% / L2 56% / L3 12% / 人工 6%；延迟 L1 20–50ms、L2 300–600ms（Jev 热状态实测 p50 384ms）、L3 2–7s；成本 L2 按 Jev 实测 $0.000059/条，L3 按 $0.002–0.005/条；约 10 条低置信度样本、约 12 条风险命中；时间分布在 DEMO_NOW 前 7 天，白天多、夜里少。固定随机种子，可复现。通过 `registerResetHook("traffic", …)` 注册到 reset。你在 `lib/mock/traffic.ts` 里写过类似逻辑，可以复用思路。
2. `lib/analytics/routing.ts` + `GET /api/analytics/routing`：严格按 CONTRACTS §6「统计口径」七条聚合；`latestEval` 读 `data/runtime/eval_latest.json`（T06 产出，没有就省略）。
3. 前端看板在 `NEXT_PUBLIC_USE_MOCK=0` 下对接真实接口，核对数字和 mock 口径一致。
4. 新建 `lib/store/reset-hooks.ts`（见 `docs/questions/T16-1.md` 答复）：只含若干 `import "…"` 行，登记所有重置钩子模块（你的种子流量；T03 的知识库索引若已合并也加上）。`app/api/admin/reset/route.ts` 和 `scripts/seed.ts` 改为只 import 这一个文件。验收：网页上点「重置演示数据」后，看板的模拟历史数据会重新生成。

**目录归属（本任务特批）**：`lib/analytics/**`、`app/api/analytics/**`、`scripts/gen-traffic.ts`、`lib/store/reset-hooks.ts`，以及 `scripts/seed.ts` 里的那一行 import。

**验收标准**

- [ ] `npm run seed` 后 `curl localhost:3000/api/analytics/routing?range=7d` 返回非空，各层占比接近上面的分布，没数据的时间格补 0
- [ ] 真实接口下看板页渲染正常，PR 附截图
- [ ] 同一个随机种子跑两次结果一致

---

## T18 演示剧本自动化冒烟测试（Playwright） — Cursor

- 分支：`t18-e2e-demo`
- 依赖：T17
- 必读：`docs/PRD.md` §8、`docs/handoff/T15a.md`（演示指南的实现）
- 背景：后端 T03–T05 还在做，你暂时没有可联调的接口。先把"演示能不能跑通"变成一条命令：以后每合并一个后端任务，跑一次就知道演示有没有被弄坏，T15 联调和最后录演示视频都靠它。

**要做**

1. 加 `@playwright/test`（devDependency），`playwright.config.ts`：只用 Chromium；`webServer` 自动启动 `npm run dev`（已有服务在跑就复用）；失败时保留截图和 trace。
2. `e2e/demo.spec.ts`：按 PRD §8 的 6 步，**通过演示指南入口驱动**（和真人演示走同一条路），每步之前调用 `POST /api/admin/reset`（mock 模式下调用 mock 的重置）。每步的断言：
   1. 售前：出现尺码卡片且推荐 M；有「参考了 N 条资料」。
   2. 售中：出现物流时间线卡片（≥ 3 个节点）。
   3. 售后多步：出现确认卡片；点「确认」后卡片锁定并出现售后单号；出现优惠券卡片且不含过期券。
   4. 高风险：出现转人工提示，顶栏变为「等待人工接入」。
   5. 卖家端（新页面，390×844）：3 秒内会话列表出现红点和横幅；打开会话 → 接管 → 回复；回到买家页，2 秒内收到卖家消息。
   6. 看板：今天总消息数比第 1 步之前增加。
   每步截图存 `e2e/artifacts/<步骤>.png`（目录加进 `.gitignore`）。
3. AI 回复内容不做逐字断言，只断言卡片、徽标、状态这类结构化元素；真实后端下 AI 文案每次都不一样。超时：L1/L2 步骤 10 秒，L3 步骤 30 秒。
4. `package.json` 加 `"e2e": "playwright test"`；README「本地运行」里补一行 `npm run e2e`。
5. 现在用 mock 模式（`NEXT_PUBLIC_USE_MOCK=1`）跑通全部 6 步；真实后端下跑通留给 T15。

**目录归属（本任务特批）**：`e2e/**`、`playwright.config.ts`、`package.json`（devDependency + script）、`.gitignore`（加一行）、`README.md`（加一行）。

**验收标准**

- [ ] mock 模式下 `npm run e2e` 6 步全部通过，交接文件贴运行结果
- [ ] 故意把某一步的断言改错，确认测试会失败并留下截图（证明测试不是摆设），然后改回
- [ ] 限时 2 小时，够用即可

---

## T15 前后端联调 — Cursor

- 分支：`t15-integration`
- 依赖：T05、T05b、T08、T17（都已合并）。如果你开工时还没包含 T05b（转人工摘要改后台生成），rebase 到最新 main 再跑一遍验收。
- 说明：`lib/brain/**` 的 T08 特批已归还 Codex，本任务不改大脑代码。

**要做**

1. 把 `lib/api-client.ts` 的默认值改为「未设置 = 真实后端」（见 `docs/questions/T10-1.md`）。`.env.local` 设 `NEXT_PUBLIC_USE_MOCK=0`，按 PRD §8 演示剧本完整走一遍，修复所有前端问题；后端问题写到 `docs/questions/`（标明用例和复现步骤）。
2. 演示指南每一步点「开始」时**新开一个会话**（前端不带 `conversationId`，后端会新建），避免第 1、2 步的上下文干扰第 3 步的 L3 多步流程（T15a 交接里提到的风险）。
3. 种子流量里 L1 的成本改为和真实 trace 一致：`cost.decideUsd = 0.000059`（后台风险检查费，见 `docs/questions/T04-3.md`），看板 L1 每千条约 ¥0.4。
4. 逐项核对 T12–T15a 交接里列出的「待联调」项（含 `POST /api/admin/reset`）：确认卡片回写、`after` 增量轮询、同一轮共用 traceId、知识库上传字段、试搜请求体、规则 PATCH、看板口径（CONTRACTS §6）。
5. `lib/store/reset.ts` 的保留名单加上 `embedding_cache.json`（和 `eval_latest.json` 一样，见 `docs/questions/T05-1.md`），重置后知识库仍是向量检索而不是 bigram。

**验收标准**

- [ ] 真实后端下 `npm run e2e`（T18）全部通过
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
