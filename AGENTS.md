# AGENTS.md — 所有 AI 编码 Agent 必读

本仓库由多个 AI Agent 协作开发：**Claude 是总指挥**（写规格、拆任务、审查），**Codex** 负责后端/大脑/数据，**Cursor** 负责前端界面。人类成员不写代码，只负责调度和验收。所以：**你写的东西必须能直接跑、直接看到效果，并且留下清楚的交接记录。**

## 1. 开工前必读（按顺序）

1. `docs/TASKS.md` — 找到分配给你的任务卡，读完验收标准
2. `docs/CONTRACTS.md` — 类型和 API 契约，**严格遵守**
3. `docs/ARCHITECTURE.md` — 系统怎么运转
4. 任务卡里列出的其他文档（PRD / DATA_SPEC）
5. `docs/handoff/`（别人的交接记录）和 `docs/questions/`（含 Claude 的答复）— 了解别人做到哪、有没有和你相关的答复

## 2. 每个任务的标准流程

**工作文件夹**：人类电脑上有两份独立克隆——`客服 agent/` 归 Codex，`qimu-frontend/` 归 Cursor。只在自己的文件夹里操作，不要去另一个文件夹切分支或改文件；两边通过 GitHub 的 main 分支同步。

```bash
git checkout main && git pull origin main
git checkout -b t<编号>-<短名>        # 例：t05-brain-pipeline
# …干活…
npm run typecheck && npm run lint     # 必须通过
# 任务卡要求的自测（脚本 / 页面截图 / curl）
```

完成后：

1. 新建交接文件 `docs/handoff/T<编号>.md`（格式见 `docs/handoff/README.md`）。**一个任务一个文件**，这样两个 Agent 并行时不会产生合并冲突。
2. **不要修改 `docs/TASKS.md`**（状态由 Claude 维护）。
3. 提交并推送，开 PR：标题 `T<编号>: <任务名>`，正文贴上交接文件内容
4. 如果有 `gh` CLI：`gh pr create --fill`；没有就告诉人类去 GitHub 网页开 PR

## 3. 目录归属（防止两个 Agent 改同一个文件）

| 目录 | 归属 |
|---|---|
| `lib/brain/**` `lib/tools/**` `lib/rag/**` `lib/store/**` `lib/llm/**` | Codex |
| `app/api/**` `data/seed/**` `scripts/**` `docs/reports/**` | Codex |
| `app/(shop)/**` `app/seller/**` `components/**` `public/**` `app/globals.css` `app/manifest.ts` `lib/mock/**` | Cursor |
| `lib/types.ts` `docs/PRD.md` `docs/ARCHITECTURE.md` `docs/CONTRACTS.md` `docs/DATA_SPEC.md` `docs/TASKS.md` `docs/DECISIONS.md` `data/eval/**` | **Claude（总指挥）** — Agent 不得修改 |
| `lib/api-client.ts` | Cursor（前端调用 API 的唯一入口） |
| `lib/store/conversations.ts` `lib/store/reset.ts` `lib/rules/**` `lib/analytics/**` `app/api/conversations/**` `app/api/rules/**` `app/api/traces/**` `app/api/admin/**` `app/api/analytics/**` `scripts/gen-traffic.ts` `scripts/try-conversation-api.ts` | **Cursor**（2026-10-04 重排，T16 / T17）。Codex 只调用、不修改 |
| `lib/eval/**` `scripts/eval.ts` `app/api/eval/**` `docs/reports/T06-eval.md` `data/seed/eval_latest.json` | **Cursor**（T06 改派） |
| `lib/brain/handlers/index.ts` `lib/brain/handlers/read.ts` `lib/brain/risk.ts` `lib/brain/risk.test.ts` `lib/brain/caution.ts` `lib/brain/trace.ts` `lib/brain/decide/warmup.ts` `lib/tools/recommend-size.ts` | ~~Cursor（T08 特批）~~ **已归还 Codex**（2026-10-04 T08 合并后） |
| `docs/reports/T06-eval.md` `docs/reports/T06-eval.json` `data/seed/eval_latest.json` `docs/handoff/T06.md`（只补对比） | **Codex**（T05b 补跑评测特批） |
| `lib/store/reset-hooks.ts` | 共用登记表：Codex 和 Cursor 都可以**只加 import 行** |
| `package.json` | 谁需要谁加依赖，PR 里写明新增了哪些包 |
| `docs/handoff/T<编号>.md` `docs/questions/T<编号>-*.md` | 该任务的负责 Agent（只新建自己的文件） |

需要改不属于你的文件？**不要改**，在 `docs/questions/` 新建一个问题文件（`T<编号>-<序号>.md`），然后用临时方案（mock / TODO）继续推进，不要停工等待。

## 4. 契约规则

- `lib/types.ts` 和 `docs/CONTRACTS.md` 是前后端唯一的约定。后端返回的 JSON、前端读取的字段都必须与之一致。
- 发现契约有缺陷：在 `docs/questions/` 写「契约变更请求」，说明原因和建议，**不要自己改**。
- 契约里没写但你需要的**内部**类型，放在你自己目录里，不要放进 `lib/types.ts`。

## 5. 技术约定

- Next.js（App Router）+ TypeScript strict + Tailwind CSS。Node 20+。
- 不引入数据库软件。数据层是 `lib/store`：启动时读 `data/seed/*.json`，运行时写入 `data/runtime/*.json`（已 gitignore）。`npm run seed` 重置。
- 所有大模型调用走 OpenRouter，密钥只从环境变量读：`OPENROUTER_API_KEY`。**绝不硬编码、绝不提交密钥、绝不打印密钥。**
- 模型 ID 一律读环境变量（见 `.env.example`），不要写死在代码里。
- 每个调用外部模型的函数都要：超时（默认 8s）、错误兜底、记录 `latencyMs` 和 `costUsd`。
- 没有 API key 时，系统必须能以 `mock` 模式完整跑通（分类器用关键词、LLM 回复用模板），保证前端可以独立开发和演示。
- 界面文字一律中文；代码、注释、变量名用英文。
- 日期：虚构数据以 `DEMO_NOW = 2026-10-05T10:00:00+08:00` 为"当前时间"，从 `lib/demo-clock.ts` 读取，不要用 `new Date()` 判断业务时间。

## 6. 质量底线

- 不要为了"能跑"删掉验收标准里的功能，也不要假装完成。做不完就在交接文件里写清楚哪些没做、为什么。
- 不要大规模重构不属于本任务的代码。
- 写代码前先想清楚，写完自己跑一遍。PR 里附上你实际运行过的命令及其输出摘要，或页面截图。
- 遇到外部 API 返回格式和文档不一致：以实际返回为准，在交接文件里记录差异。

## 7. 常用命令

```bash
npm run dev         # 启动开发服务器
npm run seed        # 重置虚构数据
npm run typecheck   # tsc --noEmit
npm run lint
npm run eval        # 跑评测集（T07 之后可用）
npx tsx scripts/try-decide.ts "一句话"   # 看分类器怎么判断（T01 之后可用）
```
