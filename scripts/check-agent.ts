import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHandlerContext } from '../lib/brain/handlers/context';
import { runAgent, AGENT_BUDGET_MS } from '../lib/brain/agent';
import { handleMessage } from '../lib/brain/pipeline';
import { getOrder } from '../lib/store/collections';
import { clearStoreCache } from '../lib/store';
import { createConversation, getConversation, listPendingActions, releaseConversation } from '../lib/store/conversations';
import { buildKnowledgeIndex } from '../lib/rag';
import { resetDemoData } from '../lib/store/reset';
import '../lib/rag/reset-hook';
import { decideWithMock } from '../lib/brain/decide';
import type { LlmMessage } from '../lib/llm/openrouter';

// Explicit model fixtures verify orchestration/safety, not real model quality.
async function main() {
  const root = process.cwd();
  const temp = mkdtempSync(join(tmpdir(), 'qimu-t05-check-'));
  const originalFetch = globalThis.fetch;
  const env = { ...process.env };
  let sequence: { name: string; args: unknown }[][] = [];
  let round = 0;
  let embeddingCalls = 0;
  let inputs: LlmMessage[][] = [];
  let fail = false;
  try {
    cpSync(join(root, 'data/seed'), join(temp, 'data/seed'), { recursive: true });
    process.chdir(temp); clearStoreCache();
    process.env.OPENROUTER_API_KEY = 'fixture-key'; process.env.CLASSIFIER_PROVIDER = 'jev';
    process.env.AGENT_MODEL = 'fixture-agent'; process.env.GENERATION_MODEL = 'fixture-generation'; process.env.EMBEDDING_MODEL = 'fixture-embedding'; process.env.JEV_KEEPALIVE_MS = '0';
    globalThis.fetch = async (url, init) => {
      const body = JSON.parse(String(init?.body));
      if (String(url).endsWith('/embeddings')) {
        embeddingCalls++;
        return Response.json({ data: body.input.map((_: string, index: number) => ({ index, embedding: [1, 2, 3] })), usage: { cost: 0.001 } });
      }
      if (fail) throw new Error('fixture upstream failure');
      if (body.model === 'fixture-generation') return Response.json({ choices: [{ finish_reason: 'stop', message: { content: '买家需求需要人工继续核实。' } }], usage: { cost: 0.0002 } });
      assert.equal(body.reasoning.enabled, false);
      inputs.push(structuredClone(body.messages));
      const tools = sequence[round++] ?? [];
      return Response.json({ choices: [{ finish_reason: tools.length ? 'tool_calls' : 'stop', message: { content: tools.length ? null : '已准备确认卡片，请确认后办理。', ...(tools.length ? { tool_calls: tools.map((t, i) => ({ id: `call-${round}-${i}`, type: 'function', function: { name: t.name, arguments: JSON.stringify(t.args) } })) } : {}) } }], usage: { cost: 0.001 } });
    };
    const order = structuredClone(getOrder('QM2026092801'));
    const setup = (steps: typeof sequence) => {
      sequence = steps; round = 0; inputs = []; fail = false;
      const c = createConversation('B001');
      return createHandlerContext({ buyerId: 'B001', conversationId: c.id }, c.state, '换L并查券', 'multi_step_complex');
    };
    const ctx = setup([ [{ name: 'check_stock', args: { productId: 'P007', size: 'L', color: '燕麦色' } }], [{ name: 'request_exchange', args: { orderId: 'QM2026092801', itemId: 'QM2026092801-1', newSize: 'L' } }], [{ name: 'list_coupons', args: {} }]]);
    ctx.text = '上周外套换成L码，顺便看看券';
    const result = await runAgent(ctx);
    assert.equal(result.status, 'awaiting_confirm');
    assert.deepEqual(ctx.metrics.toolCalls.map(t => t.name), ['list_orders', 'check_stock', 'request_exchange', 'list_coupons']);
    assert.equal(ctx.metrics.agentUsd, 0.003); assert.equal(ctx.metrics.generationUsd, 0);
    assert.equal(result.messages.filter(m => m.card?.kind === 'confirm').length, 1);
    const coupons = result.messages.find(m => m.card?.kind === 'coupons')!.card;
    assert(coupons?.kind === 'coupons'); assert(coupons.coupons.every(c => !c.used && Date.parse(c.expiresAt) > Date.parse('2026-10-05T10:00:00+08:00')));
    assert.deepEqual(getOrder('QM2026092801'), order);
    assert(inputs[1].some(m => m.role === 'tool')); assert(inputs[0][1].content?.includes('本次需求'));
    const double = createConversation('B003');
    const doubleCtx = createHandlerContext({ buyerId: 'B003', conversationId: double.id }, double.state, '两个订单，没付款的取消，已经付了的改地址到浙江省 杭州市 西湖区 文三路88号', 'multi_step_complex');
    sequence = [[{ name: 'cancel_order', args: { orderId: 'QM2026100402' } }, { name: 'modify_address', args: { orderId: 'QM2026100401', address: { name: '周野', phone: '137****0303', region: '浙江省 杭州市 西湖区', detail: '文三路88号' } } }]]; round = 0;
    const two = await runAgent(doubleCtx);
    assert.equal(two.messages.filter(m => m.card?.kind === 'confirm').length, 2);
    assert.equal(getOrder('QM2026100402')!.status, 'pending_payment');
    assert.notEqual(getOrder('QM2026100401')!.address.detail, '文三路88号');
    console.log('PASS 两个写操作各自生成确认、订单和原地址未修改');
    console.log('PASS 真实工具编排、独立agent费用、只创建确认、过期券过滤、结果回馈模型');

    for (const [label, steps] of [
      ['unknown tool', [[{ name: 'confirm_pending_action', args: {} }]]],
      ['invalid args', [[{ name: 'get_order', args: { orderId: 'QM2026092801', buyerId: 'B002' } }]]],
      ['cross buyer', [[{ name: 'get_order', args: { orderId: 'QM2026100401' } }]]],
      ['handoff', [[{ name: 'create_handoff', args: { reason: '需要人工核实' } }]]],
      ['tool cap', [Array.from({ length: 7 }, () => ({ name: 'list_coupons', args: {} }))]],
      ['no tool facts', []],
    ] as [string, typeof sequence][]) {
      const testCtx = setup(structuredClone(steps));
      assert((await runAgent(testCtx)).handoffReason, label);
      assert.equal(listPendingActions(testCtx.toolContext.conversationId).length, 0);
    }
    const failedCtx = setup([]); fail = true; assert((await runAgent(failedCtx)).handoffReason); fail = false;
    console.log('PASS 未知工具、非法参数、越权、主动转人工、6次上限、空工具回答、网络异常安全兜底');

    const timeoutCtx = setup([[{ name: 'get_order', args: { orderId: 'QM2026092801' } }]]);
    timeoutCtx.text = '复杂问题';
    const timerStart = Date.now();
    let release!: (value: unknown) => void;
    timeoutCtx.call = <T>() => new Promise<T>(r => { release = value => r(value as T); });
    assert((await runAgent(timeoutCtx)).handoffReason);
    assert(Date.now() - timerStart < AGENT_BUDGET_MS + 500);
    release([]); await new Promise(r => setTimeout(r, 10));
    assert.equal(round, 1); assert.equal(listPendingActions(timeoutCtx.toolContext.conversationId).length, 0);
    console.log(`PASS 工具挂起总超时 ${Date.now() - timerStart}ms，迟到结果不会继续调用/写入`);

    process.env.OPENROUTER_API_KEY = ''; process.env.CLASSIFIER_PROVIDER = 'mock';
    const mock = await handleMessage({ buyerId: 'B001', text: '换L顺便看看券', debug: true }, { decide: async () => { const d = decideWithMock('换L顺便看看券'); d.multiStep = 1; return d; } });
    assert.equal(mock.trace!.layer, 'human'); assert.equal(mock.trace!.escalatedFrom, 'L3');
    assert.equal(mock.conversation.status, 'waiting_human'); assert(mock.conversation.handoffAt);
    assert.match(mock.conversation.handoffSummary!, /买家林小满/);
    const unread = mock.conversation.unreadForSeller;
    const forwarded = await handleMessage({ buyerId: 'B001', conversationId: mock.conversation.id, text: '补充情况', debug: true });
    assert.equal(forwarded.messages.length, 1); assert.equal(forwarded.conversation.unreadForSeller, unread + 1);
    releaseConversation(mock.conversation.id);
    const resumed = await handleMessage({ buyerId: 'B001', conversationId: mock.conversation.id, text: '在吗', debug: true });
    assert(resumed.messages.some(m => m.role === 'ai')); assert.equal(getConversation(mock.conversation.id)?.handoffAt, undefined);
    console.log('PASS 无key/mock转人工、中文模板、人工消息只转发且未读+1、release恢复AI');

    process.env.OPENROUTER_API_KEY = 'fixture-key'; process.env.CLASSIFIER_PROVIDER = 'jev';
    await buildKnowledgeIndex(); const firstCalls = embeddingCalls; assert(firstCalls > 0);
    const saved = readFileSync(join(temp, 'data/runtime/embedding_cache.json'), 'utf8');
    const resetStarted = Date.now(); await resetDemoData();
    assert.equal(embeddingCalls, firstCalls); assert.equal(readFileSync(join(temp, 'data/runtime/embedding_cache.json'), 'utf8'), saved);
    console.log(`PASS reset缓存内容保留、重复索引0次embedding、耗时 ${Date.now() - resetStarted}ms`);
    const kbFile = join(temp, 'data/seed/kb', 'FAQ.md');
    writeFileSync(kbFile, '# 新增内容\n可复用缓存的测试新增分块。\n');
    await buildKnowledgeIndex(); assert.equal(embeddingCalls, firstCalls + 1);
    console.log('PASS 内容变化只请求新增分块、其他文档复用缓存');
    process.env.EMBEDDING_MODEL = 'fixture-different-model'; await buildKnowledgeIndex(); assert(embeddingCalls > firstCalls);
    console.log('PASS 模型变化使缓存失效');
    console.log('T05 安全与缓存自测全部通过（模型响应为明确标记的fixture）');
  } finally { globalThis.fetch = originalFetch; process.env = env; process.chdir(root); clearStoreCache(); rmSync(temp, { recursive: true, force: true }); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
