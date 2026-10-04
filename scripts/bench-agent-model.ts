import { loadLocalEnv } from '../lib/llm/env';
import { chatCompletion } from '../lib/llm/openrouter';
import { toOpenAITools } from '../lib/tools/registry';
import { getOrder } from '../lib/store/collections';
import { AGENT_SYSTEM_PROMPT } from '../lib/brain/prompts/agent';
loadLocalEnv();
async function main() {
  for (const model of [...new Set([process.env.AGENT_MODEL, process.env.GENERATION_MODEL])]) {
    const start = Date.now();
    try {
      const r = await chatCompletion({ model, messages: [{ role: 'system', content: AGENT_SYSTEM_PROMPT }, { role: 'user', content: JSON.stringify({ 当前时间: '2026-10-05T10:00:00+08:00', 需求: '外套换L并查券', 已查询订单: getOrder('QM2026092801') }) }], tools: toOpenAITools().filter(t => ['check_stock', 'create_handoff'].includes(t.function.name)), reasoning: { enabled: false }, temperature: 0, maxTokens: 300, timeoutMs: 8000 });
      console.log(JSON.stringify({ model, ms: Date.now() - start, costUsd: r.costUsd, finish: r.data.finishReason, tools: r.data.toolCalls, reasoningReturned: Boolean(r.data.reasoning || r.data.reasoningDetails) }));
    } catch(e) { console.log(JSON.stringify({ model, ms: Date.now() - start, error: e instanceof Error ? e.name : 'UnknownError' })); }
  }
}
main().catch(e => { console.error(e.name); process.exitCode = 1; });
