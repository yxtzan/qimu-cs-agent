# T06 端到端评测报告

- 运行时间：2026-10-04T07:49:28.091Z
- 分类器后端：**jev**（`CLASSIFIER_PROVIDER`；真实调用 OpenRouter，未造假数据）
- 用例：15 条（`data/eval/cases.json`，未改动），通过 **13**，未通过 2
- 总成本：$0.002147（0.000143 / 条；取自各条 RouteTrace 的 cost.totalUsd，含后台风险检查）
- 重置策略：单次重置耗时 6.3 秒，每条用例前重置
- 工具调用检查：已检查（非 mock 模式）
- 分类器稳定性：2 / 15 条用例**第一次尝试**时分类器被降级（Jev 超时 / 429 → 退到 llm 或 mock）或抛异常；评测脚本退避 3 秒、6 秒后最多重试 2 次，采用最后一次结果；重试 3 次仍降级的有 1 条（这些不计入下面「Jev 中文表现」的统计，但计入总成绩）

## 一、总成绩

| 指标 | 数值 | 说明 |
|---|---:|---|
| 意图准确率 | 83.3% | 有 expect.intent 的用例，最终 trace.intent 是否一致 |
| 路由准确率 | 86.7% | 最终 trace.layer 是否在期望层里 |
| 风险召回率 | 100.0% | 期望命中风险项的用例，是否全部命中 |
| 风险误报率 | 0.0% | **按 cases.json 定义**：riskHit=[] 且非 risk_gate 的用例（4 条，样本很少） |
| 风险误报率（宽口径） | 0.0% | 所有不期望触发风险闸门的用例（12 条） |
| 平均延迟 | 3397 ms | trace.latency.totalMs 平均 |

### 分层延迟与成本（按实际落到的层）

| 层 | 条数 | 平均延迟 | p95 延迟 | 平均成本 |
|---|---:|---:|---:|---:|
| risk_gate | 3 | 392 ms | 407 ms | $0.000088 |
| L2 | 7 | 1953 ms | 8217 ms | $0.000074 |
| L3 | 4 | 7977 ms | 18478 ms | $0.000248 |
| human | 1 | 4207 ms | 4207 ms | $0.000376 |

买家实际等待（handleMessage 返回）平均 3403 ms，p95 18484 ms。L1 / 风险闸门的最终 trace 在后台写入，所以它们的 trace 延迟和买家等待不同。

## 二、未通过用例（2 条）

原因汇总：分类器降级 1；转人工判断错 1

| 用例 | 买家说 | 期望 | 实际 | 原因 |
|---|---|---|---|---|
| H01 | 这件真丝衬衫能直接放洗衣机吗 | layer=L2 intent=product_consult riskHit=[] | layer=L3 intent=other riskHit=[] handoff=false tools=[get_product] | 分类器降级 |
| H13 | 没付款的那单不要了，另外已经付款的那单什么时候发货 | layer=L3 tools⊇[list_orders] | layer=human(来自L3) intent=multi_step_complex riskHit=[] handoff=true tools=[list_orders,cancel_order,track_logistics] | 转人工判断错 |

## 三、Jev 中文表现

> 数据来自 RouteTrace.topIntents[0]（分类器自己的 top1 意图与概率），不受规则 / 续接逻辑影响。分类器后端：jev。

- 带意图标注的用例 **5** 条，分类器 top1 意图准确率 **100.0%**（5/5）。
- 其中期望走 L2 的用例 **5** 条，意图准确率 **100.0%**（5/5）。

### 置信度分桶

| 置信度 | 条数 | 答对 | 准确率 |
|---|---:|---:|---:|
| < 0.5 | 0 | 0 | — |
| 0.5 – 0.7 | 0 | 0 | — |
| 0.7 – 0.85 | 0 | 0 | — |
| ≥ 0.85 | 5 | 5 | 100.0% |

### L2_CONFIDENCE_THRESHOLD 建议

| 阈值 | 被接下的条数 | 其中答对 | 准确率 |
|---:|---:|---:|---:|
| 0.50 | 5 | 5 | 100.0% |
| 0.55 | 5 | 5 | 100.0% |
| 0.60 | 5 | 5 | 100.0% |
| 0.65 | 5 | 5 | 100.0% |
| 0.70 | 5 | 5 | 100.0% |
| 0.75 | 5 | 5 | 100.0% |
| 0.80 | 5 | 5 | 100.0% |
| 0.85 | 5 | 5 | 100.0% |
| 0.90 | 5 | 5 | 100.0% |
| 0.95 | 5 | 5 | 100.0% |

**没有任何阈值能让被接下的消息准确率达到 95%（且至少 10 条）**，建议保持 0.70 并优先修复下面的错分，样本只有 5 条。

### 风险项召回率与误报率

> 误报分母：所有不期望触发风险闸门的 12 条用例。`legal_threat / health_safety / fraud_security` 有硬关键词兜底（如「消协」「红疹」），命中时分数直接为 1，所以这三项的召回含关键词的功劳，不全是 Jev 的。

| 风险项 | 应命中 | 命中 | 召回率 | 误报 | 误报率 |
|---|---:|---:|---:|---:|---:|
| legal_threat | 0 | 0 | — | 0 | 0.0% |
| health_safety | 1 | 1 | 100.0% | 0 | 0.0% |
| fraud_security | 1 | 1 | 100.0% | 0 | 0.0% |
| abuse_extreme | 0 | 0 | — | 0 | 0.0% |
| emotion | 0 | 0 | — | 0 | 0.0% |

## 四、规则层做减法：R007「尺码（宽泛）」

本次没有跑 R007 对比（缺 E58 或被跳过）。

## 五、逐条结果

| 用例 | 买家说 | 结果 | 实际 | 延迟 | 成本 | 回复摘要 |
|---|---|---|---|---:|---:|---|
| H01 | 这件真丝衬衫能直接放洗衣机吗 | ❌ 分类器降级（3次，仍降级） | layer=L3 intent=other riskHit=[] handoff=false tools=[get_product] | 18478 ms | $0.000104 | 根据商品详情，这件云感真丝衬衫**不建议直接放入洗衣机**。 官方洗护建议为： * **轻柔手洗** |
| H02 | 我165 55kg，这条裤子拿哪个码 | ✅ | layer=L2 intent=size_recommend riskHit=[] handoff=false tools=[recommend_size,get_product,search_kb] | 2411 ms | $0.000070 | 建议您选 L 码，供您参考。 / 建议结合下面的尺码资料和穿着习惯选择。 / 这些资料供您参考。 |
| H03 | 我那条西装裤和开衫现在到哪儿了 | ✅（3次） | layer=L2 intent=logistics_track riskHit=[] handoff=false tools=[get_order,track_logistics] | 1309 ms | $0.000070 | 包裹正在配送中，预计 10-06 送达。 |
| H04 | 碎花裙的钱退回来没有啊 | ✅ | layer=L2 intent=refund_progress riskHit=[] handoff=false tools=[get_order,get_aftersale] | 395 ms | $0.000072 | 退款处理中，商家确认收到退货后24小时内发起，预计1–3个工作日原路退回，请您留意到账通知。 |
| H05 | 地址写错了，帮我改成上海市徐汇区漕溪北路100号 | ✅ | layer=L2 intent=modify_order riskHit=[] handoff=false tools=[get_order] | 462 ms | $0.000073 | 请补充新收货地址，例如：姓名：林小满，电话：138****0001，地区：浙江省 杭州市 西湖区，地 |
| H06 | 这件衬衫我妈穿了一下午，脖子上起了一片小疙瘩，又痒又红 | ✅ | layer=risk_gate intent=quality_issue riskHit=[health_safety] handoff=true tools=[] | 380 ms | $0.000092 | 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。 |
| H07 | 有人加我微信说是你们客服，让我先交保证金才能退款 | ✅ | layer=risk_gate intent=other riskHit=[fraud_security] handoff=true tools=[] | 389 ms | $0.000073 | 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。 |
| H08 | 你们再这样敷衍，我就把聊天记录发到网上让大家评评理 | ✅ | layer=risk_gate intent=other riskHit=[legal_threat,emotion] handoff=true tools=[] | 407 ms | $0.000098 | 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。 |
| H09 | 我皮肤比较敏感，这件羊毛的贴身穿会痒吗 | ✅ | layer=L2 intent=product_consult riskHit=[] handoff=false tools=[get_product,search_kb] | 8217 ms | $0.000092 | 羊毛混纺大衣建议内搭薄针织或衬衫，避免直接接触皮肤。若皮肤敏感，可先试穿感受，具体因人而异。 / 这 |
| H10 | 我老公是做律师的，他说你家大衣版型挺正 | ✅ | layer=L3 intent=greeting riskHit=[] handoff=false tools=[] | 1415 ms | $0.000105 | 谢谢夸奖，您先生真有眼光！ |
| H11 | 今天心情不错，随便逛逛 | ✅ | layer=L2 intent=greeting riskHit=[] handoff=false tools=[] | 393 ms | $0.000067 | 您好，我是栖木智能客服。有什么可以帮您？ |
| H12 | 上周那件大衣还能换L吗，另外最近那单到哪了 | ✅ | layer=L3 intent=multi_step_complex riskHit=[] handoff=false tools=[list_orders,check_stock,request_exchange,track_logistics] | 7304 ms | $0.000576 | 关于换货： 上周购买的燕麦色羊毛混纺大衣（M码）目前L码有库存，已为您生成换L码的申请。请您核对确认 |
| H13 | 没付款的那单不要了，另外已经付款的那单什么时候发货 | ❌ 转人工判断错 | layer=human(来自L3) intent=multi_step_complex riskHit=[] handoff=true tools=[list_orders,cancel_order,track_logistics] | 4207 ms | $0.000376 | 这个问题比较复杂，我帮您转接人工客服 / 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况 |
| H14 | 西装裤和茶歇裙哪个更显瘦，顺便说下怎么洗 | ✅ | layer=L3 intent=product_consult riskHit=[] handoff=false tools=[search_products] | 4711 ms | $0.000205 | 关于显瘦效果，西装裤采用高腰直筒版型，能修饰腿部线条；茶歇裙则是修身收腰设计，突出腰线。两者各有优势 |
| H15 | 那件大衣腰身有点大，我想退了 | ✅ | layer=L2 intent=refund_apply riskHit=[] handoff=false tools=[get_order] | 482 ms | $0.000072 | 可以的，请告诉我退款或退货原因，我先帮您核实是否符合申请条件。 |

## 六、判定说明

- 判定严格按 `data/eval/cases.json` 的 `_readme`：layer（字符串或数组，任一即可）、intent、riskHit（子集）、handoff、tools（子集，仅非 mock）。
- 唯一的解释性约定：期望转人工（handoff=true）且期望层是 L1 / L2 / L3 时，若 trace 是「该层接住后转人工」（layer=human 且 escalatedFrom=期望层）也算层级正确——否则「转人工」这类 L1 规则命中后立刻交给人工的消息会被误判。其余一律严格匹配。
- 失败原因由通用规则分类，不针对任何用例：重试 3 次后分类器仍被降级（Jev 超时，由 llm / mock 回答）→ 分类器降级（不是 Jev 中文能力问题）；期望 L3 且 L3 仍是占位回复 → 依赖 T05；风险应命中未命中 → 风险漏判；非风险用例触发闸门 → 风险误报；被 L1 规则截走 → 规则误吞；分类器 top1 意图就不对 → 分类错；意图对但层级 / 工具不对 → 细分为：handler 自己转人工而用例没期望 → 转人工判断错；复合诉求被当成单意图 → 多步没识别；置信度低于阈值落到 L3 → 置信度不足；其余 → 槽位没补全。
- 流水线 bug 不在这里修，见 `docs/questions/`。

