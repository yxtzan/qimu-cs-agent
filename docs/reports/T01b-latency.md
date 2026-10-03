# T01b Jev 延迟排查与兜底提速

- 实测开始：2026-10-03T18:07:46.420Z
- 已累计模型成本：$0.00946371（停止线 $0.40；硬上限 $0.50）
- 测量状态：A–G 全部完成
- 每种配置 × 6 句话 × 5 轮；p50/p95 使用 nearest-rank，失败轮次保留在 JSON。

## A–G 汇总

| 配置 | 含义 | 已完成轮次 | p50 (ms) | p95 (ms) | 平均单轮成本 (USD) | 粗略意图准确率 | 思考关闭验证 |
|---|---|---:|---:|---:|---:|---:|---|
| A | Jev 7 题一次请求 | 30 | 384 | 554 | 0.00005913 | 100.0% | — |
| B | Jev 只问 intent | 30 | 405 | 529 | 0.00003775 | 100.0% | — |
| C | Jev 风险 4 Noul + emotion | 30 | 381 | 457 | 0.00003305 | 未询问 intent | — |
| D | Jev 7 请求并行 | 30 | 427 | 4744 | 0.00012914 | 100.0% | — |
| E | CLASSIFIER_LLM_MODEL + reasoning off | 30 | 2155 | 4900 | 0.00003561 | 90.0% | 是 |
| F | GENERATION_MODEL + reasoning off | 30 | 2600 | 4685 | 0.00001577 | 96.7% | 是 |
| G | GENERATION_MODEL「你好」max_tokens=5 | 30 | 1565 | 1870 | 0.00000107 | 不适用 | 是 |

## OpenRouter 路径探针

| 路径 | HTTP | 成功 | 延迟 (ms) | 成本 (USD) | 结果 |
|---|---:|---|---:|---:|---|
| Decisions + provider.sort=latency (/alpha/decisions) | 200 | 是 | 6305 | 0.000058968 | {"model":"typesafe/jev-1.13-20260917","id":"gen-dec-1791050872-VVQt2bG2v9j83Quq5Ryp","provider":"TypeSafe","answerKeys":["intent","multi_step","legal_threat","health_safety","fraud_security","abuse_extreme","emotion"]} |
| TypeSafe System One (/v1/systemone) | 200 | 是 | 383 | 0.000058968 | {"model":"typesafe/jev-1.13-20260917","id":"gen-dec-1791050873-eRKUV3lH2TnvMXUxxDMt","provider":"TypeSafe","answerKeys":["intent","multi_step","legal_threat","health_safety","fraud_security","abuse_extreme","emotion"]} |

## 成本异常探针补充

暂停前额外探针：显式将 CLASSIFIER_LLM_MODEL 临时指向 deepseek/deepseek-v4-flash，关闭 reasoning，复用完整中文意图/风险提示和结构化输出；输入 1031 tokens、输出 46 tokens，耗时 7.222 秒，OpenRouter usage.cost 为 $0.00015722。该成本约为 T01 Jev $0.000059 的 2.7 倍。这里以 usage.cost 为准，不自行估算；Jev 只按输入 token 计费且输出免费，而 chat-completions 按生成模型的输入与输出路径计费，提示词更长也会增加成本。

## 分析与推荐

- A（7 题单请求）约 0.38 秒且准确率 100%；B（只问 intent）把成本降到 $0.00003775，p95 529ms，准确率仍 100%。C（风险 4 Noul + emotion）p95 457ms、单轮 $0.00003305，适合独立风险闸门。D 虽然并行墙钟 p50 427ms，但 p95 4744ms、成本约为 A 的 2.2 倍，未显示出稳定收益。
- OpenRouter Decisions + provider.sort=latency 探针耗时 6305ms；同一 Jev 请求走 TypeSafe System One（/v1/systemone）为 383ms，成本相同，慢点主要在 OpenRouter Decisions 路径而非题目数量。
- E/F/G 的 reasoningPresent 来自 API 响应的 reasoning / reasoning_details 字段；E、F、G 30/30 轮均为 false，证明 reasoning 已关闭。E 有 3 次 finish_reason=error/解析失败（准确率 90.0%），F 有 1 次解析失败（96.7%），失败样本保留在 JSON。
- 推荐：L2 意图采用 B（Jev 单题）；风险检测采用 C（Jev 风险题 + emotion）。若需要一次请求同时得到意图与风险，A 是当前更稳的合并方案；最终由 Claude 决定。

完整逐轮数据：docs/reports/T01b-bench.json。
