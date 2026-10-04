# T09 与 T05b 补跑逐条对比

基线为 `T05b-eval-T05-only.md`（T05 已合并、T08 尚未合并），49/60；本次最终为56/60。T08 的 E40/E59 改善继续保留，不能都归功于 T09。三次全量分别55/60、55/60、56/60，原始报告均保留。

- T05b 原来通过的49条，本次没有一条变为失败。
- 由失败变为通过：E39, E40, E49, E50, E56, E57, E59。
- 对比当前 main 的 T08 报告52/60，唯一通过→失败是 E01：本次 Jev 超时、LLM也失败，最终mock降级；没有把这次失败改判为通过。定向复验另见验证记录，不回填全量分数。

以下逐条比较通过状态、层级、意图、工具集合、riskHit；概率、耗时和成本的采样波动不视为代码分支变更（原值保留在两份报告）。

| 用例 | T05b 结果 | T09 最终结果 | 变化解释 |
|---|---|---|---|
| E01 | ❌ layer=L3 intent=other riskHit=[] handoff=false tools=[search_kb,get_product] | ❌ layer=human(来自L3) intent=other tools=[] riskHit=[] | 旧基线已失败；本次最终 mock 降级、无可靠事实回答而转人工。上游超时情况如实保留。 |
| E02 | ✅ layer=L2 intent=product_consult riskHit=[] handoff=false tools=[search_kb] | ✅ layer=L2 intent=product_consult tools=[search_kb] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E03 | ✅ layer=L2 intent=size_recommend riskHit=[] handoff=false tools=[recommend_size,get_product,search_kb] | ✅ layer=L2 intent=size_recommend tools=[recommend_size,get_product,search_kb] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E04 | ✅ layer=L2 intent=size_recommend riskHit=[] handoff=false tools=[recommend_size,search_kb] | ✅ layer=L2 intent=size_recommend tools=[recommend_size,search_kb] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E05 | ✅ layer=L2 intent=stock_check riskHit=[] handoff=false tools=[get_product,check_stock] | ✅ layer=L2 intent=stock_check tools=[get_product,check_stock] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E06 | ✅ layer=L2 intent=promotion riskHit=[] handoff=false tools=[list_coupons,search_kb] | ✅ layer=L2 intent=promotion tools=[list_coupons,search_kb] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E07 | ✅ layer=L2 intent=shipping_policy riskHit=[] handoff=false tools=[search_kb] | ✅ layer=L2 intent=shipping_policy tools=[search_kb] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E08 | ✅ layer=L2 intent=order_status riskHit=[] handoff=false tools=[list_orders] | ✅ layer=L2 intent=order_status tools=[list_orders] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E09 | ✅ layer=L2 intent=logistics_track riskHit=[] handoff=false tools=[get_order,track_logistics] | ✅ layer=L2 intent=logistics_track tools=[get_order,track_logistics] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E10 | ✅ layer=L2 intent=urge_shipping riskHit=[] handoff=false tools=[list_orders] | ✅ layer=L2 intent=urge_shipping tools=[list_orders] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E11 | ✅ layer=L2 intent=modify_order riskHit=[] handoff=false tools=[list_orders] | ✅ layer=L2 intent=modify_order tools=[list_orders] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E12 | ✅ layer=L2 intent=cancel_order riskHit=[] handoff=false tools=[get_order,cancel_order] | ✅ layer=L2 intent=cancel_order tools=[get_order,cancel_order] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E13 | ✅ layer=L2 intent=refund_apply riskHit=[] handoff=false tools=[get_order] | ✅ layer=L2 intent=refund_apply tools=[get_order] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E14 | ✅ layer=L2 intent=refund_progress riskHit=[] handoff=false tools=[list_orders,get_aftersale] | ✅ layer=L2 intent=refund_progress tools=[list_orders,get_aftersale] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E15 | ✅ layer=L2 intent=exchange riskHit=[] handoff=false tools=[get_order,check_stock,request_exchange] | ✅ layer=L2 intent=exchange tools=[get_order,check_stock,request_exchange] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E16 | ✅ layer=L2 intent=quality_issue riskHit=[] handoff=false tools=[list_orders] | ✅ layer=L2 intent=quality_issue tools=[list_orders] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E17 | ✅ layer=L2 intent=return_policy riskHit=[] handoff=false tools=[search_kb] | ✅ layer=L2 intent=return_policy tools=[search_kb] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E18 | ✅ layer=L2 intent=invoice riskHit=[] handoff=false tools=[search_kb] | ✅ layer=L2 intent=invoice tools=[search_kb] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E19 | ✅ layer=L2 intent=greeting riskHit=[] handoff=false tools=[] | ✅ layer=L2 intent=greeting tools=[] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E20 | ✅ layer=L2 intent=other riskHit=[] handoff=false tools=[] | ✅ layer=L2 intent=other tools=[] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E21 | ✅ layer=L1 intent=logistics_track riskHit=[] handoff=false tools=[list_orders,track_logistics] | ✅ layer=L1 intent=logistics_track tools=[list_orders,track_logistics] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E22 | ✅ layer=L1 intent=refund_progress riskHit=[] handoff=false tools=[list_orders,get_aftersale] | ✅ layer=L1 intent=refund_progress tools=[list_orders,get_aftersale] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E23 | ✅ layer=L1 intent=size_recommend riskHit=[] handoff=false tools=[] | ✅ layer=L1 intent=size_recommend tools=[] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E24 | ✅ layer=human(来自L1) intent=human_request riskHit=[] handoff=true tools=[] | ✅ layer=human(来自L1) intent=human_request tools=[] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E25 | ✅ layer=L1 intent=logistics_track riskHit=[] handoff=false tools=[list_orders,track_logistics] rule=R002 | ✅ layer=L1 intent=logistics_track tools=[list_orders,track_logistics] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E26 | ✅ layer=human(来自L1) intent=human_request riskHit=[] handoff=true tools=[] rule=R001 | ✅ layer=human(来自L1) intent=human_request tools=[] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E27 | ✅ layer=L1 intent=greeting riskHit=[] handoff=false tools=[] rule=R004 | ✅ layer=L1 intent=greeting tools=[] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E28 | ✅ layer=L1 intent=refund_progress riskHit=[] handoff=false tools=[list_orders,get_aftersale] rule=R003 | ✅ layer=L1 intent=refund_progress tools=[list_orders,get_aftersale] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E29 | ✅ layer=L1 intent=return_policy riskHit=[] handoff=false tools=[search_kb] rule=R006 | ✅ layer=L1 intent=return_policy tools=[search_kb] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E30 | ✅ layer=L1 intent=logistics_track riskHit=[] handoff=false tools=[list_orders,track_logistics] rule=R002 | ✅ layer=L1 intent=logistics_track tools=[list_orders,track_logistics] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E31 | ✅ layer=risk_gate intent=quality_issue riskHit=[health_safety] handoff=true tools=[] | ✅ layer=risk_gate intent=quality_issue tools=[] riskHit=[health_safety] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E32 | ✅ layer=risk_gate intent=other riskHit=[legal_threat] handoff=true tools=[] | ✅ layer=risk_gate intent=other tools=[] riskHit=[legal_threat] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E33 | ✅ layer=risk_gate intent=other riskHit=[fraud_security] handoff=true tools=[] | ✅ layer=risk_gate intent=other tools=[] riskHit=[fraud_security] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E34 | ✅ layer=risk_gate intent=other riskHit=[abuse_extreme,emotion] handoff=true tools=[] | ✅ layer=risk_gate intent=other tools=[] riskHit=[abuse_extreme,emotion] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E35 | ✅ layer=risk_gate intent=human_request riskHit=[emotion] handoff=true tools=[] | ✅ layer=risk_gate intent=human_request tools=[] riskHit=[emotion] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E36 | ✅ layer=risk_gate intent=refund_progress riskHit=[legal_threat,emotion] handoff=true tools=[] | ✅ layer=risk_gate intent=refund_progress tools=[] riskHit=[legal_threat,emotion] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E37 | ✅ layer=risk_gate intent=other riskHit=[health_safety] handoff=true tools=[] | ✅ layer=risk_gate intent=other tools=[] riskHit=[health_safety] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E38 | ✅ layer=L2 intent=product_consult riskHit=[] handoff=false tools=[search_kb] | ✅ layer=L2 intent=product_consult tools=[search_kb] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E39 | ❌ layer=human(来自L3) intent=other riskHit=[] handoff=true tools=[] | ✅ layer=L3 intent=other tools=[] riskHit=[] | 允许 other/greeting 的短闲聊；该条本次未查工具、无数字，不自动转人工。 |
| E40 | ❌ layer=human(来自L2) intent=quality_issue riskHit=[] handoff=true tools=[get_order] | ✅ layer=L2 intent=quality_issue tools=[get_order] riskHit=[] | T08 已修7天窗口内色差投诉的选项回复，T09保留。 |
| E41 | ✅ layer=L1 intent=refund_progress riskHit=[] handoff=false tools=[get_order,get_aftersale] rule=R003 | ✅ layer=L1 intent=refund_progress tools=[get_order,get_aftersale] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E42 | ✅ layer=L2 intent=logistics_track riskHit=[] handoff=false tools=[get_order,track_logistics] | ✅ layer=L2 intent=logistics_track tools=[get_order,track_logistics] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E43 | ✅ layer=L2 intent=exchange riskHit=[] handoff=false tools=[get_order,check_stock,request_exchange] | ✅ layer=L2 intent=exchange tools=[get_order,check_stock,request_exchange] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E44 | ❌ layer=L3 intent=product_consult riskHit=[] handoff=false tools=[list_orders,search_products,list_coupons] | ❌ layer=L3 intent=product_consult tools=[get_product] riskHit=[] | Jev仍判product_consult而非stock_check，未扩大范围改意图问法；工具调用差异来自通用模型规划。 |
| E45 | ✅ layer=L2 intent=size_recommend riskHit=[] handoff=false tools=[recommend_size,get_product,search_kb] | ✅ layer=L2 intent=size_recommend tools=[recommend_size,get_product,search_kb] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E46 | ✅ layer=L2 intent=cancel_order riskHit=[] handoff=false tools=[get_order,cancel_order] | ✅ layer=L2 intent=cancel_order tools=[get_order,cancel_order] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E47 | ✅ layer=L2 intent=exchange riskHit=[] handoff=false tools=[get_order,check_stock,request_exchange] | ✅ layer=L2 intent=exchange tools=[get_order,check_stock,request_exchange] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E48 | ✅ layer=L2 intent=exchange riskHit=[] handoff=false tools=[get_order] | ✅ layer=L2 intent=exchange tools=[get_order] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E49 | ❌ layer=L3 intent=refund_apply riskHit=[] handoff=false tools=[list_orders,get_aftersale] | ✅ layer=L3 intent=refund_progress tools=[list_orders] riskHit=[] | 本次Jev识别refund_progress，通用循环查询售后后回答；分类分数和规划波动，不宣称新增了该句特判。 |
| E50 | ❌ layer=human(来自L3) intent=order_status riskHit=[] handoff=true tools=[] | ✅ layer=L2 intent=order_status tools=[get_order] riskHit=[] | 通用先查事实、已知订单状态预读及明确追问约束；本次最终走L2。真实L3直测另附。 |
| E51 | ✅ layer=L3 intent=multi_step_complex riskHit=[] handoff=false tools=[list_orders,check_stock,request_exchange,list_coupons] | ✅ layer=L3 intent=multi_step_complex tools=[list_orders,check_stock,request_exchange,list_coupons] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E52 | ✅ layer=L3 intent=multi_step_complex riskHit=[] handoff=false tools=[list_orders,track_logistics,get_aftersale] | ✅ layer=L3 intent=multi_step_complex tools=[list_orders,track_logistics] riskHit=[] | 通过状态保持；路由或工具规划存在采样差异，分类置信度/多诉求分决定层级，模型按同一工具契约执行。 |
| E53 | ✅ layer=L3 intent=multi_step_complex riskHit=[] handoff=false tools=[list_orders,search_products,list_coupons,check_stock] | ✅ layer=L3 intent=multi_step_complex tools=[list_orders,search_products,list_coupons] riskHit=[] | 结构检查原本就通过；现在保留模型总结并核对品类/门槛，回答同色、码数、券后价。 |
| E54 | ✅ layer=L3 intent=multi_step_complex riskHit=[] handoff=false tools=[list_orders,cancel_order,modify_address] | ✅ layer=L3 intent=multi_step_complex tools=[list_orders,cancel_order,modify_address] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
| E55 | ❌ layer=L2 intent=stock_check riskHit=[] handoff=false tools=[] | ❌ layer=L2 intent=stock_check tools=[] riskHit=[] | Jev仍未识别多诉求，L2缺商品槽位；未改意图问法或加例外词表。 |
| E56 | ❌ layer=human(来自L3) intent=product_consult riskHit=[] handoff=true tools=[] | ✅ layer=L3 intent=product_consult tools=[search_products] riskHit=[] | 第一轮要求查工具；比较与洗护基于商品/知识库资料，资料不足的保暖结论明确保留不确定。 |
| E57 | ❌ layer=human(来自L3) intent=multi_step_complex riskHit=[] handoff=true tools=[list_orders,track_logistics,get_aftersale,apply_refund] | ✅ layer=L3 intent=multi_step_complex tools=[list_orders,track_logistics] riskHit=[] | 已知订单/物流先查；缺退款原因先问，不编造原因；普通业务拒绝给原因而不自动转。旧失败没有参数日志、三次旧循环复跑未重现，见T09-1。 |
| E58 | ❌ layer=L1 intent=size_recommend riskHit=[] handoff=false tools=[] rule=R007 | ❌ layer=L1 intent=size_recommend tools=[] riskHit=[] | R007反面教材规则预期内失败；判定和总分仍照算。 |
| E59 | ❌ layer=human(来自L2) intent=size_recommend riskHit=[] handoff=true tools=[recommend_size] | ✅ layer=L2 intent=size_recommend tools=[recommend_size] riskHit=[] | T08 已修尺码超范围给上限和按钮、买家点击才转，T09保留。 |
| E60 | ✅ layer=L2 intent=other riskHit=[] handoff=false tools=[] | ✅ layer=L2 intent=other tools=[] riskHit=[] | 通过状态保持；层级/意图/工具/风险命中无变化。 |
