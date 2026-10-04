import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleMessage } from '../lib/brain/pipeline';
import { drainBackgroundTasks } from '../lib/brain/background';
import { decideWithMock } from '../lib/brain/decide';
import { clearStoreCache } from '../lib/store';
import { closeConversation, getConversation, listTraces, releaseConversation } from '../lib/store/conversations';
import { resetDemoData } from '../lib/store/reset';
import type { DecideResult } from '../lib/types';

// Controlled upstream fixtures exercise ordering and persistence, not model quality.
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const decision = (): DecideResult => ({ ...decideWithMock('你好'), provider: 'jev', risk: { ...decideWithMock('你好').risk, health_safety: 0.95, legal_threat: 0.95 }, costUsd: 0.00006 });
async function main() {
  const root = process.cwd();
  const temp = mkdtempSync(join(tmpdir(), 'qimu-t05b-'));
  const originalFetch = globalThis.fetch;
  const env = { ...process.env };
  const pending: { resolve: (value: Response) => void; reject: (error: Error) => void }[] = [];
  const finish = (index: number, content = '模型摘要：买家报告红疹与投诉诉求，需人工核实。', finishReason = 'stop') => pending[index].resolve(Response.json({ choices: [{ finish_reason: finishReason, message: { content } }], usage: { cost: 0.0002 } }));
  const send = (decide = async () => decision(), conversationId?: string) => handleMessage({ buyerId: 'B002', conversationId, text: '穿了全身起红疹 不处理就去12315', debug: true }, { decide });
  try {
    cpSync(join(root, 'data/seed'), join(temp, 'data/seed'), { recursive: true });
    process.chdir(temp); clearStoreCache();
    process.env.OPENROUTER_API_KEY = 'fixture-key'; process.env.CLASSIFIER_PROVIDER = 'jev';
    process.env.GENERATION_MODEL = 'fixture-summary'; process.env.JEV_KEEPALIVE_MS = '0'; process.env.KEYWORD_RISK_WAIT_MS = '2500';
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, 'fixture-summary');
      return new Promise<Response>((resolve, reject) => pending.push({ resolve, reject }));
    };

    let resolveDecision!: (value: DecideResult) => void;
    const slowDecision = new Promise<DecideResult>(resolve => { resolveDecision = resolve; });
    const started = Date.now();
    const early = await send(() => slowDecision);
    assert(Date.now() - started < 3000);
    assert(early.messages.some(m => m.role === 'system' && m.text.includes('转接人工')));
    assert.match(early.conversation.handoffSummary!, /^买家/);
    assert.equal(early.conversation.mode, 'human');
    assert.equal(early.conversation.status, 'waiting_human');
    assert(early.conversation.handoffAt); assert(early.conversation.unreadForSeller > 0);
    finish(0); await tick();
    assert.match(getConversation(early.conversation.id)!.handoffSummary!, /^模型摘要/);
    resolveDecision(decision()); await drainBackgroundTasks();
    const first = listTraces({ conversationId: early.conversation.id });
    assert.equal(first.length, 1); assert(first[0].usedGeneration);
    assert.equal(first[0].cost.generationUsd, 0.0002);
    assert(Math.abs(first[0].cost.totalUsd - 0.00026) < 1e-12);
    console.log('PASS 关键词分类等待<3秒、模板/系统消息/红点可用；摘要先完成，迟到分类费用落入唯一trace');

    const late = await send(); await tick();
    assert.equal(listTraces({ conversationId: late.conversation.id }).length, 1);
    const forwarded = await handleMessage({ buyerId: 'B002', conversationId: late.conversation.id, text: '补充一下', debug: true });
    assert.equal(forwarded.messages.length, 1);
    finish(1); await drainBackgroundTasks();
    const traces = listTraces({ conversationId: late.conversation.id });
    assert.equal(traces.length, 2); assert.equal(getConversation(late.conversation.id)?.lastLayer, 'human');
    assert.equal(traces[0].cost.generationUsd, 0.0002); assert(Math.abs(traces[0].cost.totalUsd - 0.00026) < 1e-12);
    assert.equal(traces[1].cost.totalUsd, 0);
    console.log('PASS trace先落盘，摘要费用不重复计/不新增trace/不覆盖较新轮lastLayer');

    // Non-L1 model risk persists a copy of the trace synchronously.
    const modelRisk = await handleMessage({ buyerId: 'B002', text: '需要核实一下', debug: true }, { decide: async () => ({ ...decision(), risk: { ...decision().risk, health_safety: 1 } }) });
    finish(2); await drainBackgroundTasks();
    const modelTrace = listTraces({ conversationId: modelRisk.conversation.id });
    assert.equal(modelTrace.length, 1); assert(modelTrace[0].usedGeneration);
    assert(Math.abs(modelTrace[0].cost.totalUsd - 0.00026) < 1e-12);
    console.log('PASS 非L1模型风险转人工同样后台补记费用');

    const old = await send(); await tick();
    releaseConversation(old.conversation.id);
    const newer = await send(undefined, old.conversation.id); await tick();
    finish(4, '新一轮模型摘要'); await tick();
    finish(3, '旧一轮摘要不得覆盖'); await drainBackgroundTasks();
    assert.equal(getConversation(newer.conversation.id)?.handoffSummary, '新一轮模型摘要');
    assert(listTraces({ conversationId: old.conversation.id }).every(t => t.cost.generationUsd === 0.0002));
    console.log('PASS 固定演示时间下release后再次转人工，旧摘要不覆盖新摘要；旧轮费用仍记');

    const released = await send(); await tick();
    releaseConversation(released.conversation.id);
    finish(5, '交还后不得更新'); await drainBackgroundTasks();
    assert.equal(getConversation(released.conversation.id)?.mode, 'ai');
    assert.notEqual(getConversation(released.conversation.id)?.handoffSummary, '交还后不得更新');
    const closed = await send(); await tick(); closeConversation(closed.conversation.id);
    finish(6, '关闭后不得更新'); await drainBackgroundTasks();
    assert.notEqual(getConversation(closed.conversation.id)?.handoffSummary, '关闭后不得更新');

    const failed = await send(); await tick(); pending[7].reject(new Error('fixture failure')); await drainBackgroundTasks();
    assert.match(getConversation(failed.conversation.id)!.handoffSummary!, /^买家/);
    const truncated = await send(); await tick(); finish(8, '截断摘要', 'length'); await drainBackgroundTasks();
    assert.match(getConversation(truncated.conversation.id)!.handoffSummary!, /^买家/);
    assert.equal(listTraces({ conversationId: truncated.conversation.id })[0].cost.generationUsd, 0.0002);
    console.log('PASS release/close保护、错误保留模板、截断不写摘要但实际费用保留');

    // Reset and reuse IDs, identical text and DEMO_NOW; the epoch must reject old work.
    await resetDemoData();
    const stale = await send(); await tick();
    await resetDemoData();
    const replacement = await send(); await tick();
    assert.equal(stale.conversation.id, replacement.conversation.id);
    finish(9, '重置前的旧摘要'); await tick();
    assert.match(getConversation(replacement.conversation.id)!.handoffSummary!, /^买家/);
    assert.equal(listTraces({ conversationId: replacement.conversation.id })[0].cost.generationUsd, 0);
    finish(10, '重置后的新摘要'); await drainBackgroundTasks();
    assert.equal(getConversation(replacement.conversation.id)?.handoffSummary, '重置后的新摘要');
    assert.equal(listTraces({ conversationId: replacement.conversation.id })[0].cost.generationUsd, 0.0002);
    console.log('PASS 重置后同ID/同文案/同时间，旧摘要和费用均不污染新轮');

    process.env.OPENROUTER_API_KEY = ''; process.env.CLASSIFIER_PROVIDER = 'mock';
    const mock = await send(); await drainBackgroundTasks();
    assert.match(mock.conversation.handoffSummary!, /^买家/); assert.equal(pending.length, 11);
    console.log('PASS 无key/mock完整转人工，无摘要模型请求');
  } finally {
    globalThis.fetch = originalFetch;
    process.chdir(root); process.env = env; clearStoreCache();
    rmSync(temp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
