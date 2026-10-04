# T04 大脑流水线验证 — 2026-10-04

本任务默认 Jev、L2 阈值 0.70。真实模型调用使用已存在的本地环境文件，未输出或提交密钥。CLI 和 HTTP 验证中的所有订单、地址均是项目虚构数据。

## 核心验收对话

以下摘要来自实际 `scripts/chat-cli.ts` 运行（`OPENROUTER_API_KEY='' CLASSIFIER_PROVIDER=mock node --import tsx scripts/chat-cli.ts …`）。自动化隔离数据的完整消息、卡片和最终 trace 另存于 `T04-mock-transcript.json`；真实调用记录在 `T04-live-transcript.json`。

| 买家 / 输入 | 实际结果 |
|---|---|
| B001「到哪了」 | L1 / R002；QM2026100201 物流卡片；顺丰，5 个节点，预计 10-06 送达 |
| B001，productId=P002，「我160 50公斤穿什么码」 | L2 / size_recommend；M；身高体重确定性计算；sources 卡片 |
| B001「我九月中旬买的碎花裙」→「退款到哪了」 | 首轮已记住 QM2026091501（回复为 L3 占位）；次轮 L1 / R003，AS20260920001，退款中，1–3 工作日原路退回 |
| B001，orderId=QM2026092801，「能换L吗」 | L2 / exchange；确认卡片 PA-53425120-a6da-4c2b-b045-e826e17dff97；确认前订单未改 |
| 同会话 `/confirm PA-53425120-a6da-4c2b-b045-e826e17dff97` | action；生成 AS-53425120-a6da-4c2b-b045-e826e17dff97 换货售后；目标燕麦色 L；GET 订单和 GET 消息确认实际写入及卡片 confirmed |
| B002「穿了全身起红疹 不处理就去12315」 | risk_gate；legal_threat=1、health_safety=1；waiting_human、mode=human、handoffAt、红点 |
| B001「退款进度 再拖我就找律师」 | risk_gate；legal_threat=1；没有执行退款进度 handler；waiting_human |

上述 CLI 的即时路由时间约 2–23ms（本地 mock）；不代表真实模型性能。

## 真实分类器 / 生成

`node --import tsx scripts/check-pipeline.ts --live --report` 完整通过，脚本使用临时数据目录，不修改当前演示订单。真实段中 Jev、LLM、mock 降级都实际出现，未将降级结果冒充 Jev 成功。

本次记录：尺码问题 Jev约2.3秒，换货 Jev约2.3秒，取消订单 Jev约0.39秒，尺码加洗护 Jev+生成约3.9秒。冷调用/供应商波动时 Jev和LLM可能共享预算耗尽，约9秒降级mock。L1即时回复几毫秒，旁路分类最迟随后完成；trace中分开记录即时 totalMs 和旁路 decideMs。真实逐轮费用见 JSON 的 cost 字段。

尺码加洗护限定组合说明见 T04-1；后台trace最终落盘说明见 T04-2；L1旁路模型成本说明见 T04-3。未改公共类型、契约、任务卡、前端或 Cursor 数据层。

## 浏览器 E2E（真实后端）

先执行 `npx playwright install chromium`，成功安装 Chromium 1243。

1. 首轮 `NEXT_PUBLIC_USE_MOCK=0 npm run e2e`：第1步失败；冷分类降级 + embedding + 生成合计约10.6秒，超过原10秒断言。已修复：咨询整轮预算9秒，embedding最多2秒，生成只用剩余预算；预算不足使用已有资料模板并保留来源。没有改 E2E 断言或超时。
2. 修复后同一完整命令：第1、2步通过，第3步按 T04 规格返回 L3 占位，缺确认卡片而失败；串行模式跳过4、5、6。结果：**2 passed，1 failed，3 did not run**。第3步属于 T05，不声称全6步通过。
3. `NEXT_PUBLIC_USE_MOCK=0 npm run e2e -- --grep '1 售前|2 售中|4 高风险'`：**3 passed (2.6m)**。第1步 M + sources、第2步物流≥3节点、第4步转人工状态和顶栏全部通过。

每步时间包括 `POST /api/admin/reset` 重建10篇向量索引（实测约40–70秒）；这不是消息响应延迟。成功截图见 `T04-screenshots/1-presale.png`、`2-insale.png`、`4-risk-handoff.png`。失败截图和 Playwright trace 保留在 gitignored `e2e/artifacts/`；HTML报告在 `e2e/report/`。

## 自动化与 HTTP 检查

- `npm ci`：成功，无新增依赖。
- `npm run typecheck && npm run lint`：通过，0错误、0警告。
- `node --import tsx --test lib/brain/slots.test.ts lib/brain/risk.test.ts`：6/6通过；订单号、公斤/斤/小数、中文大码、字母尺码、电话排除、显式地址、硬关键词并集和模型阈值边界。
- `node --import tsx scripts/check-pipeline.ts --report`：无key全部通过；含核心验收、多订单选项补槽、选项标签、取消不改订单、重复确认、刷新回填、每轮共用traceId、每条买家消息一条trace。
- 延迟分类器控制流夹具：分类器未返回前 L1 已返回；模型风险随后追加系统消息，只存一条 risk_gate trace；重置后不回写旧结果；分类等待期间卖家接管后不再自动回复。
- 预算夹具：预算耗尽时咨询不调用网络，继续按资料回答并保留来源。夹具结果用于证明程序流程，不代表真实模型准确率。
- `node --import tsx --test lib/tools/recommend-size.test.ts`：6/6通过。
- `node --import tsx scripts/check-tools.ts`：确认校验、并发库存、期限边界、越权及幂等全部通过。
- `node --import tsx scripts/check-rag.ts`：索引30秒+重试1次；在线query2秒；embedding/bigram降级和成本记录通过。
- 真实 HTTP：非法 JSON 400；缺 buyerId 400；未知买家404；跨买家订单上下文403；非法快捷动作400；聊天200、L1/R002/QM2026100201物流卡片；确认后订单新售后和消息卡片 confirmed 可读。
- `git diff --check`：通过；`.env.local` 被 gitignore。
