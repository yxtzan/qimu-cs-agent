# ARCHITECTURE — 系统架构

> 维护者：Claude（总指挥）。Agent 不得修改。决策理由见 `DECISIONS.md`。

## 1. 总览

```
                 买家消息 (text | quick_action | confirm)
                              │
                 ┌────────────▼────────────┐
                 │ ① 状态更新 updateState   │  上下文注入(orderId/productId) + 正则抽槽位
                 └────────────┬────────────┘
                              │ 会话处于人工模式？──是──► 转发给卖家，不自动回复
                              ▼
        ┌─────────────────────┴──────────────────────┐   并行
        ▼                                             ▼
 ② 一次 decide() 调用（Jev / LLM / mock）        ③ L1 规则匹配
    · 风险 Noul ×4 + 情绪 Score                     · 快捷按钮 payload（100% 确定）
    · 意图 Choice（20 类）                          · 关键词/正则（短句才生效）
    · 多诉求 Noul
        │                                             │
        └──────────────────┬──────────────────────────┘
                           ▼
              ④a 硬关键词风险检查（同步、毫秒级）──命中──► 转人工
                           ▼
              ⑤ L1 命中？──是──► 立即 handler[意图] 回复；decide() 后台继续，
                           │          模型风险分超阈值 → 追加一条转人工
                           │ 否（等 decide() 返回）
                           ▼
              ④b 模型风险闸门 ──命中──► 转人工（附原因）
                           │ 未命中
                           ▼
              ⑥ L2：置信度 ≥ T 且非多诉求？──是──► handler[意图]（可内部调 RAG+LLM 生成）
                           │ 否
                           ▼
              ⑦ L3：LLM function calling 多步编排（最多 6 步）
                           │ 失败 / 连续 2 轮未解决
                           ▼
                        转人工
                           │
              ⑧ 每条消息写一条 RouteTrace（层、意图、置信度、延迟、成本、工具调用）
```

**关键设计**：风险检测和 L2 意图分类在**同一次** `decide()` 调用里完成（Jev 支持一次请求问多个问题），与 L1 规则匹配并行执行。风险闸门分两段：**硬关键词同步检查**覆盖所有消息且不增加延迟；**模型风险分**对 L1 命中的消息异步生效（先回复、后追加转人工），对 L1 未命中的消息同步生效。这样 L1 保持毫秒级，风险检查也不漏（2026-10-04 修订，原因见 D001、D010）。

## 2. 代码结构

```
app/
  (shop)/                 买家端页面（Cursor）
  seller/                 卖家端页面（Cursor）
  api/                    HTTP 接口（Codex），只做参数校验和调用 lib，不写业务逻辑
lib/
  types.ts                契约类型（Claude）
  demo-clock.ts           DEMO_NOW
  api-client.ts           前端调用封装（Cursor）
  store/                  数据层：读写 JSON（Codex）
  llm/
    openrouter.ts         chat completions / embeddings / decisions 三个底层调用
    cost.ts               美元成本 → 人民币显示
  brain/
    pipeline.ts           handleMessage() 主流程（上图 ①–⑧）
    state.ts              updateState / serializeStateForModel
    slots.ts              正则抽取：订单号、身高、体重、尺码、颜色
    decide/
      index.ts            decide() 统一入口，按 CLASSIFIER_PROVIDER 分发
      jev.ts              Jev 实现
      llm.ts              LLM 结构化输出实现
      mock.ts             关键词实现（无 key 可用）
      questions.ts        意图表、风险问题的中文描述（三种实现共用）
    risk.ts               风险判定（分数阈值 ∪ 硬关键词）
    rules.ts              L1 规则匹配 + 命中计数
    handlers/             每个意图一个 handler
    agent.ts              L3 agent 循环
    handoff.ts            转人工
    trace.ts              RouteTrace 记录
  tools/                  工具注册表 + 每个工具实现（Codex）
  rag/                    分块、向量化、检索（Codex）
data/
  seed/                   种子数据（提交到 git）
  runtime/                运行时数据（gitignore）
  eval/                   评测集
scripts/
  seed.ts  eval.ts  try-decide.ts  gen-traffic.ts
```

## 3. 对话状态 DialogState

完整类型见 `CONTRACTS.md`。要点：

| 字段 | 作用 | 例子 |
|---|---|---|
| `currentTask` | 正在办的事 | `{intent:"exchange", status:"collecting"}` |
| `slots` | 已填槽位 | `{orderId:"QM2026092801", size:"L"}` |
| `history` | 最近 10 条动作 | `[{type:"tool_call", name:"apply_refund", summary:"已为订单…提交退款"}]` |
| `pendingActionId` | 等待买家确认的写操作 | |
| `unresolvedTurns` | 连续未解决轮数，≥2 转人工 | |
| `riskFlags` | 本会话累计的风险标签 | `["health_safety"]` |

### 3.1 状态更新顺序（`updateState`）

1. 前端传来的 `context.orderId / productId` → 直接写入 `slots`（最高优先级）
2. 正则从消息里抽取（`slots.ts`）：
   - 订单号 `QM\d{10}`
   - 身高 `(1[4-9]\d)\s*(cm|厘米|公分)?`；体重 `(\d{2,3})\s*(kg|公斤|千克|斤)`（**斤要 ÷2**）
   - 尺码 `\b(XS|S|M|L|XL|XXL)\b` 或 `(小|中|大|加大)码`
   - 颜色：与商品颜色表匹配
3. `turnCount += 1`

### 3.2 喂给模型的状态（`serializeStateForModel`）

只放模型判断需要的东西，控制在 ~400 token：

```json
{
  "最近对话": ["买家：我上周买的外套", "客服：找到订单 QM2026092801（燕麦色羊毛大衣）", "买家：退款到哪了"],
  "当前任务": "无",
  "已知信息": {"订单": "QM2026092801，已签收，售后中：退款审核中"},
  "最近动作": ["查询订单 QM2026092801"],
  "新消息": "退款到哪了"
}
```

这就是"退款到哪了"能被理解的原因：**不是模型聪明，是状态里已经有了订单和售后信息。**

## 4. 理解层详解

### 4.1 意图表（20 类，`questions.ts`）

`criteria` 的中文描述会原样发给 Jev / LLM，描述要互斥、具体。

| 阶段 | intent id | 中文描述（即 criteria） | 必需槽位 |
|---|---|---|---|
| 售前 | `product_consult` | 询问商品的材质、版型、颜色、细节、洗护、是否适合某场合 | productId（缺则问或用 RAG 泛答） |
| 售前 | `size_recommend` | 询问该穿什么尺码，常给出身高体重 | heightCm, weightKg |
| 售前 | `stock_check` | 询问某款某码某色是否有货、何时补货 | productId |
| 售前 | `promotion` | 询问优惠、折扣、优惠券、满减、会员价 | — |
| 售前 | `shipping_policy` | 下单前询问发货时间、快递公司、运费、配送范围 | — |
| 售中 | `order_status` | 询问订单当前状态、是否付款成功、订单详情 | orderId |
| 售中 | `logistics_track` | 询问包裹到哪了、物流进度、何时送达 | orderId |
| 售中 | `urge_shipping` | 催促尽快发货 | orderId |
| 售中 | `modify_order` | 修改收货地址、电话或未发货订单的规格 | orderId, address? |
| 售中 | `cancel_order` | 想取消尚未发货的订单 | orderId |
| 售后 | `refund_apply` | 想申请退款或退货退款 | orderId, reason? |
| 售后 | `refund_progress` | 询问退款/退货处理到哪一步、钱何时到账 | orderId |
| 售后 | `exchange` | 想换尺码或换颜色 | orderId, size/color |
| 售后 | `quality_issue` | 反映收到的商品有质量问题：破损、色差、起球、开线、异味 | orderId |
| 售后 | `return_policy` | 询问退换货规则、期限、运费谁出 | — |
| 售后 | `invoice` | 询问或申请发票 | orderId? |
| 其他 | `human_request` | 明确要求人工客服 | — |
| 其他 | `greeting` | 打招呼、感谢、结束语，没有具体诉求 | — |
| 其他 | `multi_step_complex` | 一句话里有多个诉求，或需要多步查询/操作才能完成 | — |
| 其他 | `other` | 与本店购物无关或无法判断 | — |

### 4.2 风险问题（风险闸门）

| key | 类型 | 问题（instructions） | 阈值 |
|---|---|---|---|
| `legal_threat` | noul | 买家是否威胁向监管部门（如 12315、消协）投诉、起诉、找律师，或曝光到媒体/社交平台？ | ≥ 0.70 转人工 |
| `health_safety` | noul | 买家是否提到商品造成身体伤害、过敏、皮肤问题、受伤或其他安全隐患？ | ≥ 0.70 转人工 |
| `fraud_security` | noul | 是否涉及账号被盗、被诈骗、可疑链接、有人冒充客服，或被要求线下转账？ | ≥ 0.70 转人工 |
| `abuse_extreme` | noul | 消息是否包含辱骂、人身攻击或极端情绪？ | ≥ 0.80 转人工 |
| `emotion` | score | 买家情绪激烈程度：`["平静","有些不满","明显生气","非常愤怒"]` | score ≥ 2.5 转人工 |

- 介于 0.5 与阈值之间：会话打上黄色风险标签（卖家端可见），AI 继续服务但用安抚语气。
- **硬关键词兜底**（不依赖模型，`risk.ts`）：`12315|消协|起诉|律师|报警|曝光|过敏|起疹|红疹|受伤|盗号|被骗|诈骗`，命中即视为对应风险 = 1.0。模型和关键词取并集——高风险宁可多转。

### 4.3 decide() 的三种实现

统一签名（见 CONTRACTS `DecideResult`）。一次调用同时返回：意图、多诉求概率、4 个风险分、情绪分。

**Jev（`CLASSIFIER_PROVIDER=jev`）** — `POST https://openrouter.ai/api/alpha/decisions`

```json
{
  "model": "typesafe/jev-1.13",
  "state": { "...serializeStateForModel 的结果..." },
  "questions": {
    "intent": {
      "type": "choice",
      "instructions": "买家这条新消息的主要意图是什么？结合最近对话和已知信息判断。",
      "criteria": { "product_consult": "询问商品的材质…", "...": "…20 项…" }
    },
    "multi_step": {
      "type": "noul",
      "instructions": "这条新消息是否包含两个及以上不同诉求，或需要多步查询/操作才能完成？",
      "criteria": { "true": "多个诉求或多步", "false": "单一诉求" }
    },
    "legal_threat": { "type": "noul", "instructions": "…", "criteria": { "true": "…", "false": "…" } },
    "health_safety": { "type": "noul", "...": "…" },
    "fraud_security": { "type": "noul", "...": "…" },
    "abuse_extreme": { "type": "noul", "...": "…" },
    "emotion": {
      "type": "score",
      "instructions": "评估买家在新消息中的情绪激烈程度。",
      "criteria": ["平静", "有些不满", "明显生气", "非常愤怒"]
    }
  }
}
```

> ⚠️ 以上请求格式来自公开资料整理，实现时**以 OpenRouter Decisions API 官方文档和实际返回为准**（https://openrouter.ai/docs/guides/community/jev），差异记入交接文件。返回中 choice 的字段为 `choice / probabilities / confidence`，score 为 `score / probabilities / confidence`，noul 为 `noul`（0–1），成本在 `usage.cost`（美元）。
> 已知限制：英文为主（中文效果未经前置测试，由 T06 评测衡量）、纯文本、32k 上下文、Choice 最多 255 个选项、同一输入多次调用概率会有轻微波动。

**LLM（`CLASSIFIER_PROVIDER=llm`）** — 用 `CLASSIFIER_LLM_MODEL` 做一次 JSON 结构化输出，返回同样字段。注意：LLM 自报的置信度**未经校准**，阈值需要单独调。

**mock（`CLASSIFIER_PROVIDER=mock`）** — 关键词表打分，置信度按命中强度给 0.55–0.95。用于无 key 开发和前端联调。

**默认用 Jev**（团队决定，不做前置中文测试，见 D004）：

- L2 意图分类和风险闸门都用 Jev，`CLASSIFIER_PROVIDER=jev`。
- **运行时降级链**：Jev 超时 / 报错 / 限流 → LLM → mock，每次调用独立降级，trace 里记录实际生效的 provider。
- 中文效果没有前置验证，靠三道保险兜住：① 置信度低于阈值的消息自动掉到 L3（漏斗本身就是兜底）；② 风险闸门有硬关键词兜底（§4.2）；③ T06 端到端评测会给出 Jev 的中文准确率和置信度分布，据此调阈值，必要时切换到 LLM。
- 初始阈值 `L2_CONFIDENCE_THRESHOLD=0.70`，T06 后按"被 L2 接下的消息准确率 ≥ 95%"重新选定。
- **延迟与配置（T01b 实测，见 D010）**：意图 + 风险合并为一次 Jev 请求，热状态 p50 约 0.4 秒；冷启动约 6 秒，所以服务启动时预热、运行中每 `JEV_KEEPALIVE_MS`（默认 4 分钟）保温一次。Jev 单次尝试超时 3 秒，`decide()` 总预算 `DECIDE_BUDGET_MS`=9 秒。兜底分类模型 `deepseek/deepseek-v4-flash`，所有 LLM 默认关闭思考（`LLM_REASONING=off`）。

（已否决方案：先翻译成英文再给 Jev —— 多一次 LLM 调用，违背"这一层不上大模型"的初衷。）

### 4.4 L1 规则层

准入标准：**高频、表达固定、无歧义**。规则存在 `data/seed/rules.json`，卖家端可开关。

- 快捷按钮 payload（`action.type = "quick_action"`）：100% 命中，置信度 1.0。
- 关键词/正则规则带 `maxLen`（默认 12 个字）：「到哪了」命中物流；「到哪了，另外我想退另一件」超长 → 不走 L1，交给 L2/L3。**这就是"做减法"：宁可漏给下一层，也不要误吞。**
- 每次命中 `hitCount++`；误判计数 `misfireCount++` 的条件：L1 处理后买家下一条消息被识别为否定反馈（「不是」「不对」「答非所问」「我问的是」），或卖家在会话详情里手动标记误判（P1）。
- 卖家端「建议删除」：`hitCount ≥ 5 且 misfireCount / hitCount ≥ 30%`，或「`createdAt` 已满 7 天且近 7 天没有命中（`lastHitAt` 为空或早于 7 天前）」。另有 `review` 档：`hitCount ≥ 5 且误判率 ≥ 15%`（未到 30%），卖家端显示「建议复查」。创建不满 7 天的新规则一律 `keep`。理由文案由前端用 `hitCount / misfireCount / lastHitAt` 拼，后端只返回 `suggestion`。

### 4.5 handler（执行层）

每个意图一个 handler：`(ctx: HandlerContext) => Promise<HandlerResult>`。共同模式：

1. 检查必需槽位 → 缺失时**按优先级补全**：状态里已有 → 买家只有一个符合条件的订单则自动选中 → 多个则返回「选项卡片」让买家选 → 都没有则追问。
2. 调工具拿数据（只读工具直接执行；写工具生成 `PendingAction` + 确认卡片）。
3. 组织回复：结构化数据用卡片 + 模板文案；咨询类用 RAG + LLM 生成。

各 handler 要点：

| intent | 做法 |
|---|---|
| `size_recommend` | **确定性计算**：按尺码表（`data/seed/size_chart.json`）用身高体重查，不让模型算。有 productId 时用该商品版型修正（宽松款可小一码）。 |
| `product_consult` / `return_policy` / `shipping_policy` / `invoice` | RAG 检索 top-4 分块（有 productId 时把商品资料一起放入）→ `GENERATION_MODEL` 生成，必须基于资料回答并标注来源；资料里没有就说不确定并提供转人工。mock 模式直接返回最相关分块摘要。 |
| `logistics_track` / `order_status` | 工具查询 → 物流卡片 / 订单卡片 + 一句话总结。 |
| `refund_apply` / `exchange` / `modify_order` / `cancel_order` | 校验业务规则（见 DATA_SPEC §6）→ 生成 PendingAction + 确认卡片；不满足规则时解释原因。 |
| `refund_progress` | 查售后单 → 进度时间线卡片。 |
| `quality_issue` | 致歉 + 说明处理流程（RAG）+ 引导申请退换；同时会话打 `quality` 标签。 |
| `urge_shipping` | 查订单，未发货则给出预计发货时间并记录催单（history），已发货则转物流。 |
| `promotion` | 工具查买家可用券 + RAG 活动说明。 |
| `human_request` | 直接转人工。 |
| `greeting` | 模板回复。 |
| `other` | 礼貌说明能力范围 + 快捷按钮。 |

### 4.6 L3 大模型层（`agent.ts`）

- 模型：`AGENT_MODEL`（OpenRouter，需支持 function calling 且中文好）。
- 输入：系统提示（店铺身份、服务原则、写操作必须确认、不确定就转人工）+ 序列化状态 + 最近 6 轮对话 + 工具列表。
- 循环：最多 6 次工具调用；总超时 20s。
- 写工具在 L3 中同样只生成 PendingAction，模型最终回复会附上确认卡片。
- 失败（超时 / 报错 / 模型调用 `create_handoff`）→ 转人工，原因 `l3_failed` 或模型给出的原因。
- 示例：「上周买的那件外套换成 L，顺便看看有没有券」→ `list_orders` → `get_order` → `check_stock(L)` → `request_exchange`（生成确认卡）→ `list_coupons` → 汇总回复。

### 4.7 转人工（`handoff.ts`）

触发条件：风险闸门命中 / `human_request` / L3 失败 / `unresolvedTurns ≥ 2` / handler 主动要求（如质量问题金额 > ¥500）。

动作：会话 `mode = "human"`、`status = "waiting_human"`、记录 `handoffReason` 和 AI 生成的**一句话摘要**（mock 模式用模板拼接）→ 买家端收到系统消息 → 卖家端会话列表出现红点。

## 5. RAG（`lib/rag`）

- 来源：`data/seed/kb/*.md`（初始知识库）+ 卖家端导入的文档。
- 分块：按 Markdown 标题切，再按 ~300 字切，重叠 50 字；每块保留 `docTitle` 和 `heading`。
- 向量：`EMBEDDING_MODEL`（OpenRouter embeddings 接口）。向量存在 `data/runtime/kb_index.json`。
- 检索：余弦相似度 top-k（默认 4），低于 `RAG_MIN_SCORE` 的丢弃。
- mock / 无 key：字符二元组（bigram）重叠打分，中文效果够用。
- `npm run seed` 时为初始知识库建索引（有 key 用向量，无 key 用 bigram）。

## 6. 成本与延迟统计

- 每次模型调用记录 `latencyMs`、`costUsd`（OpenRouter 返回的 `usage.cost`；没有就按 token × 单价估算并标记 `estimated`）。
- 显示时乘以 `USD_TO_CNY`（默认 7.1）。
- RouteTrace 里分开记：理解成本（decide）、生成成本（handler 里的 LLM）、agent 成本（L3）。看板的"每千条成本"就从这里算。

## 7. 种子流量

`scripts/gen-traffic.ts` 生成约 300 条历史消息的会话和 RouteTrace（时间分布在 DEMO_NOW 前 7 天，层级占比大致 风险 4% / L1 22% / L2 56% / L3 12% / 人工 6%）。这些数据是**虚构的统计样本**，让看板打开就有内容；演示时新产生的真实 trace 会叠加上去。看板上用小字标明「含模拟历史数据」。

## 8. 环境变量（`.env.example`）

| 变量 | 默认 | 说明 |
|---|---|---|
| `OPENROUTER_API_KEY` | — | 必填（mock 模式可空） |
| `CLASSIFIER_PROVIDER` | `jev` | `jev` / `llm` / `mock`；无 key 时自动用 mock |
| `JEV_MODEL` | `typesafe/jev-1.13` | |
| `CLASSIFIER_LLM_MODEL` | — | 选一个便宜、中文好、支持 JSON 输出的模型 |
| `GENERATION_MODEL` | — | handler 生成回复用 |
| `AGENT_MODEL` | — | L3 用，需支持 function calling |
| `EMBEDDING_MODEL` | — | OpenRouter embeddings 支持的多语言模型 |
| `L2_CONFIDENCE_THRESHOLD` | `0.70` | |
| `RAG_MIN_SCORE` | `0.35` | |
| `USD_TO_CNY` | `7.1` | |
| `NEXT_PUBLIC_USE_MOCK` | `0` | 前端用本地 mock 数据，不请求后端 |

模型 ID 由 Codex 在 T00 时到 openrouter.ai/models 查当前可用、性价比高的（优先 DeepSeek / Qwen 系列），写入 `.env.example` 并在交接文件里说明选择理由。
