# T03 验证记录 — 2026-10-04

## 工具和写操作

- `npx tsx scripts/try-tools.ts` 实际运行通过，全部 15 个工具都有输出；默认使用临时副本，不污染运行数据。
- B001 / QM2026092801 / 燕麦色 L：生成 PendingAction，订单不变，库存仍为 3；确认后新增 exchange 售后及 pending_review 时间线，库存 3 → 2。
- 炭灰 L 返回 `{ ok:false, reason:"缺货，预计 10-12 补货" }`。
- B003 / QM2026100401 改地址成功生成 PendingAction；B003 访问 QM2026092801 被拒绝。
- 重复确认无重复售后；取消不改订单/库存；归属、会话、订单状态、库存和期限均在确认时再次校验。
- `scripts/check-tools.ts`：7/15 天含边界、质量金额 >500 转人工、照片待审核、已发货仅退款拒绝、已洗无理由拒绝、同进程并发确认、部分退款后取消不重复退、折扣余分分配均通过。
- `node --import tsx --test lib/tools/recommend-size.test.ts`：6 个测试通过，覆盖两个基础例子、斤换算、取较大码、宽松/修身版型、小数区间、表格外和非法值。

## bigram（无 key / mock）

- `OPENROUTER_API_KEY= CLASSIFIER_PROVIDER=mock npm run seed`：10 篇全部 bigram，check-seed 全部通过。
- `node --import tsx scripts/check-kb-api.ts http://localhost:3001 bigram`：五个知识库 API 通过，JSON / .md / .txt 导入即检索；分块、删除、400/404/413、页面 200 通过。
- `POST /api/kb/search {"query":"真丝怎么洗"}`：首条 `洗护指南 / 真丝`，score **0.5**。
- `scripts/check-rag.ts`：300 字分块和 50 字重叠、章节保留、落盘重读、并发导入/删除、不相关查询空数组通过。

## 真实 OpenRouter embedding

只读取用户指定的桌面原目录 `.env.local`，没有复制、输出或提交密钥。模型从环境读取为 `qwen/qwen3-embedding-8b`。

- 最终索引策略：每批最多 64 分块，**30 秒超时、失败重试 1 次**；在线查询保持 8 秒。最终真实索引 **10 篇 / 49 分块：49 个向量、0 个 bigram 回退**。无 key 对照为 **0 个向量、49 个 bigram**。
- 最终一轮普通 seed 实测总索引处理时间 25281ms，OpenRouter 报告费用 $0.00005521，所有文档成功、estimated=false。费用随 provider 可能变化，以实际 usage.cost 为准。超时无返回时的费用只能记录为估计，不能据此断言未计费。
- 真实 HTTP 验证：`POST /api/kb/search` 首条 `洗护指南 / 真丝`，score **0.6152292680820556**；服务日志 mode=mixed（9 篇余弦检索 + 1 篇 bigram），查询 **6646ms**，报告费用 **$0.00000005**，estimated=false。
- 真实 HTTP 下 JSON/.md/.txt 导入、分块、删除和错误契约也通过；一次 txt 导入超时后降到 bigram，仍完成导入。测试文档最终全部删除。
- `scripts/check-rag-live.ts` 在临时副本保留最终的 10 篇向量文档，单独验证纯向量排序。最终一轮首次查询成功：mode=embedding，首条 `洗护指南 / 真丝`，score **0.6165983638775019**，**6570ms**，费用 **$0.00000005**，estimated=false。早期测试存在两次查询均超时，之后重试成功的情况，如实保留此限制：在线外部延迟波动较大，8 秒降级有必要。
- `scripts/check-rag.ts` 另用明确标记的模拟响应验证索引 30 秒且恰好重试一次、查询 8 秒、向量排序/维度/响应乱序/成本、保留原索引模型、失去 key 或网络失败自动退到 bigram；这些模拟测试不当作真实模型质量证据。

## T16 接口和构建

- 同步 `e9a69e5`（T16 / T17 已合并）的 main 后，采用 `registerResetHook("kb-index", …)`，共用登记表只新增一行 import。CLI seed 和网页 reset 由 T17 统一引用登记表，本 PR 没有修改两个入口。
- 临时副本中：T16 `listMessages` 返回确认卡片时回填 cancelled 最新状态；T16 reset + 登记表重新生成 10 篇索引，清空上传文档和 pending_actions。
- 同步 T17 后无 key 服务冷启动，第一条 HTTP 请求直接 `POST /api/admin/reset` → 200 `{ok:true}`；未先访问 KB，磁盘已存在 10 篇/49 分块 bigram 索引，pending_actions 为 0，证明网页重置入口主动执行钩子。
- `npm run typecheck`、`npm run lint`、`npm run build` 通过。
- 最初受沙箱端口限制的 Turbopack 构建失败；清理本 worktree 的生成缓存后在允许本地子进程端口的执行环境成功构建，未改构建配置或前端。
- T03-3 的接线问题已通过同步 T17 解决；reset 直接执行已登记的 kb-index 钩子，知识库缺失索引时仍保留自动重建兜底。
