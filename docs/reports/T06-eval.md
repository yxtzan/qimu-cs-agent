# T06 端到端评测报告

- 运行时间：2026-10-04T03:48:13.748Z
- 分类器后端：**jev**（`CLASSIFIER_PROVIDER`；真实调用 OpenRouter，未造假数据）
- 用例：60 条（`data/eval/cases.json`，未改动），通过 **52**，未通过 8
- 总成本：$0.004302（0.000072 / 条；取自各条 RouteTrace 的 cost.totalUsd，含后台风险检查）
- 重置策略：单次重置耗时 37.4 秒，**只在开始时重置一次**（≥ 10 秒，按任务卡规则）；每条用例用全新会话，评测里不执行确认动作，所以订单 / 库存不会被改动
- 工具调用检查：已检查（非 mock 模式）
- 分类器稳定性：7 / 60 条用例**第一次尝试**时分类器被降级（Jev 超时 / 429 → 退到 llm 或 mock）或抛异常；评测脚本退避 3 秒、6 秒后最多重试 2 次，采用最后一次结果；重试 3 次仍降级的有 1 条（这些不计入下面「Jev 中文表现」的统计，但计入总成绩）
- ⚠️ **T05（L3 Agent）尚未合并**：期望 L3 的用例失败属预期，原因标注「依赖 T05」，T05 合并后需重跑一次。

## 一、总成绩

| 指标 | 数值 | 说明 |
|---|---:|---|
| 意图准确率 | 95.5% | 有 expect.intent 的用例，最终 trace.intent 是否一致 |
| 路由准确率 | 93.3% | 最终 trace.layer 是否在期望层里 |
| 风险召回率 | 100.0% | 期望命中风险项的用例，是否全部命中 |
| 风险误报率 | 0.0% | **按 cases.json 定义**：riskHit=[] 且非 risk_gate 的用例（3 条，样本很少） |
| 风险误报率（宽口径） | 0.0% | 所有不期望触发风险闸门的用例（53 条） |
| 平均延迟 | 1249 ms | trace.latency.totalMs 平均 |

### 分层延迟与成本（按实际落到的层）

| 层 | 条数 | 平均延迟 | p95 延迟 | 平均成本 |
|---|---:|---:|---:|---:|
| risk_gate | 7 | 229 ms | 419 ms | $0.000063 |
| L1 | 10 | 416 ms | 4099 ms | $0.000079 |
| L2 | 29 | 2215 ms | 8955 ms | $0.000073 |
| L3 | 10 | 409 ms | 485 ms | $0.000072 |
| human | 4 | 205 ms | 416 ms | $0.000063 |

买家实际等待（handleMessage 返回）平均 1259 ms，p95 6680 ms。L1 / 风险闸门的最终 trace 在后台写入，所以它们的 trace 延迟和买家等待不同。

## 二、未通过用例（8 条）

原因汇总：转人工判断错 2；分类错 1；依赖 T05 3；多步没识别 1；规则误吞 1

| 用例 | 买家说 | 期望 | 实际 | 原因 |
|---|---|---|---|---|
| E40 | 有点小失望，外套比图片颜色深一点 | layer=L2\|L3 riskHit=[] | layer=human(来自L2) intent=quality_issue riskHit=[] handoff=true tools=[get_order] | 转人工判断错 |
| E44 | 那灰色呢 | layer=L2\|L3 intent=stock_check | layer=L3 intent=product_consult riskHit=[] handoff=false tools=[] | 分类错 |
| E51 | 上周买的那件外套换成L码，顺便帮我看看有没有能用的券 | layer=L3 tools⊇[list_orders,check_stock,request_exchange,list_coupons] | layer=L3 intent=multi_step_complex riskHit=[] handoff=false tools=[] | 依赖 T05 |
| E52 | 帮我看看最近的订单 哪个还没到 哪个能退 | layer=L3 tools⊇[list_orders] | layer=L3 intent=multi_step_complex riskHit=[] handoff=false tools=[] | 依赖 T05 |
| E53 | 我想再买一件和上次那件大衣同色的开衫，有我的码吗，用券后多少钱 | layer=L3 tools⊇[search_products,list_coupons] | layer=L3 intent=multi_step_complex riskHit=[] handoff=false tools=[] | 依赖 T05 |
| E55 | 退的那条裙子钱到了我想用这钱再买条同款L码的，有货吗 | layer=L3 tools⊇[get_aftersale,check_stock] | layer=L2 intent=stock_check riskHit=[] handoff=false tools=[] | 多步没识别 |
| E58 | 尺码不合适想退货 | layer=L2 intent=refund_apply | layer=L1 intent=size_recommend riskHit=[] handoff=false tools=[] rule=R007 | 规则误吞 |
| E59 | 身高185体重90kg有合适的吗 | layer=L2\|L3 intent=size_recommend | layer=human(来自L2) intent=size_recommend riskHit=[] handoff=true tools=[recommend_size] | 转人工判断错 |

## 三、Jev 中文表现

> 数据来自 RouteTrace.topIntents[0]（分类器自己的 top1 意图与概率），不受规则 / 续接逻辑影响。分类器后端：jev。

- 带意图标注的用例 **43** 条，分类器 top1 意图准确率 **97.7%**（42/43）。
- 其中期望走 L2 的用例 **33** 条，意图准确率 **97.0%**（32/33）。

### 置信度分桶

| 置信度 | 条数 | 答对 | 准确率 |
|---|---:|---:|---:|
| < 0.5 | 0 | 0 | — |
| 0.5 – 0.7 | 4 | 3 | 75.0% |
| 0.7 – 0.85 | 2 | 2 | 100.0% |
| ≥ 0.85 | 37 | 37 | 100.0% |

### L2_CONFIDENCE_THRESHOLD 建议

| 阈值 | 被接下的条数 | 其中答对 | 准确率 |
|---:|---:|---:|---:|
| 0.50 | 43 | 42 | 97.7% |
| 0.55 | 43 | 42 | 97.7% |
| 0.60 | 43 | 42 | 97.7% |
| 0.65 | 41 | 40 | 97.6% |
| 0.70 | 39 | 39 | 100.0% |
| 0.75 | 39 | 39 | 100.0% |
| 0.80 | 38 | 38 | 100.0% |
| 0.85 | 37 | 37 | 100.0% |
| 0.90 | 36 | 36 | 100.0% |
| 0.95 | 35 | 35 | 100.0% |

按任务卡口径，使被 L2 接下的消息准确率 ≥ 95% 的最低置信度（至少接下 10 条）是 **0.50**；当前配置为 0.70。
但 [0.50, 0.70) 这一段只有 4 条样本、答对 3 条（75.0%），样本太少，下调没有统计依据。

**建议：`L2_CONFIDENCE_THRESHOLD=0.70`（保持不变）**。样本只有 43 条，结论仅供参考；要真正定阈值，需要更多落在 0.5–0.85 的用例。

### 分类器错分明细

| 用例 | 买家说 | 期望 | 分类器给的 | 置信度 |
|---|---|---|---|---:|
| E44 | 那灰色呢 | stock_check | product_consult | 0.67 |

### 风险项召回率与误报率

> 误报分母：所有不期望触发风险闸门的 53 条用例。`legal_threat / health_safety / fraud_security` 有硬关键词兜底（如「消协」「红疹」），命中时分数直接为 1，所以这三项的召回含关键词的功劳，不全是 Jev 的。

| 风险项 | 应命中 | 命中 | 召回率 | 误报 | 误报率 |
|---|---:|---:|---:|---:|---:|
| legal_threat | 2 | 2 | 100.0% | 0 | 0.0% |
| health_safety | 2 | 2 | 100.0% | 0 | 0.0% |
| fraud_security | 1 | 1 | 100.0% | 0 | 0.0% |
| abuse_extreme | 1 | 1 | 100.0% | 0 | 0.0% |
| emotion | 1 | 1 | 100.0% | 0 | 0.0% |

## 四、规则层做减法：R007「尺码（宽泛）」

用例 E58「尺码不合适想退货」，期望 L2 / refund_apply。R007 的正则是「尺码」，最大长度 20 字，所以会截走这句话。

| R007 | 实际 | 结果 | 延迟 | 成本 |
|---|---|---|---:|---:|
| 开启 | layer=L1 intent=size_recommend riskHit=[] handoff=false rule=R007 | ❌ 规则误吞 | 7 ms | $0.000061 |
| 关闭 | layer=L2 intent=refund_apply riskHit=[] handoff=false | ✅ 通过 | 409 ms | $0.000061 |

结论：关闭 R007 后，这句话回到模型理解，走对了意图——**规则层越宽越容易「误吞」，做减法有效**。

## 五、逐条结果

| 用例 | 买家说 | 结果 | 实际 | 延迟 | 成本 | 回复摘要 |
|---|---|---|---|---:|---:|---|
| E01 | 这件大衣是纯羊毛的吗 | ✅（2次） | layer=L2 intent=product_consult riskHit=[] handoff=false tools=[get_product,search_kb] | 7483 ms | $0.000098 | 这件大衣不是纯羊毛，含羊毛70%、锦纶30%。建议专业干洗，不要机洗，通风阴干，收纳时用宽肩衣架。  |
| E02 | 真丝的衣服可以丢洗衣机吗 | ✅（2次） | layer=L2 intent=product_consult riskHit=[] handoff=false tools=[search_kb] | 6671 ms | $0.000078 | 不建议机洗。真丝面料比较娇贵，机洗容易导致勾丝、变形或磨损。请用专用中性洗剂轻柔手洗，先把洗剂在水中 |
| E03 | 我160 50公斤穿什么码合适 | ✅ | layer=L2 intent=size_recommend riskHit=[] handoff=false tools=[recommend_size,get_product,search_kb] | 1269 ms | $0.000064 | 建议您选 M 码，供您参考。 / 建议结合下面的尺码资料和穿着习惯选择。 / 这些资料供您参考。 |
| E04 | 身高158 体重94斤 选S还是M | ✅ | layer=L2 intent=size_recommend riskHit=[] handoff=false tools=[recommend_size,search_kb] | 2451 ms | $0.000063 | 建议您选 S 码，供您参考。 / 建议结合下面的尺码资料和穿着习惯选择。 / 这些资料供您参考。 |
| E05 | 燕麦色L还有货不 | ✅（3次，仍降级） | layer=L2 intent=stock_check riskHit=[] handoff=false tools=[get_product,check_stock] | 8993 ms | $0.000000 | 燕麦色 L：有货（3件） |
| E06 | 我有哪些优惠券可以用 | ✅ | layer=L2 intent=promotion riskHit=[] handoff=false tools=[list_coupons,search_kb] | 8955 ms | $0.000061 | 这是您目前可用的优惠券，一单限用一张。 / 林小满 B001 有满 299 减 30 的全店券，10 |
| E07 | 满多少包邮啊 | ✅（2次） | layer=L2 intent=shipping_policy riskHit=[] handoff=false tools=[search_kb] | 3274 ms | $0.000061 | 抱歉，现有资料还无法确认这个问题。我可以帮您转接人工核实。 |
| E08 | 为啥我的订单一直是待付款 钱都扣了 | ✅ | layer=L2 intent=order_status riskHit=[] handoff=false tools=[list_orders] | 3001 ms | $0.000062 | 您想查询或办理哪一单？ |
| E09 | 我买的裤子和开衫现在到哪了 | ✅（3次） | layer=L2 intent=logistics_track riskHit=[] handoff=false tools=[get_order,track_logistics] | 1489 ms | $0.000064 | 包裹正在配送中，预计 10-06 送达。 |
| E10 | 麻烦尽快发一下货 下周出差要带 | ✅ | layer=L2 intent=urge_shipping riskHit=[] handoff=false tools=[list_orders] | 389 ms | $0.000062 | 已记录您的催发货诉求。常规预计发货时间为 2026/10/6 21:00:00，实际安排请以订单更新 |
| E11 | 收货地址写错了想改一下 | ✅ | layer=L2 intent=modify_order riskHit=[] handoff=false tools=[list_orders] | 389 ms | $0.000062 | 请补充新收货地址，例如：姓名：林小满，电话：138****0001，地区：浙江省 杭州市 西湖区，地 |
| E12 | 那个雾粉开衫的订单我不要了 | ✅ | layer=L2 intent=cancel_order riskHit=[] handoff=false tools=[get_order,cancel_order] | 397 ms | $0.000068 | 请核对下面的信息，确认后我再为您办理。 |
| E13 | 外套不太合身 想退掉 | ✅ | layer=L2 intent=refund_apply riskHit=[] handoff=false tools=[get_order] | 388 ms | $0.000067 | 可以的，请告诉我退款或退货原因，我先帮您核实是否符合申请条件。 |
| E14 | 之前退的那条裙子钱怎么还没到 | ✅ | layer=L2 intent=refund_progress riskHit=[] handoff=false tools=[list_orders,get_aftersale] | 404 ms | $0.000062 | 退款处理中，商家确认收到退货后24小时内发起，预计1–3个工作日原路退回，请您留意到账通知。 |
| E15 | 大衣M码有点小 我想换大一码 | ✅ | layer=L2 intent=exchange riskHit=[] handoff=false tools=[get_order,check_stock,request_exchange] | 383 ms | $0.000067 | 请选择不同的尺码或颜色 |
| E16 | 衣服有股很重的味道 洗了也没散 | ✅ | layer=L2 intent=quality_issue riskHit=[] handoff=false tools=[list_orders] | 413 ms | $0.000062 | 您想查询或办理哪一单？ |
| E17 | 签收第八天了还能无理由退吗 | ✅ | layer=L2 intent=return_policy riskHit=[] handoff=false tools=[search_kb] | 2489 ms | $0.000125 | 您好，签收后第8天已超过7天无理由退换期限，无法申请无理由退货。 / 这些资料供您参考。 |
| E18 | 我要开个发票 个人抬头就行 | ✅ | layer=L2 intent=invoice riskHit=[] handoff=false tools=[search_kb] | 2621 ms | $0.000107 | 好的，请先确认收货，在订单详情中申请电子普通发票。提交时核对姓名无误即可，1个工作日内开具。 / 这 |
| E19 | 谢谢你啦 问题解决了 | ✅ | layer=L2 intent=greeting riskHit=[] handoff=false tools=[] | 380 ms | $0.000062 | 不客气，很高兴能帮到您。还有问题随时找我。 |
| E20 | 能推荐个附近好吃的餐厅吗 | ✅ | layer=L2 intent=other riskHit=[] handoff=false tools=[] | 384 ms | $0.000062 | 我可以帮您查物流、推荐尺码、查询退款或办理退换。请告诉我具体需要。 |
| E21 | ［动作 {"type":"quick_action","na | ✅ | layer=L1 intent=logistics_track riskHit=[] handoff=false tools=[list_orders,track_logistics] | 5 ms | $0.000061 | 包裹正在配送中，预计 10-06 送达。 |
| E22 | ［动作 {"type":"quick_action","na | ✅ | layer=L1 intent=refund_progress riskHit=[] handoff=false tools=[list_orders,get_aftersale] | 7 ms | $0.000061 | 退款处理中，商家确认收到退货后24小时内发起，预计1–3个工作日原路退回，请您留意到账通知。 |
| E23 | ［动作 {"type":"quick_action","na | ✅ | layer=L1 intent=size_recommend riskHit=[] handoff=false tools=[] | 8 ms | $0.000061 | 为了推荐合适的尺码，请告诉我身高和体重（例如160cm、50kg）。 |
| E24 | ［动作 {"type":"quick_action","na | ✅ | layer=human(来自L1) intent=human_request riskHit=[] handoff=true tools=[] | 9 ms | $0.000061 | 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。 |
| E25 | 到哪了 | ✅ | layer=L1 intent=logistics_track riskHit=[] handoff=false tools=[list_orders,track_logistics] rule=R002 | 5 ms | $0.000061 | 包裹正在配送中，预计 10-06 送达。 |
| E26 | 转人工 | ✅ | layer=human(来自L1) intent=human_request riskHit=[] handoff=true tools=[] rule=R001 | 9 ms | $0.000061 | 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。 |
| E27 | 在吗？ | ✅ | layer=L1 intent=greeting riskHit=[] handoff=false tools=[] rule=R004 | 6 ms | $0.000061 | 您好，我是栖木智能客服。有什么可以帮您？ |
| E28 | 退款进度 | ✅ | layer=L1 intent=refund_progress riskHit=[] handoff=false tools=[list_orders,get_aftersale] rule=R003 | 9 ms | $0.000061 | 退款处理中，商家确认收到退货后24小时内发起，预计1–3个工作日原路退回，请您留意到账通知。 |
| E29 | 有运费险吗 | ✅ | layer=L1 intent=return_policy riskHit=[] handoff=false tools=[search_kb] rule=R006 | 4099 ms | $0.000162 | 您好，关于运费险，目前资料中未明确说明所有订单都附带运费险。非质量问题的退货运费由买家承担，金卡会员 |
| E30 | 查物流 | ✅ | layer=L1 intent=logistics_track riskHit=[] handoff=false tools=[list_orders,track_logistics] rule=R002 | 6 ms | $0.000061 | 包裹正在配送中，预计 10-06 送达。 |
| E31 | 穿了你们的真丝衬衫脖子和后背全是红疹子，必须给我个说法 | ✅ | layer=risk_gate intent=quality_issue riskHit=[health_safety] handoff=true tools=[] | 6 ms | $0.000068 | 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。 |
| E32 | 今天不解决我明天就去消协 | ✅ | layer=risk_gate intent=other riskHit=[legal_threat] handoff=true tools=[] | 6 ms | $0.000062 | 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。 |
| E33 | 有人加我微信说是你们店的 让我先转200保证金才能退款 | ✅ | layer=risk_gate intent=other riskHit=[fraud_security] handoff=true tools=[] | 368 ms | $0.000063 | 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。 |
| E34 | 滚 一群骗子 恶心死了 | ✅ | layer=risk_gate intent=other riskHit=[abuse_extreme,emotion] handoff=true tools=[] | 419 ms | $0.000062 | 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。 |
| E35 | 我已经问了三遍了！！！到底有没有人管！！！ | ✅ | layer=risk_gate intent=human_request riskHit=[emotion] handoff=true tools=[] | 385 ms | $0.000062 | 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。 |
| E36 | 退款进度 再拖我就找律师 | ✅ | layer=risk_gate intent=refund_progress riskHit=[legal_threat,emotion] handoff=true tools=[] | 6 ms | $0.000062 | 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。 |
| E37 | 孩子把衣服上的扣子吞下去了怎么办 | ✅ | layer=risk_gate intent=other riskHit=[health_safety] handoff=true tools=[] | 416 ms | $0.000062 | 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。 |
| E38 | 敏感肌穿羊毛会扎吗 | ✅ | layer=L2 intent=product_consult riskHit=[] handoff=false tools=[search_kb] | 4304 ms | $0.000069 | 敏感肌穿羊毛是否扎人因人而异，建议先试穿小面积感受。P007 羊毛混纺大衣建议专业干洗，避免机洗。如 |
| E39 | 这条裙子是不是会让我被闺蜜嫉妒死哈哈 | ✅ | layer=L3 intent=other riskHit=[] handoff=false tools=[] | 368 ms | $0.000062 | 这个问题我需要再确认一下。 |
| E40 | 有点小失望，外套比图片颜色深一点 | ❌ 转人工判断错 | layer=human(来自L2) intent=quality_issue riskHit=[] handoff=true tools=[get_order] | 386 ms | $0.000067 | 很抱歉给您带来困扰，这单需要人工核实质量问题，我帮您转接。 / 我已为您转接人工客服，正在等待人工接 |
| E41 | 退款到哪了 | ✅ | layer=L1 intent=refund_progress riskHit=[] handoff=false tools=[get_order,get_aftersale] rule=R003 | 5 ms | $0.000138 | 退款处理中，商家确认收到退货后24小时内发起，预计1–3个工作日原路退回，请您留意到账通知。 |
| E42 | 啥时候能到 | ✅ | layer=L2 intent=logistics_track riskHit=[] handoff=false tools=[get_order,track_logistics] | 372 ms | $0.000064 | 包裹正在配送中，预计 10-06 送达。 |
| E43 | 能换L吗 | ✅ | layer=L2 intent=exchange riskHit=[] handoff=false tools=[get_order,check_stock,request_exchange] | 386 ms | $0.000067 | 请核对下面的信息，确认后我再为您办理。 |
| E44 | 那灰色呢 | ❌ 分类错 | layer=L3 intent=product_consult riskHit=[] handoff=false tools=[] | 389 ms | $0.000063 | 这个问题我需要再确认一下。 |
| E45 | 那这件大衣穿哪个码 | ✅（3次） | layer=L2 intent=size_recommend riskHit=[] handoff=false tools=[recommend_size,get_product,search_kb] | 3467 ms | $0.000090 | 建议您选 M 码，供您参考。 / 建议结合下面的尺码资料和穿着习惯选择。 / 这些资料供您参考。 |
| E46 | 不要了 | ✅（3次） | layer=L2 intent=cancel_order riskHit=[] handoff=false tools=[get_order,cancel_order] | 1834 ms | $0.000066 | 请核对下面的信息，确认后我再为您办理。 |
| E47 | ［动作 {"type":"text","text":"好的， | ✅ | layer=L2 intent=exchange riskHit=[] handoff=false tools=[get_order,check_stock,request_exchange] | 409 ms | $0.000139 | 请选择不同的尺码或颜色 |
| E48 | 上周那件大衣 | ✅ | layer=L2 intent=exchange riskHit=[] handoff=false tools=[get_order] | 441 ms | $0.000132 | 您希望换成什么尺码或颜色？告诉我后，我先帮您确认库存。 |
| E49 | 不是这个，我问的是退款 | ✅ | layer=L3 intent=refund_progress riskHit=[] handoff=false tools=[] | 430 ms | $0.000131 | 这个问题我需要再确认一下。 |
| E50 | 付不了款怎么办 | ✅ | layer=L3 intent=order_status riskHit=[] handoff=false tools=[] | 383 ms | $0.000067 | 这个问题我需要再确认一下。 |
| E51 | 上周买的那件外套换成L码，顺便帮我看看有没有能用的券 | ❌ 依赖 T05 | layer=L3 intent=multi_step_complex riskHit=[] handoff=false tools=[] | 403 ms | $0.000068 | 这个问题我需要再确认一下。 |
| E52 | 帮我看看最近的订单 哪个还没到 哪个能退 | ❌ 依赖 T05 | layer=L3 intent=multi_step_complex riskHit=[] handoff=false tools=[] | 485 ms | $0.000062 | 这个问题我需要再确认一下。 |
| E53 | 我想再买一件和上次那件大衣同色的开衫，有我的码吗，用券后多少 | ❌ 依赖 T05 | layer=L3 intent=multi_step_complex riskHit=[] handoff=false tools=[] | 448 ms | $0.000063 | 这个问题我需要再确认一下。 |
| E54 | 两个订单都帮我处理下：没付款的取消，已经付了的改地址到浙江省 | ✅ | layer=L3 intent=multi_step_complex riskHit=[] handoff=false tools=[] | 407 ms | $0.000064 | 这个问题我需要再确认一下。 |
| E55 | 退的那条裙子钱到了我想用这钱再买条同款L码的，有货吗 | ❌ 多步没识别 | layer=L2 intent=stock_check riskHit=[] handoff=false tools=[] | 385 ms | $0.000063 | 您想了解哪件商品？从商品页点「问客服」，或告诉我商品编号就可以。 |
| E56 | 比较一下你们家的大衣和开衫哪个更保暖，顺便告诉我怎么洗 | ✅ | layer=L3 intent=product_consult riskHit=[] handoff=false tools=[] | 384 ms | $0.000066 | 这个问题我需要再确认一下。 |
| E57 | 到哪了，另外我想把上周那件外套退了 | ✅ | layer=L3 intent=multi_step_complex riskHit=[] handoff=false tools=[] | 392 ms | $0.000067 | 这个问题我需要再确认一下。 |
| E58 | 尺码不合适想退货 | ❌ 规则误吞 | layer=L1 intent=size_recommend riskHit=[] handoff=false tools=[] rule=R007 | 7 ms | $0.000061 | 为了推荐合适的尺码，请告诉我身高和体重（例如160cm、50kg）。 |
| E59 | 身高185体重90kg有合适的吗 | ❌ 转人工判断错 | layer=human(来自L2) intent=size_recommend riskHit=[] handoff=true tools=[recommend_size] | 416 ms | $0.000063 | 身高或体重超出尺码表范围，建议转人工确认 / 我已为您转接人工客服，正在等待人工接入。您可以继续补充 |
| E60 | 人工智能客服现在都这么厉害了吗 | ✅ | layer=L2 intent=other riskHit=[] handoff=false tools=[] | 420 ms | $0.000062 | 我可以帮您查物流、推荐尺码、查询退款或办理退换。请告诉我具体需要。 |

## 六、判定说明

- 判定严格按 `data/eval/cases.json` 的 `_readme`：layer（字符串或数组，任一即可）、intent、riskHit（子集）、handoff、tools（子集，仅非 mock）。
- 唯一的解释性约定：期望转人工（handoff=true）且期望层是 L1 / L2 / L3 时，若 trace 是「该层接住后转人工」（layer=human 且 escalatedFrom=期望层）也算层级正确——否则「转人工」这类 L1 规则命中后立刻交给人工的消息会被误判。其余一律严格匹配。
- 失败原因由通用规则分类，不针对任何用例：重试 3 次后分类器仍被降级（Jev 超时，由 llm / mock 回答）→ 分类器降级（不是 Jev 中文能力问题）；期望 L3 且 L3 仍是占位回复 → 依赖 T05；风险应命中未命中 → 风险漏判；非风险用例触发闸门 → 风险误报；被 L1 规则截走 → 规则误吞；分类器 top1 意图就不对 → 分类错；意图对但层级 / 工具不对 → 细分为：handler 自己转人工而用例没期望 → 转人工判断错；复合诉求被当成单意图 → 多步没识别；置信度低于阈值落到 L3 → 置信度不足；其余 → 槽位没补全。
- 流水线 bug 不在这里修，见 `docs/questions/`。

