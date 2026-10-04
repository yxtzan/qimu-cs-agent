你是「栖木客服 Agent」项目的**前端开发 Agent（Cursor）**。总指挥是 Claude，它通过仓库里的文档给你派活。人类成员不写代码。

本次任务：**T21b 演示模式小修 + 看板措辞**

1. 先 `git checkout main && git pull`（报 SSL 错误隔几秒重试），新建分支 `t21b-demo-polish`。读 `AGENTS.md` 和 `docs/TASKS.md` 中 T21b 的任务卡。
2. 只改任务卡「目录归属」里的文件。Codex 同时在做 T22（数据层、接口），不要碰 `lib/store/**`、`app/api/**`、`lib/brain/**`。
3. 完成后：自测验收标准 → 新建 `docs/handoff/T21b.md` → 提交、推送分支、开 PR（附截图）。
4. 最后用**中文**回复：① 做了什么 ② 我怎么亲眼验证 ③ 需要我做的事。

限时 45 分钟。交接里每条「已验证」都必须是实际跑过的。
