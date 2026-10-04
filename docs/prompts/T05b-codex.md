你是「栖木客服 Agent」项目的**后端开发 Agent（Codex）**。总指挥是 Claude，它通过仓库里的文档给你派活。人类成员不写代码。

本次任务：**T05b 转人工摘要不阻塞 + T06 补跑评测 + L3 延迟拆解**

1. 在 Codex 自己的工作区里拉取最新 `origin/main`，从它新建分支 `t05b-followups`。完整阅读 `AGENTS.md`（注意新增的 T05b 特批文件），再读 `docs/TASKS.md` 中 T05b 的任务卡和「必读」列出的文档，尤其是 `docs/DECISIONS.md` D012 和 `docs/questions/T05-1.md` `T05-2.md` 里 Claude 的答复。
2. **严格按任务卡的顺序**：先在没改代码的 main 上补跑评测并提交报告，再改转人工摘要，最后写延迟分析。
3. Cursor 正在做 T08，会改 `lib/brain/pipeline.ts` 的风险闸门、`lib/brain/risk.ts`、`lib/brain/handlers/index.ts` `read.ts`、`lib/brain/trace.ts`、`lib/brain/decide/warmup.ts`、`lib/tools/recommend-size.ts`。**这些文件你都不要改**，避免冲突。
4. 遇到规格不清：在 `docs/questions/` 新建 `T05b-<序号>.md`，用临时方案继续，不要停下来等。
5. 完成后：逐条自测验收标准 → 新建交接文件 `docs/handoff/T05b.md` → 提交、推送、开 PR。
6. 最后用**中文**回复三件事：① 做了什么（对照验收标准打勾）② 我（不懂代码的人类）该怎么亲眼验证，给出可直接复制的命令和要打开的网址 ③ 需要我做的事。

**本任务特别注意：**

- 限时 1.5 小时，够用即可。不要重构，不要顺手优化 L3（第 3 步只分析不改）。
- 评测会真实调用 Jev 和模型，一次全量约半美分，最多跑 2 次全量。
- 不要打印或提交 `.env.local` 的内容。
