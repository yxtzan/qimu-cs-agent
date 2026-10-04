# T06 端到端评测报告

- 运行时间：2026-10-04T05:04:13.112Z
- 分类器后端：**jev**（`CLASSIFIER_PROVIDER`；真实调用 OpenRouter，未造假数据）
- 用例：60 条（`data/eval/cases.json`，未改动），通过 **52**，未通过 8
- 总成本：$0.006607（0.000110 / 条；取自各条 RouteTrace 的 cost.totalUsd，含后台风险检查）
- 重置策略：单次重置耗时 6.3 秒，每条用例前重置
- 工具调用检查：已检查（非 mock 模式）
- 分类器稳定性：9 / 60 条用例**第一次尝试**时分类器被降级（Jev 超时 / 429 → 退到 llm 或 mock）或抛异常；评测脚本退避 3 秒、6 秒后最多重试 2 次，采用最后一次结果；重试 3 次仍降级的有 4 条（这些不计入下面「Jev 中文表现」的统计，但计入总成绩）

## 一、总成绩

| 指标 | 数值 | 说明 |
|---|---:|---|
| 意图准确率 | 93.2% | 有 expect.intent 的用例，最终 trace.intent 是否一致 |
| 路由准确率 | 88.3% | 最终 trace.layer 是否在期望层里 |
| 风险召回率 | 100.0% | 期望命中风险项的用例，是否全部命中 |
| 风险误报率 | 33.3% | **按 cases.json 定义**：riskHit=[] 且非 risk_gate 的用例（3 条，样本很少） |
| 风险误报率（宽口径） | 1.9% | 所有不期望触发风险闸门的用例（53 条） |
| 平均延迟 | 2852 ms | trace.latency.totalMs 平均 |

### 分层延迟与成本（按实际落到的层）

| 层 | 条数 | 平均延迟 | p95 延迟 | 平均成本 |
|---|---:|---:|---:|---:|
| risk_gate | 8 | 2331 ms | 2896 ms | $0.000078 |
| L1 | 10 | 430 ms | 4197 ms | $0.000074 |
| L2 | 28 | 2226 ms | 8988 ms | $0.000065 |
| L3 | 9 | 7287 ms | 22512 ms | $0.000310 |
| human | 5 | 4055 ms | 6560 ms | $0.000124 |

买家实际等待（handleMessage 返回）平均 2858 ms，p95 8995 ms。L1 / 风险闸门的最终 trace 在后台写入，所以它们的 trace 延迟和买家等待不同。

## 二、未通过用例（8 条）

原因汇总：分类器降级 1；风险误报 1；转人工判断错 3；分类错 1；多步没识别 1；规则误吞 1

| 用例 | 买家说 | 期望 | 实际 | 原因 |
|---|---|---|---|---|
| E01 | 这件大衣是纯羊毛的吗 | layer=L2 intent=product_consult | layer=L3 intent=other riskHit=[] handoff=false tools=[search_kb,get_product] | 分类器降级 |
| E38 | 敏感肌穿羊毛会扎吗 | layer=L2 intent=product_consult riskHit=[] | layer=risk_gate intent=product_consult riskHit=[health_safety] handoff=true tools=[] | 风险误报 |
| E39 | 这条裙子是不是会让我被闺蜜嫉妒死哈哈 | layer=L2\|L3 riskHit=[] | layer=human(来自L3) intent=other riskHit=[] handoff=true tools=[] | 转人工判断错 |
| E44 | 那灰色呢 | layer=L2\|L3 intent=stock_check | layer=L3 intent=product_consult riskHit=[] handoff=false tools=[list_orders,search_products] | 分类错 |
| E50 | 付不了款怎么办 | layer=L2\|L3 intent=order_status | layer=human(来自L3) intent=order_status riskHit=[] handoff=true tools=[] | 转人工判断错 |
| E55 | 退的那条裙子钱到了我想用这钱再买条同款L码的，有货吗 | layer=L3 tools⊇[get_aftersale,check_stock] | layer=L2 intent=stock_check riskHit=[] handoff=false tools=[] | 多步没识别 |
| E56 | 比较一下你们家的大衣和开衫哪个更保暖，顺便告诉我怎么洗 | layer=L3 | layer=human(来自L3) intent=product_consult riskHit=[] handoff=true tools=[search_kb] | 转人工判断错 |
| E58 | 尺码不合适想退货 | layer=L2 intent=refund_apply | layer=L1 intent=size_recommend riskHit=[] handoff=false tools=[] rule=R007 | 规则误吞（预期内失败：R007 为反面教材规则） |

## 三、Jev 中文表现

> 数据来自 RouteTrace.topIntents[0]（分类器自己的 top1 意图与概率），不受规则 / 续接逻辑影响。分类器后端：jev。

- 带意图标注的用例 **40** 条，分类器 top1 意图准确率 **97.5%**（39/40）。
- 其中期望走 L2 的用例 **30** 条，意图准确率 **96.7%**（29/30）。

### 置信度分桶

| 置信度 | 条数 | 答对 | 准确率 |
|---|---:|---:|---:|
| < 0.5 | 0 | 0 | — |
| 0.5 – 0.7 | 4 | 3 | 75.0% |
| 0.7 – 0.85 | 1 | 1 | 100.0% |
| ≥ 0.85 | 35 | 35 | 100.0% |

### L2_CONFIDENCE_THRESHOLD 建议

| 阈值 | 被接下的条数 | 其中答对 | 准确率 |
|---:|---:|---:|---:|
| 0.50 | 40 | 39 | 97.5% |
| 0.55 | 40 | 39 | 97.5% |
| 0.60 | 40 | 39 | 97.5% |
| 0.65 | 38 | 38 | 100.0% |
| 0.70 | 36 | 36 | 100.0% |
| 0.75 | 35 | 35 | 100.0% |
| 0.80 | 35 | 35 | 100.0% |
| 0.85 | 35 | 35 | 100.0% |
| 0.90 | 34 | 34 | 100.0% |
| 0.95 | 32 | 32 | 100.0% |

按任务卡口径，使被 L2 接下的消息准确率 ≥ 95% 的最低置信度（至少接下 10 条）是 **0.50**；当前配置为 0.70。
但 [0.50, 0.70) 这一段只有 4 条样本、答对 3 条（75.0%），样本太少，下调没有统计依据。

**建议：`L2_CONFIDENCE_THRESHOLD=0.70`（保持不变）**。样本只有 40 条，结论仅供参考；要真正定阈值，需要更多落在 0.5–0.85 的用例。

### 分类器错分明细

| 用例 | 买家说 | 期望 | 分类器给的 | 置信度 |
|---|---|---|---|---:|
| E44 | 那灰色呢 | stock_check | product_consult | 0.61 |

### 风险项召回率与误报率

> 误报分母：所有不期望触发风险闸门的 53 条用例。`legal_threat / health_safety / fraud_security` 有硬关键词兜底（如「消协」「红疹」），命中时分数直接为 1，所以这三项的召回含关键词的功劳，不全是 Jev 的。

| 风险项 | 应命中 | 命中 | 召回率 | 误报 | 误报率 |
|---|---:|---:|---:|---:|---:|
| legal_threat | 2 | 2 | 100.0% | 0 | 0.0% |
| health_safety | 2 | 2 | 100.0% | 1 | 1.9% |
| fraud_security | 1 | 1 | 100.0% | 0 | 0.0% |
| abuse_extreme | 1 | 1 | 100.0% | 0 | 0.0% |
| emotion | 1 | 1 | 100.0% | 0 | 0.0% |

## 四、规则层做减法：R007「尺码（宽泛）」

用例 E58「尺码不合适想退货」，期望 L2 / refund_apply。R007 的正则是「尺码」，最大长度 20 字，所以会截走这句话。

| R007 | 实际 | 结果 | 延迟 | 成本 |
|---|---|---|---:|---:|
| 开启 | layer=L1 intent=size_recommend riskHit=[] handoff=false rule=R007 | ❌ 规则误吞 | 4 ms | $0.000061 |
| 关闭 | layer=L2 intent=refund_apply riskHit=[] handoff=false | ✅ 通过 | 386 ms | $0.000061 |

结论：关闭 R007 后，这句话回到模型理解，走对了意图——**规则层越宽越容易「误吞」，做减法有效**。

## 五、逐条结果

| 用例 | 买家说 | 结果 | 实际 | 延迟 | 成本 | 回复摘要 |
|---|---|---|---|---:|---:|---|
| E01 | 这件大衣是纯羊毛的吗 | ❌ 分类器降级（3次，仍降级） | layer=L3 intent=other riskHit=[] handoff=false tools=[search_kb,get_product] | 22512 ms | $0.000123 | 这件大衣不是纯羊毛的。根据商品详情，它是**羊毛混纺**材质，具体成分为：**羊毛 70%** 和  |
| E02 | 真丝的衣服可以丢洗衣机吗 | ✅ | layer=L2 intent=product_consult riskHit=[] handoff=false tools=[search_kb] | 2437 ms | $0.000062 | 抱歉，现有资料还无法确认这个问题。我可以帮您转接人工核实。 |
| E03 | 我160 50公斤穿什么码合适 | ✅（3次，仍降级） | layer=L2 intent=size_recommend riskHit=[] handoff=false tools=[recommend_size,get_product,search_kb] | 8994 ms | $0.000000 | 建议您选 M 码，供您参考。 / 建议结合下面的尺码资料和穿着习惯选择。 / 这些资料供您参考。 |
| E04 | 身高158 体重94斤 选S还是M | ✅（3次，仍降级） | layer=L2 intent=size_recommend riskHit=[] handoff=false tools=[recommend_size,search_kb] | 8988 ms | $0.000000 | 建议您选 S 码，供您参考。 / 建议结合下面的尺码资料和穿着习惯选择。 / 这些资料供您参考。 |
| E05 | 燕麦色L还有货不 | ✅（3次） | layer=L2 intent=stock_check riskHit=[] handoff=false tools=[get_product,check_stock] | 1239 ms | $0.000064 | 燕麦色 L：有货（3件） |
| E06 | 我有哪些优惠券可以用 | ✅ | layer=L2 intent=promotion riskHit=[] handoff=false tools=[list_coupons,search_kb] | 7523 ms | $0.000072 | 这是您目前可用的优惠券，一单限用一张。 / 您好，您目前有两张未使用的优惠券：林小满B001全店券满 |
| E07 | 满多少包邮啊 | ✅ | layer=L2 intent=shipping_policy riskHit=[] handoff=false tools=[search_kb] | 2386 ms | $0.000061 | 抱歉，现有资料还无法确认这个问题。我可以帮您转接人工核实。 |
| E08 | 为啥我的订单一直是待付款 钱都扣了 | ✅（3次） | layer=L2 intent=order_status riskHit=[] handoff=false tools=[list_orders] | 1361 ms | $0.000062 | 您想查询或办理哪一单？ |
| E09 | 我买的裤子和开衫现在到哪了 | ✅ | layer=L2 intent=logistics_track riskHit=[] handoff=false tools=[get_order,track_logistics] | 434 ms | $0.000064 | 包裹正在配送中，预计 10-06 送达。 |
| E10 | 麻烦尽快发一下货 下周出差要带 | ✅ | layer=L2 intent=urge_shipping riskHit=[] handoff=false tools=[list_orders] | 409 ms | $0.000062 | 已记录您的催发货诉求。常规预计发货时间为 2026/10/6 21:00:00，实际安排请以订单更新 |
| E11 | 收货地址写错了想改一下 | ✅ | layer=L2 intent=modify_order riskHit=[] handoff=false tools=[list_orders] | 391 ms | $0.000062 | 请补充新收货地址，例如：姓名：林小满，电话：138****0001，地区：浙江省 杭州市 西湖区，地 |
| E12 | 那个雾粉开衫的订单我不要了 | ✅ | layer=L2 intent=cancel_order riskHit=[] handoff=false tools=[get_order,cancel_order] | 395 ms | $0.000068 | 请核对下面的信息，确认后我再为您办理。 |
| E13 | 外套不太合身 想退掉 | ✅ | layer=L2 intent=refund_apply riskHit=[] handoff=false tools=[get_order] | 387 ms | $0.000067 | 可以的，请告诉我退款或退货原因，我先帮您核实是否符合申请条件。 |
| E14 | 之前退的那条裙子钱怎么还没到 | ✅ | layer=L2 intent=refund_progress riskHit=[] handoff=false tools=[list_orders,get_aftersale] | 376 ms | $0.000062 | 退款处理中，商家确认收到退货后24小时内发起，预计1–3个工作日原路退回，请您留意到账通知。 |
| E15 | 大衣M码有点小 我想换大一码 | ✅ | layer=L2 intent=exchange riskHit=[] handoff=false tools=[get_order,check_stock,request_exchange] | 405 ms | $0.000067 | 请选择不同的尺码或颜色 |
| E16 | 衣服有股很重的味道 洗了也没散 | ✅ | layer=L2 intent=quality_issue riskHit=[] handoff=false tools=[list_orders] | 385 ms | $0.000062 | 您想查询或办理哪一单？ |
| E17 | 签收第八天了还能无理由退吗 | ✅ | layer=L2 intent=return_policy riskHit=[] handoff=false tools=[search_kb] | 5217 ms | $0.000081 | 您好，无理由退换货需要在签收后7天内（含第7天）申请，第8天已超出期限，无法按无理由办理。如有质量问 |
| E18 | 我要开个发票 个人抬头就行 | ✅ | layer=L2 intent=invoice riskHit=[] handoff=false tools=[search_kb] | 2382 ms | $0.000062 | 抱歉，现有资料还无法确认这个问题。我可以帮您转接人工核实。 |
| E19 | 谢谢你啦 问题解决了 | ✅（3次，仍降级） | layer=L2 intent=greeting riskHit=[] handoff=false tools=[] | 8988 ms | $0.000000 | 不客气，很高兴能帮到您。还有问题随时找我。 |
| E20 | 能推荐个附近好吃的餐厅吗 | ✅（3次） | layer=L2 intent=other riskHit=[] handoff=false tools=[] | 2433 ms | $0.000062 | 我可以帮您查物流、推荐尺码、查询退款或办理退换。请告诉我具体需要。 |
| E21 | ［动作 {"type":"quick_action","na | ✅ | layer=L1 intent=logistics_track riskHit=[] handoff=false tools=[list_orders,track_logistics] | 7 ms | $0.000061 | 包裹正在配送中，预计 10-06 送达。 |
| E22 | ［动作 {"type":"quick_action","na | ✅ | layer=L1 intent=refund_progress riskHit=[] handoff=false tools=[list_orders,get_aftersale] | 8 ms | $0.000061 | 退款处理中，商家确认收到退货后24小时内发起，预计1–3个工作日原路退回，请您留意到账通知。 |
| E23 | ［动作 {"type":"quick_action","na | ✅ | layer=L1 intent=size_recommend riskHit=[] handoff=false tools=[] | 11 ms | $0.000061 | 为了推荐合适的尺码，请告诉我身高和体重（例如160cm、50kg）。 |
| E24 | ［动作 {"type":"quick_action","na | ✅ | layer=human(来自L1) intent=human_request riskHit=[] handoff=true tools=[] | 2516 ms | $0.000061 | 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。 |
| E25 | 到哪了 | ✅ | layer=L1 intent=logistics_track riskHit=[] handoff=false tools=[list_orders,track_logistics] rule=R002 | 7 ms | $0.000061 | 包裹正在配送中，预计 10-06 送达。 |
| E26 | 转人工 | ✅ | layer=human(来自L1) intent=human_request riskHit=[] handoff=true tools=[] rule=R001 | 2516 ms | $0.000061 | 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。 |
| E27 | 在吗？ | ✅ | layer=L1 intent=greeting riskHit=[] handoff=false tools=[] rule=R004 | 24 ms | $0.000061 | 您好，我是栖木智能客服。有什么可以帮您？ |
| E28 | 退款进度 | ✅ | layer=L1 intent=refund_progress riskHit=[] handoff=false tools=[list_orders,get_aftersale] rule=R003 | 16 ms | $0.000061 | 退款处理中，商家确认收到退货后24小时内发起，预计1–3个工作日原路退回，请您留意到账通知。 |
| E29 | 有运费险吗 | ✅ | layer=L1 intent=return_policy riskHit=[] handoff=false tools=[search_kb] rule=R006 | 4197 ms | $0.000161 | 您好，关于运费险，目前资料中没有明确说明所有订单都附带运费险。非质量问题的退货运费由买家承担，金卡会 |
| E30 | 查物流 | ✅ | layer=L1 intent=logistics_track riskHit=[] handoff=false tools=[list_orders,track_logistics] rule=R002 | 13 ms | $0.000061 | 包裹正在配送中，预计 10-06 送达。 |
| E31 | 穿了你们的真丝衬衫脖子和后背全是红疹子，必须给我个说法 | ✅ | layer=risk_gate intent=quality_issue riskHit=[health_safety] handoff=true tools=[] | 2896 ms | $0.000068 | 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。 |
| E32 | 今天不解决我明天就去消协 | ✅ | layer=risk_gate intent=other riskHit=[legal_threat] handoff=true tools=[] | 2170 ms | $0.000072 | 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。 |
| E33 | 有人加我微信说是你们店的 让我先转200保证金才能退款 | ✅ | layer=risk_gate intent=other riskHit=[fraud_security] handoff=true tools=[] | 2892 ms | $0.000063 | 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。 |
| E34 | 滚 一群骗子 恶心死了 | ✅ | layer=risk_gate intent=other riskHit=[abuse_extreme,emotion] handoff=true tools=[] | 2284 ms | $0.000067 | 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。 |
| E35 | 我已经问了三遍了！！！到底有没有人管！！！ | ✅ | layer=risk_gate intent=human_request riskHit=[emotion] handoff=true tools=[] | 2588 ms | $0.000067 | 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。 |
| E36 | 退款进度 再拖我就找律师 | ✅ | layer=risk_gate intent=refund_progress riskHit=[legal_threat,emotion] handoff=true tools=[] | 1624 ms | $0.000087 | 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。 |
| E37 | 孩子把衣服上的扣子吞下去了怎么办 | ✅ | layer=risk_gate intent=other riskHit=[health_safety] handoff=true tools=[] | 2160 ms | $0.000067 | 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。 |
| E38 | 敏感肌穿羊毛会扎吗 | ❌ 风险误报 | layer=risk_gate intent=product_consult riskHit=[health_safety] handoff=true tools=[] | 2034 ms | $0.000131 | 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况，我们会认真协助您处理。 |
| E39 | 这条裙子是不是会让我被闺蜜嫉妒死哈哈 | ❌ 转人工判断错 | layer=human(来自L3) intent=other riskHit=[] handoff=true tools=[] | 5433 ms | $0.000166 | 这个问题比较复杂，我帮您转接人工客服 / 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况 |
| E40 | 有点小失望，外套比图片颜色深一点 | ✅ | layer=L2 intent=quality_issue riskHit=[] handoff=false tools=[get_order] | 1507 ms | $0.000067 | 很抱歉这件商品没能让您满意。这单签收还在 7 天无理由退换期内，您可以直接申请退货或换货，您是金卡会 |
| E41 | 退款到哪了 | ✅ | layer=L1 intent=refund_progress riskHit=[] handoff=false tools=[get_order,get_aftersale] rule=R003 | 5 ms | $0.000093 | 退款处理中，商家确认收到退货后24小时内发起，预计1–3个工作日原路退回，请您留意到账通知。 |
| E42 | 啥时候能到 | ✅ | layer=L2 intent=logistics_track riskHit=[] handoff=false tools=[get_order,track_logistics] | 533 ms | $0.000064 | 包裹正在配送中，预计 10-06 送达。 |
| E43 | 能换L吗 | ✅ | layer=L2 intent=exchange riskHit=[] handoff=false tools=[get_order,check_stock,request_exchange] | 400 ms | $0.000067 | 请核对下面的信息，确认后我再为您办理。 |
| E44 | 那灰色呢 | ❌ 分类错 | layer=L3 intent=product_consult riskHit=[] handoff=false tools=[list_orders,search_products] | 4813 ms | $0.000320 | 您好，查询到同款大衣有**炭灰色**（即您提到的灰色）可选。 目前库存情况如下： * **S码**： |
| E45 | 那这件大衣穿哪个码 | ✅ | layer=L2 intent=size_recommend riskHit=[] handoff=false tools=[recommend_size,get_product,search_kb] | 2492 ms | $0.000136 | 建议您选 M 码，供您参考。 / 建议结合下面的尺码资料和穿着习惯选择。 / 这些资料供您参考。 |
| E46 | 不要了 | ✅（2次） | layer=L3 intent=cancel_order riskHit=[] handoff=false tools=[cancel_order] | 2828 ms | $0.000128 | 取消订单 QM2026100401，自动退还全部已付款金额 ¥269.00（待您确认后办理） / 请 |
| E47 | ［动作 {"type":"text","text":"好的， | ✅ | layer=L2 intent=exchange riskHit=[] handoff=false tools=[get_order,check_stock,request_exchange] | 494 ms | $0.000139 | 请选择不同的尺码或颜色 |
| E48 | 上周那件大衣 | ✅ | layer=L2 intent=exchange riskHit=[] handoff=false tools=[get_order] | 388 ms | $0.000132 | 您希望换成什么尺码或颜色？告诉我后，我先帮您确认库存。 |
| E49 | 不是这个，我问的是退款 | ✅ | layer=L3 intent=refund_progress riskHit=[] handoff=false tools=[list_orders,get_aftersale] | 6543 ms | $0.000621 | 请问您想对哪一笔订单申请退款？目前有两笔未完结的订单： 1. **QM2026100201**（已发 |
| E50 | 付不了款怎么办 | ❌ 转人工判断错 | layer=human(来自L3) intent=order_status riskHit=[] handoff=true tools=[] | 3248 ms | $0.000165 | 这个问题比较复杂，我帮您转接人工客服 / 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况 |
| E51 | 上周买的那件外套换成L码，顺便帮我看看有没有能用的券 | ✅ | layer=L3 intent=multi_step_complex riskHit=[] handoff=false tools=[list_orders,check_stock,request_exchange,list_coupons] | 4530 ms | $0.000159 | 为订单 QM2026092801 的「燕麦色羊毛混纺大衣 燕麦色 M」换成 燕麦色 L，共 1 件； |
| E52 | 帮我看看最近的订单 哪个还没到 哪个能退 | ✅ | layer=L3 intent=multi_step_complex riskHit=[] handoff=false tools=[list_orders,track_logistics,get_aftersale] | 5858 ms | $0.000354 | 您好，帮您查看了最近的订单情况： 1. **订单 QM2026100201**（高腰直筒西装裤、软糯 |
| E53 | 我想再买一件和上次那件大衣同色的开衫，有我的码吗，用券后多少 | ✅ | layer=L3 intent=multi_step_complex riskHit=[] handoff=false tools=[list_orders,search_products,list_coupons,check_stock] | 9835 ms | $0.000692 | 已查到2张可用优惠券，详情见卡片。 / 以下是当前可用的优惠券。 |
| E54 | 两个订单都帮我处理下：没付款的取消，已经付了的改地址到浙江省 | ✅ | layer=L3 intent=multi_step_complex riskHit=[] handoff=false tools=[list_orders,cancel_order,modify_address] | 2283 ms | $0.000093 | 取消订单 QM2026100402（尚未付款，无需退款）（待您确认后办理） 将订单 QM202610 |
| E55 | 退的那条裙子钱到了我想用这钱再买条同款L码的，有货吗 | ❌ 多步没识别 | layer=L2 intent=stock_check riskHit=[] handoff=false tools=[] | 651 ms | $0.000063 | 您想了解哪件商品？从商品页点「问客服」，或告诉我商品编号就可以。 |
| E56 | 比较一下你们家的大衣和开衫哪个更保暖，顺便告诉我怎么洗 | ❌ 转人工判断错 | layer=human(来自L3) intent=product_consult riskHit=[] handoff=true tools=[search_kb] | 6560 ms | $0.000165 | 这个问题比较复杂，我帮您转接人工客服 / 我已为您转接人工客服，正在等待人工接入。您可以继续补充情况 |
| E57 | 到哪了，另外我想把上周那件外套退了 | ✅（2次） | layer=L3 intent=multi_step_complex riskHit=[] handoff=false tools=[list_orders,track_logistics,get_order,apply_refund] | 6377 ms | $0.000304 | 为订单 QM2026092801 的「燕麦色羊毛混纺大衣」申请退货退款，原因：买家希望退回上周购买的 |
| E58 | 尺码不合适想退货 | ❌ 规则误吞 | layer=L1 intent=size_recommend riskHit=[] handoff=false tools=[] rule=R007 | 7 ms | $0.000061 | 为了推荐合适的尺码，请告诉我身高和体重（例如160cm、50kg）。 |
| E59 | 身高185体重90kg有合适的吗 | ✅ | layer=L2 intent=size_recommend riskHit=[] handoff=false tools=[recommend_size] | 376 ms | $0.000063 | 您的身高体重（185cm / 90kg）超出了尺码表范围，本店尺码表最大到 XL（身高 175cm、 |
| E60 | 人工智能客服现在都这么厉害了吗 | ✅ | layer=L2 intent=other riskHit=[] handoff=false tools=[] | 368 ms | $0.000062 | 我可以帮您查物流、推荐尺码、查询退款或办理退换。请告诉我具体需要。 |

## 六、判定说明

- 判定严格按 `data/eval/cases.json` 的 `_readme`：layer（字符串或数组，任一即可）、intent、riskHit（子集）、handoff、tools（子集，仅非 mock）。
- 唯一的解释性约定：期望转人工（handoff=true）且期望层是 L1 / L2 / L3 时，若 trace 是「该层接住后转人工」（layer=human 且 escalatedFrom=期望层）也算层级正确——否则「转人工」这类 L1 规则命中后立刻交给人工的消息会被误判。其余一律严格匹配。
- 失败原因由通用规则分类，不针对任何用例：重试 3 次后分类器仍被降级（Jev 超时，由 llm / mock 回答）→ 分类器降级（不是 Jev 中文能力问题）；期望 L3 且 L3 仍是占位回复 → 依赖 T05；风险应命中未命中 → 风险漏判；非风险用例触发闸门 → 风险误报；被 L1 规则截走 → 规则误吞；分类器 top1 意图就不对 → 分类错；意图对但层级 / 工具不对 → 细分为：handler 自己转人工而用例没期望 → 转人工判断错；复合诉求被当成单意图 → 多步没识别；置信度低于阈值落到 L3 → 置信度不足；其余 → 槽位没补全。
- 流水线 bug 不在这里修，见 `docs/questions/`。

