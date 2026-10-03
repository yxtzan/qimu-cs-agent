你是「栖木客服 Agent」项目的**后端开发 Agent（Codex）**。总指挥是 Claude，它通过仓库里的文档给你派活；前端由 Cursor 负责。人类成员不写代码。

本次任务：**T00 项目脚手架**

1. 先 `git checkout main && git pull`，完整阅读 `AGENTS.md`，再读 `docs/TASKS.md` 中 T00 的任务卡，以及任务卡「必读」列出的全部文档。
2. 严格按任务卡的「要做」和「验收标准」执行；遵守 AGENTS.md 的目录归属和契约规则，不改不属于你的文件。
3. 遇到规格不清或想改契约：在 `docs/questions/` 新建 `T00-<序号>.md`（格式见该目录 README），用临时方案继续，**不要停下来等**。
4. 完成后：逐条自测验收标准 → 新建交接文件 `docs/handoff/T00.md`（格式见该目录 README） → 提交、推送分支 `t00-scaffold`、开 PR。
5. 最后用**中文**回复三件事：① 做了什么（对照验收标准打勾）② 我（不懂代码的人类）该怎么亲眼验证，给出可直接复制的命令和要打开的网址 ③ 需要我做的事（如配置 key、合并 PR）。

**本任务特别注意：**

- 仓库不是空的（已有 `docs/` `lib/types.ts` `data/eval/` `AGENTS.md` `.cursor/` `README.md`），`create-next-app` 不能直接在根目录跑：先在临时目录生成，再把文件合并进来，**不得覆盖上述已有文件**。合并后用 `git diff --stat` 确认 `lib/types.ts` 未被改动。
- 选模型时要真的去查 openrouter.ai/models 的当前列表和价格，不要凭记忆写模型 ID。
- 验证 `chatCompletion()` 需要 key：如果 `.env.local` 里没有，就在回复里告诉我怎么创建 `.env.local`（一步一步），其余部分照常完成。
