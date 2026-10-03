# 栖木客服 Agent（QIMU CS Agent）

面向电商场景的智能客服 Agent Demo：识别售前 / 售中 / 售后 / 高风险请求，通过「规则层 → 上下文层(Jev) → 大模型层」三层漏斗 + 风险旁路闸门完成自动服务，必要时转人工。

- 买家端：商城 + 客服聊天窗（`/`）
- 卖家端：移动端优先的商家后台，PWA（`/seller`）

虚构店铺：**栖木 QIMU 女装**（所有数据均为虚构）。

---

## 团队与分工

| 角色 | 谁 | 负责 |
|---|---|---|
| 总指挥 / 架构 / 审查 | Claude（Cowork） | `docs/` 下的规格与任务卡、每个任务的提示词、PR 审查、契约变更裁决 |
| 后端 / 大脑 / 数据 / 测试 | Codex | `lib/brain` `lib/tools` `lib/rag` `lib/store` `app/api` `data` `scripts` |
| 前端 / 界面 | Cursor | `app/(shop)` `app/seller` `components` `public` |
| 调度 / 验收 | 你 | 把提示词贴给对应 Agent、合并 PR、跑起来点一遍、把结果告诉 Claude |

## 协作循环（每个任务都一样）

```
Claude 写任务卡(docs/TASKS.md) + 提示词
   → 你把提示词贴给 Codex 或 Cursor
   → Agent：拉最新 main → 新建分支 → 干活 → 自测 → 写交接文件 docs/handoff/T0X.md → 推送 → 开 PR
   → 你：在 GitHub 合并 PR（或先让 Claude 审）
   → 你告诉 Claude「T0X 完成」
   → Claude 读交接文件 / 问题 / 代码 → 更新 TASKS 状态 → 审查 → 写下一批提示词
```

**沟通渠道只有文件：**

- `docs/TASKS.md` — 任务看板和状态（只有 Claude 改）
- `docs/handoff/T0X.md` — 交接记录，一个任务一个文件（Agent 新建）
- `docs/questions/T0X-n.md` — Agent 的提问 / 契约变更请求，一个问题一个文件（Agent 新建，Claude 在文件里答复）
- `docs/DECISIONS.md` — 架构决策记录（Claude 维护）

> 为什么一个任务一个文件？两个 Agent 并行时如果都往同一个文件追加内容，合并 PR 必然冲突。

> 建议：把本地仓库文件夹连接到 Cowork，Claude 就能直接读交接文件和代码，不用你来回复制。

## 第一次怎么开始（只做一次）

1. **建仓库**：在 GitHub 新建一个**私有**仓库，例如 `qimu-cs-agent`（不要勾选自动生成 README）。
2. **推送启动包**：用 Cursor 打开这个文件夹，在 Cursor 对话里说：「把这个文件夹初始化为 git 仓库，提交全部文件，推送到 <你的仓库地址> 的 main 分支」。
3. **接上 Codex**：让 Codex 能访问这个 GitHub 仓库（Codex 云端任务可以直接开 PR）。在 Codex 的环境设置里添加环境变量 `OPENROUTER_API_KEY`（T01 要真实调用模型）。
4. **本地密钥**：把 `.env.example` 复制一份命名为 `.env.local`（所有配置都在里面），只在 `OPENROUTER_API_KEY=` 后填上 key。每份本地克隆都要有一份。这个文件已被 gitignore，不会被提交。**不要把 key 发到任何聊天里。**
5. **连上 Claude**：在 Claude 桌面端把本地仓库文件夹连接到这个 Cowork 会话，之后每次只需要说「T0X 完成」。
6. 发出第一个提示词：`docs/prompts/T00-codex.md`。

## 本地运行

```bash
cp .env.example .env.local     # 然后填入 OPENROUTER_API_KEY（只放本地，永远不要提交）
npm install
npm run seed                   # 生成/重置虚构数据
npm run dev                    # http://localhost:3000 买家端，/seller 卖家端
npm run eval                   # 跑评测集，输出路由准确率
npm run e2e                    # 演示剧本 6 步自动化冒烟测试（Playwright；首次先 npx playwright install chromium）
```

## 文档索引

| 文件 | 内容 |
|---|---|
| [docs/PRD.md](docs/PRD.md) | 产品需求、页面清单、演示剧本 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 三层漏斗 + 风险闸门、对话状态、处理流水线 |
| [docs/CONTRACTS.md](docs/CONTRACTS.md) | 类型定义 + API 契约（前后端并行开发的唯一依据） |
| [docs/DATA_SPEC.md](docs/DATA_SPEC.md) | 虚构数据规格、知识库文档、评测集 |
| [docs/TASKS.md](docs/TASKS.md) | 任务看板 |
| [docs/prompts/](docs/prompts/) | 每个任务的提示词 |

## 常见情况怎么办

| 情况 | 怎么做 |
|---|---|
| GitHub 显示 PR 有冲突（常见于两个 Agent 都加了依赖，`package.json` / `package-lock.json` 冲突） | 把 PR 交回给开它的 Agent：「main 有新提交，把本分支 rebase 到最新 main，解决冲突，重新跑 typecheck 后推送」 |
| Agent 说它做不到 / 卡住了 | 把它的原话转给 Claude，Claude 会改任务卡或拆小 |
| Agent 改了不该改的文件 | 不要合并，告诉 Claude，Claude 会写一段纠正提示词 |
| 不确定要不要合并 | 告诉 Claude「T0X 开了 PR」，让 Claude 先审 |
| 想重置演示数据 | `npm run seed`，或卖家端 设置 → 重置演示数据 |
