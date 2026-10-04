# T09 验证记录

所有结果均为实际运行；模型读环境变量。真实验收使用 `CLASSIFIER_PROVIDER=jev`、`AGENT_MODEL=qwen/qwen3.7-flash`、`AGENT_REASONING=off`。无新增依赖，未修改评测集、公共契约、前端、TASKS 或 seed/eval_latest.json。`.env.local` 未打印、未提交。

## 验收记录

- ✅ `npm run typecheck`、`npm run lint`，44/44 brain/tools 测试通过；`check-pipeline.ts`、`check-agent.ts`、`check-t05b-handoff.ts` 通过。
- ✅ E38 单独真实评测连跑3次，全部通过且不进风险闸门。
- ✅ 两条购买前/职业咨询不转人工；三条真实威胁/不适仍转人工，Jev 分数见下表。
- ✅ 恰好3次全量：55/60、55/60、56/60；三次风险召回100%，宽口径误报0。和 T05b 的60条对比见 `T09-comparison.md`。
- ✅ 人为将 Jev 超时设为1ms，随后正常 LLM 兜底；带12315原句在2521ms内返回转人工。trace 保留风险关键词裁决、缺 decideProvider、标注超时；晚到分类仅原地补费用，不改裁决、不重复计 trace。
- ✅ 最终 `npm run eval -- --only E39,E50,E53,E56,E57` 5/5。该子集没有风险正例，命令显示的“风险召回0%”不代表全量召回下降。
- ✅ 真实后端 E2E 六步通过；没有修改前端或放宽浏览器断言。
- ✅ 限时2.5小时内交付（开工约13:40，实际完成时间见交接）。

**全量报告的范围**：第三次全量在最后的 L3 原文核对与收尾修订之前运行。风险问法、关键词等待、黄标、结构化错误的实现已经在三次全量中覆盖；后来新增的退款原因来源检查、券报价证据和订单状态回复边界使用定向与回归测试验证。没有第四次全量，也没有将定向成功回填为全量成功。`T09-eval.md/.json` 是当时的真实56/60快照，不能当成最后提交完整60条都重新跑过。

## 风险原句（未使用例外词表、未调阈值）

| 原句 | Jev legal | Jev health | Jev emotion | 实际结果 |
|---|---:|---:|---:|---|
| 这件是防过敏面料吗 | 0.01 | 0.02 | 0.00 | L2，不转人工 |
| 我闺蜜是律师，她说这件挺好看 | 0.02 | 0.01 | 0.00 | L2，不转人工 |
| 穿了全身起红疹 不处理就去12315 | 0.98 | 0.98 | 2.76 | risk_gate，转人工 |
| 穿了一天脖子痒得睡不着 | 0.01 | 0.96 | 1.19 | risk_gate，转人工 |
| 我要让所有人都知道你们家东西什么质量 | 0.60 | 0.05 | 2.63 | risk_gate，转人工 |

原始分数见 `T09-risk-live.json`；riskHit 可能因硬关键词提升至1，表里保留模型原分数。公开质量威胁 legal=0.60 处于黄区，但 emotion=2.63 达转人工线。Q1（B001/P013）、Q2 只留转人工按钮，没有关键词降级安抚语。模型自己的黄标与混合黄标有独立测试。

## 五条原文与来源

以下各条为对应原始文件中的真实回复，不做改写。五条批量采样在 `T09-l3-final.json`；E53 在最后增加“只答原诉求、不追加功能提议”后独立复验，使用更晚的 `T09-E53-final.json`。所有开发期间未过的采样另保留，没有将它们改判成成功。E50 批量采样走L2；最终真实 **直接L3** 验证另见 `T09-E50-agent-final.json`，不计入评测分数。

### E39

- 层级：L3；分类后端：jev；买家等待：2091ms；转人工：否。
- 实际工具：。
- 回复原文：

```text
哈哈，这自信的光芒确实挡不住！穿上它，你就是聚会里最耀眼的星。
```

### E50

- 层级：L2；分类后端：jev；买家等待：534ms；转人工：否。
- 实际工具：get_order ✅。
- 回复原文：

```text
已找到您的订单，详情在这里。
```

卡片：`order`（完整内容与参数见原始JSON）。

### E53

- 层级：L3；分类后端：jev；买家等待：11244ms；转人工：否。
- 实际工具：list_orders ✅, search_products ✅, search_products ✅, search_products ✅, list_coupons ✅, recommend_size ✅。
- 回复原文：

```text
您上次购买的大衣是燕麦色，同款软糯圆领开衫有燕麦色和您的M码（库存12件）。

根据系统报价，该商品券后单件价格为269元。由于开衫属于“针织衫”而非“外套”，满199减20券不适用；全店券需满299元，单买未达到门槛，故无可用优惠券，最终支付价仍为269元。
```

```text
以下是当前可用的优惠券。
```

卡片：`coupons`（完整内容与参数见原始JSON）。

### E56

- 层级：L3；分类后端：jev；买家等待：4601ms；转人工：否。
- 实际工具：search_products ✅, search_products ✅。
- 回复原文：

```text
关于保暖性，目前资料没有具体的测试结果或明确说明，无法确定哪件更保暖。

洗护建议如下：
*   **大衣（P007）**：建议专业干洗，勿机洗，通风阴干，收纳时使用宽肩衣架。
*   **开衫（P030）**：使用羊毛中性洗剂轻柔手洗，毛巾吸水后平铺阴干，不悬挂湿衣。
```

### E57

- 层级：L3；分类后端：jev；买家等待：4327ms；转人工：否。
- 实际工具：list_orders ✅, track_logistics ✅。
- 回复原文：

```text
您的订单 QM2026100201 目前由顺丰速运承运，最新状态为“已到达上海浦东配送站，等待安排派送”，预计将于明天（10月6日）送达。

关于您想退掉上周那件外套（QM2026092801），由于该订单显示已签收，需要办理退货退款。请问您希望退回这件燕麦色羊毛混纺大衣吗？另外，请告诉我具体的退货原因（如：尺码不合适、质量问题等），以便我为您生成申请卡片。
```

- **E39 事实核对**：纯闲聊，短于80字且无数字；未声称价格、材质、库存等购物事实，未调用工具。
- **E50 事实核对**：L2只给实际get_order返回的订单卡片。直接L3复验为“订单 QM2026100402 目前为待付款状态。具体问题原因尚不确定，请补充遇到的错误提示。”；status来自工具，未显示模型猜测的渠道、网络或银行卡原因。固定桩还验证模型给出无依据建议时，已知订单状态答复保持上述事实边界。
- **E53 事实核对**：list_orders提供大衣燕麦色/M；search_products返回P030燕麦/M的stock=12、price=269、category=针织衫；CP001门槛299未满足，CP002仅外套不适用。服务端按这些查询事实给出单件报价269，最终正文和券卡同时保留。没有新增购买确认操作。
- **E56 事实核对**：大衣P007和开衫P030的care来自search_products；没有实测保暖数据，因此不推断保暖强弱。商品已有care时不再要求重复知识库检索。
- **E57 事实核对**：list_orders确定外套QM2026092801；track_logistics提供QM2026100201最新浦东配送站节点和10月6日预计到达。原文缺退款原因，最终先追问，未执行apply_refund、未生成原因不明的确认卡。普通业务拒绝由固定桩另验证，不会自动转人工；强制人工审核与D012两组合仍保持原行为。


## 失败与波动如实保留

- T05b基线49/60；本次第三次56/60，原49条通过项均未退步。E40/E59已有T08改动，不能归功于T09；逐条变化均见对比表。
- 本次全量未过：E01（Jev/LLM超时后mock）、E44（分类错）、E55（多诉求未识别）、E58（R007反面教材规则误吞）。E01后续定向复验通过，不回填全量。
- 旧E57报告未保留失败参数，旧agent三次隔离复跑没有重现；不能认定旧失败原因。新采样定位到已发货退款业务拒绝，完整参数在 `T09-l3-business-failure.json`，分析在 `docs/questions/T09-1.md`。
- 开发采样有模型借用旧售后原因、未达门槛扣券、颜色未匹配就说售罄、补造支付原因、提出不存在的购买卡片等问题。`T09-l3-initial.json`、`T09-l3-recheck.json`、`T09-l3-verified.json`、`T09-l3-before-grounding.json`、`T09-l3-before-status-fix.json` 均是**开发诊断证据，不是通过报告**。最后对这些问题补了通用事实约束/参数来源检查；不能用结构5/5替代逐字核对。
- 后端请求到上游声明 `tool_choice=required`，仍观察到上游直接返回文字。事实问题无工具结果时仍转人工；已知订单状态先在本地调用权限校验后的get_order，回答只能取它的状态。行为差异已记录，未声称provider总会遵守required。
- 退款原因收集复用现有L2规则，不新增例外词表；规则不识别的复杂原因可能要补充一次。纯闲聊仅允许≤80字符且无数字，模型超长/带数字仍按原要求兜底。
- 模型/检索服务偶发超时仍可能转人工。原始trace保留真实provider或降级信息。迟到分类费用标 estimated，避免把超时裁决当成完整模型风险结果；手续费与摘要在同一trace更新，不重复计数。

## 可复制命令

项目目录内已有本地环境配置；不要输出其内容。以下运行定向验收，不执行第四次全量：

```bash
npm run typecheck
npm run lint
node --import tsx --test lib/brain/*.test.ts lib/tools/*.test.ts
node --import tsx scripts/check-pipeline.ts
node --import tsx scripts/check-agent.ts
node --import tsx scripts/check-t05b-handoff.ts
AGENT_MODEL=qwen/qwen3.7-flash AGENT_REASONING=off npm run eval -- --only E39,E50,E53,E56,E57
AGENT_MODEL=qwen/qwen3.7-flash AGENT_REASONING=off node --import tsx scripts/check-t09-live.ts --warmup --only E39,E50,E53,E56,E57 --report /tmp/T09-live.json
AGENT_MODEL=qwen/qwen3.7-flash AGENT_REASONING=off node --import tsx scripts/check-t09-live.ts --only Q3 --jev-timeout 1 --report /tmp/T09-timeout.json
```

浏览器服务器：`NEXT_PUBLIC_USE_MOCK=0 AGENT_MODEL=qwen/qwen3.7-flash AGENT_REASONING=off npm run dev -- --port 3009`。
打开 `http://localhost:3009`、`/product/P013`、`/seller`、`/seller/dashboard`。
在另一终端运行 `E2E_PORT=3009 NEXT_PUBLIC_USE_MOCK=0 npm run e2e -- --headed`，亲眼查看完整6步（会重置演示数据）。
看板显示第三次全量56/60快照；`data/runtime/eval_latest.json`仅在本地更新，`data/seed/eval_latest.json`属于Cursor，未修改。
