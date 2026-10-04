# T06 端到端评测报告

- 运行时间：2026-10-04T06:34:50.587Z
- 分类器后端：**jev**（`CLASSIFIER_PROVIDER`；真实调用 OpenRouter，未造假数据）
- 用例：60 条（`data/eval/cases.json`，未改动），通过 **56**，未通过 4
- 总成本：$0.007684（0.000128 / 条；取自各条 RouteTrace 的 cost.totalUsd，含后台风险检查）
- 重置策略：单次重置耗时 6.3 秒，每条用例前重置
- 工具调用检查：已检查（非 mock 模式）
- 分类器稳定性：5 / 60 条用例**第一次尝试**时分类器被降级（Jev 超时 / 429 → 退到 llm 或 mock）或抛异常；评测脚本退避 3 秒、6 秒后最多重试 2 次，采用最后一次结果；重试 3 次仍降级的有 2 条（这些不计入下面「Jev 中文表现」的统计，但计入总成绩）

## 一、总成绩

| 指标 | 数值 | 说明 |
|---|---:|---|
| 意图准确率 | 93.2% | 有 expect.intent 的用例，最终 trace.intent 是否一致 |
| 路由准确率 | 95.0% | 最终 trace.layer 是否在期望层里 |
| 风险召回率 | 100.0% | 期望命中风险项的用例，是否全部命中 |
| 风险误报率 | 0.0% | **按 cases.json 定义**：riskHit=[] 且非 risk_gate 的用例（3 条，样本很少） |
| 风险误报率（宽口径） | 0.0% | 所有不期望触发风险闸门的用例（53 条） |
| 平均延迟 | 1776 ms | trace.latency.totalMs 平均 |

### 分层延迟与成本（按实际落到的层）

| 层 | 条数 | 平均延迟 | p95 延迟 | 平均成本 |
|---|---:|---:|---:|---:|
| risk_gate | 7 | 396 ms | 442 ms | $0.000079 |
| L1 | 10 | 188 ms | 1764 ms | $0.000098 |
| L2 | 31 | 1558 ms | 6647 ms | $0.000078 |
| L3 | 9 | 4595 ms | 10854 ms | $0.000382 |
| human | 3 | 4085 ms | 12243 ms | $0.000094 |

买家实际等待（handleMessage 返回）平均 1781 ms，p95 6653 ms。L1 / 风险闸门的最终 trace 在后台写入，所以它们的 trace 延迟和买家等待不同。

## 二、未通过用例（4 条）

原因汇总：分类器降级 1；分类错 1；多步没识别 1；规则误吞 1

| 用例 | 买家说 | 期望 | 实际 | 原因 |
|---|---|---|---|---|
| E01 | 这件大衣是纯羊毛的吗 | layer=L2 intent=product_consult | layer=human(来自L3) intent=other riskHit=[] handoff=true tools=[] | 分类器降级 |
| E44 | 那灰色呢 | layer=L2\|L3 intent=stock_check | layer=L3 intent=product_consult riskHit=[] handoff=false tools=[get_product] | 分类错 |
| E55 | 退的那条裙子钱到了我想用这钱再买条同款L码的，有货吗 | layer=L3 tools⊇[get_aftersale,check_stock] | layer=L2 intent=stock_check riskHit=[] handoff=false tools=[] | 多步没识别 |
| E58 | 尺码不合适想退货 | layer=L2 intent=refund_apply | layer=L1 intent=size_recommend riskHit=[] handoff=false tools=[] rule=R007 | 规则误吞（预期内失败：R007 为反面教材规则） |

## 三、Jev 中文表现

> 数据来自 RouteTrace.topIntents[0]（分类器自己的 top1 意图与概率），不受规则 / 续接逻辑影响。分类器后端：jev。

- 带意图标注的用例 **42** 条，分类器 top1 意图准确率 **97.6%**（41/42）。
- 其中期望走 L2 的用例 **32** 条，意图准确率 **96.9%**（31/32）。

### 置信度分桶

| 置信度 | 条数 | 答对 | 准确率 |
|---|---:|---:|---:|
| < 0.5 | 0 | 0 | — |
| 0.5 – 0.7 | 3 | 2 | 66.7% |
| 0.7 – 0.85 | 3 | 3 | 100.0% |
| ≥ 0.85 | 36 | 36 | 100.0% |

### L2_CONFIDENCE_THRESHOLD 建议

| 阈值 | 被接下的条数 | 其中答对 | 准确率 |
|---:|---:|---:|---:|
| 0.50 | 42 | 41 | 97.6% |
| 0.55 | 42 | 41 | 97.6% |
| 0.60 | 41 | 40 | 97.6% |
| 0.65 | 40 | 40 | 100.0% |
| 0.70 | 39 | 39 | 100.0% |
| 0.75 | 38 | 38 | 100.0% |
| 0.80 | 37 | 37 | 100.0% |
| 0.85 | 36 | 36 | 100.0% |
| 0.90 | 36 | 36 | 100.0% |
| 0.95 | 34 | 34 | 100.0% |

按任务卡口径，使被 L2 接下的消息准确率 ≥ 95% 的最低置信度（至少接下 10 条）是 **0.50**；当前配置为 0.70。
但 [0.50, 0.70) 这一段只有 3 条样本、答对 2 条（66.7%），样本太少，下调没有统计依据。

**建议：`L2_CONFIDENCE_THRESHOLD=0.70`（保持不变）**。样本只有 42 条，结论仅供参考；要真正定阈值，需要更多落在 0.5–0.85 的用例。

### 分类器错分明细

| 用例 | 买家说 | 期望 | 分类器给的 | 置信度 |
|---|---|---|---|---:|
| E44 | 那灰色呢 | stock_check | product_consult | 0.64 |

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
| 开启 | layer=L1 intent=size_recommend riskHit=[] handoff=false rule=R007 | ❌ 规则误吞 | 4 ms | $0.000066 |
| 关闭 | layer=L2 intent=refund_apply riskHit=[] handoff=false | ✅ 通过 | 407 ms | $0.000066 |

结论：关闭 R007 后，这句话回到模型理解，走对了意图——**规则层越宽越容易「误吞」，做减法有效**。

## 五、逐条结果

| 用例 | 买家说 | 结果 | 实际 | 延迟 | 成本 | 回复摘要 |
|---|---|---|---|---:|---:|---|
| E01 | 这件大衣是纯羊毛的吗 | ❌ 分类器降级（3次，仍降级） | layer=human(来自L3) intent=other riskHit=[] handoff=true tools=[] | 12243 ms | $0.000126 | 这个问题比较复杂，我帮您转接人工客服 / 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况 |
| E02 | 真丝的衣服可以丢洗衣机吗 | ✅ | layer=L2 intent=product_consult riskHit=[] handoff=false tools=[search_kb] | 3832 ms | $0.000082 | 不建议机洗。真丝面料娇贵，请用专用中性洗剂轻柔手洗，先化开洗剂再放入衣服，不要搓拧或暴晒。 / 这些 |
| E03 | 我160 50公斤穿什么码合适 | ✅ | layer=L2 intent=size_recommend riskHit=[] handoff=false tools=[recommend_size,get_product,search_kb] | 1047 ms | $0.000070 | 建议您选 M 码，供您参考。 / 建议结合下面的尺码资料和穿着习惯选择。 / 这些资料供您参考。 |
| E04 | 身高158 体重94斤 选S还是M | ✅ | layer=L2 intent=size_recommend riskHit=[] handoff=false tools=[recommend_size,search_kb] | 2394 ms | $0.000068 | 建议您选 S 码，供您参考。 / 建议结合下面的尺码资料和穿着习惯选择。 / 这些资料供您参考。 |
| E05 | 燕麦色L还有货不 | ✅（3次，仍降级） | layer=L2 intent=stock_check riskHit=[] handoff=false tools=[get_product,check_stock] | 8993 ms | $0.000000 | 燕麦色 L：有货（3件） |
| E06 | 我有哪些优惠券可以用 | ✅（2次） | layer=L2 intent=promotion riskHit=[] handoff=false tools=[list_coupons,search_kb] | 6647 ms | $0.000112 | 这是您目前可用的优惠券，一单限用一张。 / 您好，请提供您的会员信息，我帮您查询当前可用的优惠券。  |
| E07 | 满多少包邮啊 | ✅ | layer=L2 intent=shipping_policy riskHit=[] handoff=false tools=[search_kb] | 3176 ms | $0.000082 | 满99元包邮，默认中通。金卡会员全部顺丰。 / 这些资料供您参考。 |
| E08 | 为啥我的订单一直是待付款 钱都扣了 | ✅ | layer=L2 intent=order_status riskHit=[] handoff=false tools=[list_orders] | 379 ms | $0.000067 | 您想查询或办理哪一单？ |
| E09 | 我买的裤子和开衫现在到哪了 | ✅ | layer=L2 intent=logistics_track riskHit=[] handoff=false tools=[get_order,track_logistics] | 369 ms | $0.000070 | 包裹正在配送中，预计 10-06 送达。 |
| E10 | 麻烦尽快发一下货 下周出差要带 | ✅ | layer=L2 intent=urge_shipping riskHit=[] handoff=false tools=[list_orders] | 400 ms | $0.000067 | 已记录您的催发货诉求。常规预计发货时间为 2026/10/6 21:00:00，实际安排请以订单更新 |
| E11 | 收货地址写错了想改一下 | ✅ | layer=L2 intent=modify_order riskHit=[] handoff=false tools=[list_orders] | 470 ms | $0.000067 | 请补充新收货地址，例如：姓名：林小满，电话：138****0001，地区：浙江省 杭州市 西湖区，地 |
| E12 | 那个雾粉开衫的订单我不要了 | ✅ | layer=L2 intent=cancel_order riskHit=[] handoff=false tools=[get_order,cancel_order] | 376 ms | $0.000073 | 请核对下面的信息，确认后我再为您办理。 |
| E13 | 外套不太合身 想退掉 | ✅ | layer=L2 intent=refund_apply riskHit=[] handoff=false tools=[get_order] | 382 ms | $0.000072 | 可以的，请告诉我退款或退货原因，我先帮您核实是否符合申请条件。 |
| E14 | 之前退的那条裙子钱怎么还没到 | ✅ | layer=L2 intent=refund_progress riskHit=[] handoff=false tools=[list_orders,get_aftersale] | 385 ms | $0.000067 | 退款处理中，商家确认收到退货后24小时内发起，预计1–3个工作日原路退回，请您留意到账通知。 |
| E15 | 大衣M码有点小 我想换大一码 | ✅ | layer=L2 intent=exchange riskHit=[] handoff=false tools=[get_order,check_stock,request_exchange] | 368 ms | $0.000073 | 请选择不同的尺码或颜色 |
| E16 | 衣服有股很重的味道 洗了也没散 | ✅ | layer=L2 intent=quality_issue riskHit=[] handoff=false tools=[list_orders] | 372 ms | $0.000067 | 您想查询或办理哪一单？ |
| E17 | 签收第八天了还能无理由退吗 | ✅ | layer=L2 intent=return_policy riskHit=[] handoff=false tools=[search_kb] | 4697 ms | $0.000086 | 您好，无理由退换货期限是签收后7天内（含第7天）。您已超过期限，无法按无理由办理。如有质量问题，请提 |
| E18 | 我要开个发票 个人抬头就行 | ✅ | layer=L2 intent=invoice riskHit=[] handoff=false tools=[search_kb] | 4403 ms | $0.000107 | 您好，请确认收货后，在订单详情中申请电子普通发票，填写个人姓名即可。 / 这些资料供您参考。 |
| E19 | 谢谢你啦 问题解决了 | ✅ | layer=L2 intent=greeting riskHit=[] handoff=false tools=[] | 397 ms | $0.000067 | 不客气，很高兴能帮到您。还有问题随时找我。 |
| E20 | 能推荐个附近好吃的餐厅吗 | ✅ | layer=L2 intent=other riskHit=[] handoff=false tools=[] | 369 ms | $0.000067 | 我可以帮您查物流、推荐尺码、查询退款或办理退换。请告诉我具体需要。 |
| E21 | ［动作 {"type":"quick_action","na | ✅ | layer=L1 intent=logistics_track riskHit=[] handoff=false tools=[list_orders,track_logistics] | 14 ms | $0.000066 | 包裹正在配送中，预计 10-06 送达。 |
| E22 | ［动作 {"type":"quick_action","na | ✅ | layer=L1 intent=refund_progress riskHit=[] handoff=false tools=[list_orders,get_aftersale] | 17 ms | $0.000066 | 退款处理中，商家确认收到退货后24小时内发起，预计1–3个工作日原路退回，请您留意到账通知。 |
| E23 | ［动作 {"type":"quick_action","na | ✅ | layer=L1 intent=size_recommend riskHit=[] handoff=false tools=[] | 4 ms | $0.000066 | 为了推荐合适的尺码，请告诉我身高和体重（例如160cm、50kg）。 |
| E24 | ［动作 {"type":"quick_action","na | ✅ | layer=human(来自L1) intent=human_request riskHit=[] handoff=true tools=[] | 6 ms | $0.000086 | 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。 |
| E25 | 到哪了 | ✅ | layer=L1 intent=logistics_track riskHit=[] handoff=false tools=[list_orders,track_logistics] rule=R002 | 16 ms | $0.000066 | 包裹正在配送中，预计 10-06 送达。 |
| E26 | 转人工 | ✅ | layer=human(来自L1) intent=human_request riskHit=[] handoff=true tools=[] rule=R001 | 6 ms | $0.000070 | 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。 |
| E27 | 在吗？ | ✅ | layer=L1 intent=greeting riskHit=[] handoff=false tools=[] rule=R004 | 11 ms | $0.000066 | 您好，我是栖木智能客服。有什么可以帮您？ |
| E28 | 退款进度 | ✅ | layer=L1 intent=refund_progress riskHit=[] handoff=false tools=[list_orders,get_aftersale] rule=R003 | 11 ms | $0.000066 | 退款处理中，商家确认收到退货后24小时内发起，预计1–3个工作日原路退回，请您留意到账通知。 |
| E29 | 有运费险吗 | ✅ | layer=L1 intent=return_policy riskHit=[] handoff=false tools=[search_kb] rule=R006 | 1764 ms | $0.000153 | 这里没有额外承诺所有订单都附带运费险。非质量问题的退货运费由买家承担，金卡会员免退货运费；质量问题由 |
| E30 | 查物流 | ✅ | layer=L1 intent=logistics_track riskHit=[] handoff=false tools=[list_orders,track_logistics] rule=R002 | 14 ms | $0.000066 | 包裹正在配送中，预计 10-06 送达。 |
| E31 | 穿了你们的真丝衬衫脖子和后背全是红疹子，必须给我个说法 | ✅ | layer=risk_gate intent=quality_issue riskHit=[health_safety] handoff=true tools=[] | 442 ms | $0.000092 | 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。 |
| E32 | 今天不解决我明天就去消协 | ✅ | layer=risk_gate intent=other riskHit=[legal_threat] handoff=true tools=[] | 384 ms | $0.000094 | 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。 |
| E33 | 有人加我微信说是你们店的 让我先转200保证金才能退款 | ✅ | layer=risk_gate intent=other riskHit=[fraud_security] handoff=true tools=[] | 388 ms | $0.000074 | 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。 |
| E34 | 滚 一群骗子 恶心死了 | ✅ | layer=risk_gate intent=other riskHit=[abuse_extreme,emotion] handoff=true tools=[] | 390 ms | $0.000077 | 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。 |
| E35 | 我已经问了三遍了！！！到底有没有人管！！！ | ✅ | layer=risk_gate intent=human_request riskHit=[emotion] handoff=true tools=[] | 412 ms | $0.000072 | 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。 |
| E36 | 退款进度 再拖我就找律师 | ✅ | layer=risk_gate intent=refund_progress riskHit=[legal_threat,emotion] handoff=true tools=[] | 381 ms | $0.000072 | 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。 |
| E37 | 孩子把衣服上的扣子吞下去了怎么办 | ✅ | layer=risk_gate intent=other riskHit=[health_safety] handoff=true tools=[] | 372 ms | $0.000072 | 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。 |
| E38 | 敏感肌穿羊毛会扎吗 | ✅ | layer=L2 intent=product_consult riskHit=[] handoff=false tools=[search_kb] | 2414 ms | $0.000066 | 抱歉，现有资料还无法确认这个问题。我可以帮您转接人工核实。 |
| E39 | 这条裙子是不是会让我被闺蜜嫉妒死哈哈 | ✅（2次） | layer=L3 intent=other riskHit=[] handoff=false tools=[] | 2284 ms | $0.000175 | 哈哈，这自信的光芒确实挡不住！只要穿上喜欢的裙子，那份由内而外的快乐和自信就是最迷人的。相信你的眼光 |
| E40 | 有点小失望，外套比图片颜色深一点 | ✅ | layer=L2 intent=quality_issue riskHit=[] handoff=false tools=[get_order] | 397 ms | $0.000072 | 很抱歉这件商品没能让您满意。这单签收还在 7 天无理由退换期内，您可以直接申请退货或换货，您是金卡会 |
| E41 | 退款到哪了 | ✅ | layer=L1 intent=refund_progress riskHit=[] handoff=false tools=[get_order,get_aftersale] rule=R003 | 13 ms | $0.000301 | 退款处理中，商家确认收到退货后24小时内发起，预计1–3个工作日原路退回，请您留意到账通知。 |
| E42 | 啥时候能到 | ✅ | layer=L2 intent=logistics_track riskHit=[] handoff=false tools=[get_order,track_logistics] | 412 ms | $0.000069 | 包裹正在配送中，预计 10-06 送达。 |
| E43 | 能换L吗 | ✅ | layer=L2 intent=exchange riskHit=[] handoff=false tools=[get_order,check_stock,request_exchange] | 457 ms | $0.000072 | 请核对下面的信息，确认后我再为您办理。 |
| E44 | 那灰色呢 | ❌ 分类错 | layer=L3 intent=product_consult riskHit=[] handoff=false tools=[get_product] | 3737 ms | $0.000303 | 灰色（炭灰）也是这款大衣的可选颜色，材质和版型与燕麦色一致。目前 S、M 和 XL 码有现货，XS  |
| E45 | 那这件大衣穿哪个码 | ✅ | layer=L2 intent=size_recommend riskHit=[] handoff=false tools=[recommend_size,get_product,search_kb] | 2410 ms | $0.000146 | 建议您选 M 码，供您参考。 / 建议结合下面的尺码资料和穿着习惯选择。 / 这些资料供您参考。 |
| E46 | 不要了 | ✅（2次） | layer=L2 intent=cancel_order riskHit=[] handoff=false tools=[get_order,cancel_order] | 438 ms | $0.000071 | 请核对下面的信息，确认后我再为您办理。 |
| E47 | ［动作 {"type":"text","text":"好的， | ✅ | layer=L2 intent=exchange riskHit=[] handoff=false tools=[get_order,check_stock,request_exchange] | 373 ms | $0.000149 | 请选择不同的尺码或颜色 |
| E48 | 上周那件大衣 | ✅ | layer=L2 intent=exchange riskHit=[] handoff=false tools=[get_order] | 371 ms | $0.000142 | 您希望换成什么尺码或颜色？告诉我后，我先帮您确认库存。 |
| E49 | 不是这个，我问的是退款 | ✅ | layer=L3 intent=refund_progress riskHit=[] handoff=false tools=[list_orders] | 3234 ms | $0.000391 | 目前资料还无法确认您具体想查询哪笔订单的退款进度。您是有正在处理的退货退款，还是想申请新的退款呢？请 |
| E50 | 付不了款怎么办 | ✅ | layer=L2 intent=order_status riskHit=[] handoff=false tools=[get_order] | 387 ms | $0.000072 | 已找到您的订单，详情在这里。 |
| E51 | 上周买的那件外套换成L码，顺便帮我看看有没有能用的券 | ✅ | layer=L3 intent=multi_step_complex riskHit=[] handoff=false tools=[list_orders,check_stock,request_exchange,list_coupons] | 4373 ms | $0.000400 | 为订单 QM2026092801 的「燕麦色羊毛混纺大衣 燕麦色 M」换成 燕麦色 L，共 1 件； |
| E52 | 帮我看看最近的订单 哪个还没到 哪个能退 | ✅ | layer=L3 intent=multi_step_complex riskHit=[] handoff=false tools=[list_orders,track_logistics] | 4039 ms | $0.000360 | 您好，帮您查到了最近的订单情况： 1. **尚未送达的订单**：**QM2026100201**（高 |
| E53 | 我想再买一件和上次那件大衣同色的开衫，有我的码吗，用券后多少 | ✅ | layer=L3 intent=multi_step_complex riskHit=[] handoff=false tools=[list_orders,search_products,list_coupons] | 10854 ms | $0.000843 | 您上次购买的大衣是**燕麦色**的。目前店内有同款的**软糯圆领开衫（P030）**，颜色包含**燕 |
| E54 | 两个订单都帮我处理下：没付款的取消，已经付了的改地址到浙江省 | ✅ | layer=L3 intent=multi_step_complex riskHit=[] handoff=false tools=[list_orders,cancel_order,modify_address] | 3328 ms | $0.000239 | 取消订单 QM2026100402（尚未付款，无需退款）（待您确认后办理） 将订单 QM202610 |
| E55 | 退的那条裙子钱到了我想用这钱再买条同款L码的，有货吗 | ❌ 多步没识别 | layer=L2 intent=stock_check riskHit=[] handoff=false tools=[] | 386 ms | $0.000068 | 您想了解哪件商品？从商品页点「问客服」，或告诉我商品编号就可以。 |
| E56 | 比较一下你们家的大衣和开衫哪个更保暖，顺便告诉我怎么洗 | ✅ | layer=L3 intent=product_consult riskHit=[] handoff=false tools=[search_products] | 4271 ms | $0.000355 | 关于保暖性，目前资料还无法确定哪件更保暖。因为工具返回的材质比例（如羊毛含量）不足以直接判定保暖强弱 |
| E57 | 到哪了，另外我想把上周那件外套退了 | ✅ | layer=L3 intent=multi_step_complex riskHit=[] handoff=false tools=[list_orders,track_logistics] | 5236 ms | $0.000374 | 您提到的“上周那件外套”在订单记录中未找到匹配项。目前仅有一笔已签收的燕麦色羊毛混纺大衣（QM202 |
| E58 | 尺码不合适想退货 | ❌ 规则误吞 | layer=L1 intent=size_recommend riskHit=[] handoff=false tools=[] rule=R007 | 12 ms | $0.000066 | 为了推荐合适的尺码，请告诉我身高和体重（例如160cm、50kg）。 |
| E59 | 身高185体重90kg有合适的吗 | ✅ | layer=L2 intent=size_recommend riskHit=[] handoff=false tools=[recommend_size] | 401 ms | $0.000068 | 您的身高体重（185cm / 90kg）超出了尺码表范围，本店尺码表最大到 XL（身高 175cm、 |
| E60 | 人工智能客服现在都这么厉害了吗 | ✅ | layer=L2 intent=other riskHit=[] handoff=false tools=[] | 386 ms | $0.000067 | 我可以帮您查物流、推荐尺码、查询退款或办理退换。请告诉我具体需要。 |

## 六、判定说明

- 判定严格按 `data/eval/cases.json` 的 `_readme`：layer（字符串或数组，任一即可）、intent、riskHit（子集）、handoff、tools（子集，仅非 mock）。
- 唯一的解释性约定：期望转人工（handoff=true）且期望层是 L1 / L2 / L3 时，若 trace 是「该层接住后转人工」（layer=human 且 escalatedFrom=期望层）也算层级正确——否则「转人工」这类 L1 规则命中后立刻交给人工的消息会被误判。其余一律严格匹配。
- 失败原因由通用规则分类，不针对任何用例：重试 3 次后分类器仍被降级（Jev 超时，由 llm / mock 回答）→ 分类器降级（不是 Jev 中文能力问题）；期望 L3 且 L3 仍是占位回复 → 依赖 T05；风险应命中未命中 → 风险漏判；非风险用例触发闸门 → 风险误报；被 L1 规则截走 → 规则误吞；分类器 top1 意图就不对 → 分类错；意图对但层级 / 工具不对 → 细分为：handler 自己转人工而用例没期望 → 转人工判断错；复合诉求被当成单意图 → 多步没识别；置信度低于阈值落到 L3 → 置信度不足；其余 → 槽位没补全。
- 流水线 bug 不在这里修，见 `docs/questions/`。
