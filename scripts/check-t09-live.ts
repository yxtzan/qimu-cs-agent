/** Live T09 transcript and tool provenance, using isolated seed data; never logs headers or env. */
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadLocalEnv } from '../lib/llm/env';
import { hasApiKey } from '../lib/llm/openrouter';
import { handleMessage } from '../lib/brain/pipeline';
import { runAgent } from '../lib/brain/agent';
import { createHandlerContext } from '../lib/brain/handlers/context';
import { updateState } from '../lib/brain/state';
import { decide, decideWithJev } from '../lib/brain/decide';
import { drainBackgroundTasks } from '../lib/brain/background';
import { clearStoreCache } from '../lib/store';
import { appendMessages, createConversation, listTraces, updateConversation } from '../lib/store/conversations';
import { toolRegistry } from '../lib/tools/registry';
import { buildKnowledgeIndex } from '../lib/rag';
import { loadCases, type EvalCase } from '../lib/eval/run';

async function main() {
  loadLocalEnv(); assert(hasApiKey(), '需要本地已配置的 OPENROUTER_API_KEY');
  process.env.CLASSIFIER_PROVIDER = 'jev'; process.env.JEV_KEEPALIVE_MS = '0';
  const args = process.argv.slice(2);
  const param = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
  const selected = (param('--only') ?? 'E39,E50,E53,E56,E57,Q1,Q2,Q3,Q4,Q5').split(',');
  const allCases: EvalCase[] = [...loadCases(),
    { id: 'Q1', buyerId: 'B001', input: { text: '这件是防过敏面料吗' }, setup: { context: { productId: 'P013' } }, expect: { layer: ['L2', 'L3'], handoff: false } },
    { id: 'Q2', buyerId: 'B001', input: { text: '我闺蜜是律师，她说这件挺好看' }, expect: { layer: ['L2', 'L3'], handoff: false } },
    { id: 'Q3', buyerId: 'B002', input: { text: '穿了全身起红疹 不处理就去12315' }, expect: { layer: 'risk_gate', handoff: true } },
    { id: 'Q4', buyerId: 'B002', input: { text: '穿了一天脖子痒得睡不着' }, expect: { layer: 'risk_gate', handoff: true } },
    { id: 'Q5', buyerId: 'B001', input: { text: '我要让所有人都知道你们家东西什么质量' }, expect: { layer: 'risk_gate', handoff: true } },
  ];
  const cases = allCases.filter(c => selected.includes(c.id));
  const root = process.cwd(); const temp = mkdtempSync(join(tmpdir(), 'qimu-t09-live-'));
  const fetchOriginal = globalThis.fetch;
  const originals = new Map([...toolRegistry].map(([name, def]) => [name, def.run]));
  const records: unknown[] = [];
  let toolResults: unknown[] = []; let modelReplies: unknown[] = [];
  try {
    cpSync(join(root, 'data/seed'), join(temp, 'data/seed'), { recursive: true });
    cpSync(join(root, 'data/seed'), join(temp, 'data/runtime'), { recursive: true });
    const cache = join(root, 'data/runtime/embedding_cache.json');
    if (existsSync(cache)) cpSync(cache, join(temp, 'data/runtime/embedding_cache.json'));
    process.chdir(temp); clearStoreCache(); await buildKnowledgeIndex();
    if (args.includes('--warmup')) {
      try {
        const warm = await decideWithJev({ stateForModel: {}, message: '你好', timeoutMs: 8000 });
        console.log(JSON.stringify({ source: 'Jev 预热（不计入用例成绩或延迟）', latencyMs: warm.latencyMs, costUsd: warm.costUsd }));
      } catch { console.log('Jev 预热失败；用例仍按真实降级结果记录'); }
    }
    for (const [name, def] of toolRegistry) def.run = async (input, ctx) => {
      const result = await originals.get(name)!(input, ctx);
      toolResults.push({ name, args: input, result }); return result;
    };
    globalThis.fetch = async (url, init) => {
      const result = await fetchOriginal(url, init);
      if (String(url).endsWith('/chat/completions') && JSON.parse(String(init?.body)).model === process.env.AGENT_MODEL) {
        const body = await result.clone().json();
        modelReplies.push({ toolChoice: JSON.parse(String(init?.body)).tool_choice, ...body.choices?.[0] });
      }
      return result;
    };
    for (const c of cases) {
      let conversationId: string | undefined;
      toolResults = []; modelReplies = [];
      if (args.includes('--direct-agent')) {
        assert(!c.setup?.prior?.length && c.input.text, '直接 Agent 验证只支持单轮文字用例');
        const conversation = createConversation(c.buyerId);
        const state = updateState(conversation, c.input.text, c.setup?.context);
        updateConversation(conversation.id, { state }); appendMessages(conversation.id, [{ role: 'buyer', text: c.input.text }]);
        const ctx = createHandlerContext({ buyerId: c.buyerId, conversationId: conversation.id }, state, c.input.text, c.expect.intent ?? 'multi_step_complex');
        const before = Date.now(); const result = await runAgent(ctx);
        const record = { id: c.id, agentModel: process.env.AGENT_MODEL, source: '真实模型直接调用 L3；不经过分类器或风险闸门，不计入评测成绩', responseMs: Date.now() - before, result, metrics: ctx.metrics, tools: toolResults, modelReplies };
        records.push(record); console.log(JSON.stringify(record)); continue;
      }
      const decisions: unknown[] = [];
      let last: Awaited<ReturnType<typeof handleMessage>> | undefined;
      let responseMs = 0;
      for (const input of [...(c.setup?.prior ?? []), c.input]) {
        const before = Date.now();
        last = await handleMessage({ buyerId: c.buyerId, conversationId, ...input, context: c.setup?.context, debug: true }, {
          decide: async (state, message) => {
            let d;
            if (param('--jev-timeout')) {
              try { d = await decideWithJev({ stateForModel: state, message, timeoutMs: Number(param('--jev-timeout')) }); }
              catch { d = { ...await decide(state, message, { provider: 'llm' }), error: '本次验收人为设置 Jev 超时，随后正常 LLM 兜底' }; }
            } else d = await decide(state, message);
            decisions.push(d); return d;
          },
        });
        responseMs = Date.now() - before;
        conversationId = last.conversation.id; await drainBackgroundTasks();
      }
      assert(last);
      const trace = listTraces({ conversationId }).find(t => t.messageId === last!.messages[0].id);
      if (param('--jev-timeout')) assert(responseMs < 3000, '关键词转人工必须在3秒以内');
      const record = { id: c.id, agentModel: process.env.AGENT_MODEL, input: c.input, context: c.setup?.context, responseMs, decisions, trace, status: last.conversation.status,
        messages: last.messages.filter(m => m.role !== 'buyer'), tools: toolResults, modelReplies };
      records.push(record);
      console.log(JSON.stringify(record));
    }
    writeFileSync(resolve(root, param('--report') ?? 'docs/reports/T09-live.json'), JSON.stringify(records, null, 2) + '\n');
  } finally {
    await drainBackgroundTasks(); globalThis.fetch = fetchOriginal;
    for (const [name, run] of originals) toolRegistry.get(name)!.run = run;
    process.chdir(root); clearStoreCache(); rmSync(temp, { recursive: true, force: true });
  }
}
main().then(() => process.exit(0)).catch(error => { console.error(error instanceof Error ? error.message : '验收失败'); process.exit(1); });
