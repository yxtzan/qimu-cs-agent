# T05 验收记录

最终配置：AGENT_MODEL=qwen/qwen3.7-flash，AGENT_REASONING=off，默认Jev分类（真实失败时沿用T01降级链），NEXT_PUBLIC_USE_MOCK=0。

- 两条真实隔离验收：T05-live.json，整轮均值10,918ms，Agent均值5,688.5ms，agent均价$0.00011226，总均价$0.000144537。
- 实际CLI：T05-cli.txt，L3，总13,953ms，Agent4,959ms，agent费用$0.000158606；分类器预算用尽后mock降级，费用如实标estimated，不代表本轮LLM是mock。
- 实际HTTP：T05-http.json，第3步短话术+订单上下文，总18,499ms，Agent9,510ms，agent费用$0.00021413，confirm+2张有效券。
- HTTP人工闭环：待人工置顶/handoffAt、人工消息未读+1、reply自动接管、after增量收到、release恢复AI、非法规则正则400全部PASS；最后重置66ms。
- 49向量首次建成缓存，新进程第二次npm run seed real0.38秒；内容变化仅请求未命中，模型变化失效；fixture重置0次embedding。
- typecheck、lint、diff --check、12个现有单测、工具和RAG回归、Agent安全及缓存自测全部PASS。

完整真实E2E原输出：

```text
[e2e] 第1步之前 今天总消息数 = 32
✓ 1 售前：尺码卡片推荐 M + 引用资料 (11.1s)
✓ 2 售中：物流时间线卡片（≥3个节点） (1.1s)
✓ 3 售后多步：确认卡片 → 确认 → 售后单号 + 优惠券（无过期券） (23.6s)
✓ 4 高风险：转人工提示 + 顶栏「等待人工接入」 (3.7s)
✓ 5 卖家端：红点 + 横幅 → 接管 → 回复 → 买家2秒内收到 (3.8s)
[e2e] 现在 今天总消息数 = 33（第1步之前32）
✓ 6 看板：今天总消息数比第1步之前增加 (234ms)
6 passed (44.7s)
```

命令：E2E_PORT=3001 NEXT_PUBLIC_USE_MOCK=0 npm run e2e。原版第3步30秒上限、全部断言均未修改。E2E第5步的轮询断言实际沿用T18的4秒余量；第5、6步不reset也沿用T18，详见其交接。截图为本次真实服务，见T05-screenshots/。

开发时Pro与Flash有多次超时，早期第3步失败；Qwen初次浏览器短话术也发生过工具路径不匹配。最终修复并完整通过，没有修改测试凑通过。详情、模型选择及系统提示词全文见../handoff/T05.md。

合入最新main=33fda33（T06及Claude审查）后再次验证：typecheck/lint/diff检查全部通过；完整真实E2E **6 passed (44.4s)**（第3步24.6秒、第5步2.1秒、看板32→33）。公共类型、规格、Cursor接口/前端与origin/main逐字一致。
