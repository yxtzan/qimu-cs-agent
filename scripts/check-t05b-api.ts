import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import type { ChatResponse } from '../lib/brain/pipeline';
import type { ChatMessage, Conversation, RouteTrace } from '../lib/types';

const base = process.argv[2] ?? 'http://localhost:3002';
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${base}/api${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  assert(response.ok, `${path}: ${response.status}`);
  return response.json() as Promise<T>;
}
async function main() {
  // Compile the dev route before measuring business latency; no model request.
  await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  await api('/admin/reset', {});
  const started = Date.now();
  const result = await api<ChatResponse>('/chat', { buyerId: 'B002', text: '穿了全身起红疹 不处理就去12315', debug: true });
  const responseMs = Date.now() - started;
  assert(responseMs < 1000, `买家等待 ${responseMs}ms，应 <1000ms`);
  assert(result.trace && result.trace.latency.totalMs < 1000);
  assert.equal(result.trace.layer, 'risk_gate');
  assert.equal(result.conversation.mode, 'human');
  assert.equal(result.conversation.status, 'waiting_human');
  assert.match(result.conversation.handoffSummary!, /^买家/);
  assert(result.messages.some(m => m.role === 'system' && m.text.includes('转接人工')));
  console.log(`PASS 买家 HTTP ${responseMs}ms，trace ${result.trace.latency.totalMs}ms；模板摘要立即可用`);
  let final: { conversation: Conversation; messages: ChatMessage[]; traces: RouteTrace[] } | undefined;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const detail = await api<{ conversation: Conversation; messages: ChatMessage[]; traces: RouteTrace[] }>(`/conversations/${result.conversation.id}`);
    final = detail;
    const trace = detail.traces.find(t => t.id === result.trace!.id);
    if (detail.conversation.handoffSummary !== result.conversation.handoffSummary && (trace?.cost.generationUsd ?? 0) > 0 && trace?.decideProvider) break;
    await new Promise<void>(resolve => setTimeout(resolve, 250));
  }
  assert(final);
  assert.notEqual(final.conversation.handoffSummary, result.conversation.handoffSummary, '真实模型摘要应稍后替换模板');
  const matching = final.traces.filter(t => t.messageId === result.messages[0].id);
  assert.equal(matching.length, 1);
  const trace = matching[0];
  assert(trace.usedGeneration); assert(trace.cost.generationUsd > 0);
  assert(Math.abs(trace.cost.totalUsd - trace.cost.decideUsd - trace.cost.generationUsd - trace.cost.agentUsd) < 1e-10);
  console.log(`PASS 卖家稍后看到真实摘要；generationUsd=$${trace.cost.generationUsd}，唯一trace费用合计正确`);
  console.log(`卖家页面：${base}/seller/c/${result.conversation.id}`);
  if (process.argv.includes('--report')) writeFileSync('docs/reports/T05b-handoff-live.json', JSON.stringify({ base, measuredAt: new Date().toISOString(), responseMs, initialSummary: result.conversation.handoffSummary, modelSummary: final.conversation.handoffSummary, summaryObservedMs: Date.now() - started, initialTrace: result.trace, finalTrace: trace }, null, 2) + '\n');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
