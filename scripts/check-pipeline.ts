import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLocalEnv } from '../lib/llm/env';
import { handleMessage, type ChatResponse } from '../lib/brain/pipeline';
import { drainBackgroundTasks } from '../lib/brain/background';
import { createHandlerContext } from '../lib/brain/handlers/context';
import { consult } from '../lib/brain/handlers/consult';
import { getProduct } from '../lib/store/collections';
import { decideWithMock } from '../lib/brain/decide';
import { buildKnowledgeIndex } from '../lib/rag';
import { clearStoreCache, writeCollection } from '../lib/store';
import { getOrder, getRule } from '../lib/store/collections';
import { createConversation, getConversation, listMessages, listTraces, releaseConversation, takeoverConversation } from '../lib/store/conversations';
import type { ChatCard, DecideResult } from '../lib/types';

async function main() {
  loadLocalEnv();
  const root = process.cwd();
  const temp = mkdtempSync(join(tmpdir(), 'qimu-t04-pipeline-'));
  const live = process.argv.includes('--live');
  const originalKey = process.env.OPENROUTER_API_KEY;
  const originalProvider = process.env.CLASSIFIER_PROVIDER;
  const records: { buyer: string; text: string; response: ChatResponse; finalTrace: unknown }[] = [];
  process.env.JEV_KEEPALIVE_MS = '0';
  try {
    cpSync(join(root, 'data/seed'), join(temp, 'data/seed'), { recursive: true });
    process.chdir(temp); clearStoreCache();
    process.env.OPENROUTER_API_KEY = ''; process.env.CLASSIFIER_PROVIDER = 'mock';
    await buildKnowledgeIndex();
    if (live) { process.env.OPENROUTER_API_KEY = originalKey; process.env.CLASSIFIER_PROVIDER = originalProvider || 'jev'; assert(originalKey, '--live 需要已有 key'); }
    async function send(buyerId: string, text: string, conversationId?: string, context?: { productId?: string; orderId?: string }) {
      const response = await handleMessage({ buyerId, text, conversationId, context, debug: true });
      await drainBackgroundTasks();
      const finalTrace = listTraces({ conversationId: response.conversation.id }).find(t => t.messageId === response.messages[0].id)!;
      assert(finalTrace); assert.equal(finalTrace.id, response.trace!.id);
      assert(Number.isFinite(finalTrace.latency.totalMs)); assert(Number.isFinite(finalTrace.cost.totalUsd));
      assert.equal(listTraces({ conversationId: response.conversation.id }).filter(t => t.messageId === response.messages[0].id).length, 1);
      assert(response.messages.filter(m => m.role !== 'buyer').every(m => m.traceId === finalTrace.id));
      records.push({ buyer: buyerId, text, response, finalTrace });
      console.log(`${buyerId}「${text}」→ ${finalTrace.layer}/${finalTrace.intent} · ${finalTrace.decideProvider ?? '-'} · ${finalTrace.latency.totalMs}ms · $${finalTrace.cost.totalUsd.toFixed(7)}`);
      for (const m of response.messages.filter(m => m.role !== 'buyer')) console.log(`  ${m.text}${m.card ? ` [${m.card.kind}]` : ''}`);
      return response;
    }
    function card<K extends ChatCard['kind']>(response: ChatResponse, kind: K): Extract<ChatCard, { kind: K }> {
      const found = response.messages.map(m => m.card).find(c => c?.kind === kind); assert(found, `缺少 ${kind} 卡片`); return found as Extract<ChatCard, { kind: K }>;
    }
    const logistics = await send('B001', '到哪了');
    assert.equal(logistics.trace!.layer, 'L1'); assert.equal(logistics.trace!.ruleId, 'R002'); assert.equal(card(logistics, 'logistics').orderId, 'QM2026100201');
    const size = await send('B001', '我160 50公斤穿什么码', undefined, { productId: 'P002' });
    assert.equal(size.trace!.layer, 'L2'); assert.equal(size.trace!.intent, 'size_recommend'); assert.equal(card(size, 'size_result').size, 'M');
    // T05 mock L3 hands off; test order lookup with explicit page context.
    const first = await send('B001', '你好', undefined, { orderId: 'QM2026091501' });
    assert.equal(first.conversation.state.slots.orderId, 'QM2026091501');
    const refund = await send('B001', '退款到哪了', first.conversation.id);
    assert.equal(card(refund, 'aftersale').afterSale.id, 'AS20260920001');
    const exchange = await send('B001', '能换L吗', undefined, { orderId: 'QM2026092801' });
    const pending = card(exchange, 'confirm').pendingAction;
    assert.equal(getOrder('QM2026092801')!.afterSales.length, 0);
    const confirmed = await handleMessage({ buyerId: 'B001', conversationId: exchange.conversation.id, action: { type: 'confirm', pendingActionId: pending.id, confirm: true }, debug: true });
    assert.equal(confirmed.trace!.layer, 'action'); assert.equal(confirmed.messages[0].text, '确认办理'); assert.equal(card(confirmed, 'aftersale').afterSale.type, 'exchange');
    const saved = listMessages(exchange.conversation.id).find(m => m.card?.kind === 'confirm')!.card;
    assert(saved?.kind === 'confirm'); assert.equal(saved.pendingAction.status, 'confirmed');
    const again = await handleMessage({ buyerId: 'B001', conversationId: exchange.conversation.id, action: { type: 'confirm', pendingActionId: pending.id, confirm: true }, debug: true });
    assert.equal(again.trace!.layer, 'action'); assert.equal(getOrder('QM2026092801')!.afterSales.length, 1);
    console.log('PASS 确认写入换货售后、重复确认幂等、消息和刷新后卡片状态一致');
    for (const [buyer, text] of [['B002', '穿了全身起红疹 不处理就去12315'], ['B001', '退款进度 再拖我就找律师']]) {
      const risk = await send(buyer, text);
      assert.equal(risk.trace!.layer, 'risk_gate'); assert.equal(risk.conversation.status, 'waiting_human'); assert.equal(risk.conversation.mode, 'human'); assert(risk.conversation.handoffAt); assert(risk.conversation.unreadForSeller > 0);
      const human = await send(buyer, '请尽快处理', risk.conversation.id);
      assert.equal(human.trace!.layer, 'human'); assert.equal(human.messages.length, 1);
    }
    const composite = await send('B001', '我 160cm 50kg 穿什么码？这件能机洗吗', undefined, { productId: 'P002' });
    assert.equal(card(composite, 'size_result').size, 'M'); assert(card(composite, 'sources').sources.length > 0);
    const options = await send('B003', '取消订单');
    const option = card(options, 'options').options.find(o => o.value === 'order:QM2026100402')!; assert(option);
    const chosen = await handleMessage({ buyerId: 'B003', conversationId: options.conversation.id, action: { type: 'select_option', value: option.value }, debug: true });
    assert.equal(chosen.messages[0].text, option.label); assert.equal(card(chosen, 'confirm').pendingAction.tool, 'cancel_order');
    const cancelled = await handleMessage({ buyerId: 'B003', conversationId: chosen.conversation.id, action: { type: 'confirm', pendingActionId: card(chosen, 'confirm').pendingAction.id, confirm: false }, debug: true });
    assert.equal(cancelled.messages[0].text, '取消办理'); assert.equal(getOrder('QM2026100402')!.status, 'pending_payment');
    console.log('PASS 多订单 options 补槽、选项标签落买家消息、取消动作不改订单');

    // Deterministic fixtures test control flow, not external model quality.
    process.env.OPENROUTER_API_KEY = ''; process.env.CLASSIFIER_PROVIDER = 'mock';
    let resolve!: (value: DecideResult) => void;
    let classifierStarted = false;
    const delayed = new Promise<DecideResult>(r => { resolve = r; });
    const t = Date.now();
    const early = await Promise.race([
      handleMessage({ buyerId: 'B001', text: '在吗', debug: true }, { decide: async () => { classifierStarted = true; return delayed; } }),
      new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new Error('L1 等待了分类器')), 1000); timer.unref(); }),
    ]);
    assert(classifierStarted); assert.equal(early.trace!.layer, 'L1');
    const before = listTraces({ conversationId: early.conversation.id }); assert.equal(before.length, 0);
    const risky = decideWithMock('在吗'); risky.risk.legal_threat = 0.92; risky.latencyMs = 450;
    resolve(risky); await drainBackgroundTasks();
    const after = listTraces({ conversationId: early.conversation.id }); assert.equal(after.length, 1); assert.equal(after[0].layer, 'risk_gate'); assert.equal(after[0].escalatedFrom, 'L1');
    assert.equal(getConversation(early.conversation.id)!.status, 'waiting_human');
    assert(listMessages(early.conversation.id).filter(m => m.role !== 'buyer').every(m => m.traceId === early.trace!.id));
    console.log(`PASS L1 与 decide 并行且未等待；延迟模型风险追加转人工；仅一条最终 trace（测试共${Date.now() - t}ms）`);
    releaseConversation(early.conversation.id);
    let releaseSlow!: (value: DecideResult) => void;
    const delayedConversation = createConversation('B001');
    const pendingTurn = handleMessage({ buyerId: 'B001', conversationId: delayedConversation.id, text: '我160 50公斤穿什么码', debug: true }, { decide: () => new Promise(r => { releaseSlow = r; }) });
    // Give the queued request its first microtask, then take over while decide waits.
    await Promise.resolve(); await Promise.resolve();
    takeoverConversation(delayedConversation.id);
    releaseSlow(decideWithMock('我160 50公斤穿什么码'));
    const takenOver = await pendingTurn;
    assert.equal(takenOver.trace!.layer, 'human'); assert.equal(takenOver.messages.filter(m => m.role === 'ai').length, 0);
    const budgetConversation = createConversation('B001');
    const budgetCtx = createHandlerContext({ buyerId: 'B001', conversationId: budgetConversation.id }, budgetConversation.state, '这件能机洗吗', 'product_consult', undefined, Date.now() - 1);
    const oldFetch = globalThis.fetch;
    process.env.OPENROUTER_API_KEY = 'local-budget-fixture'; process.env.CLASSIFIER_PROVIDER = 'jev';
    globalThis.fetch = async () => { throw new Error('已耗尽预算时不能调用网络'); };
    const bounded = await consult(budgetCtx, getProduct('P002'));
    globalThis.fetch = oldFetch; process.env.OPENROUTER_API_KEY = ''; process.env.CLASSIFIER_PROVIDER = 'mock';
    assert.equal(budgetCtx.metrics.usedGeneration, false); assert(bounded.messages.some(m => m.card?.kind === 'sources'));
    console.log('PASS 分类等待期间卖家接管会阻止AI回复；咨询预算耗尽时基于资料回复、保留来源且不调用模型');
    const hitBefore = getRule('R002')!.misfireCount;
    const lastL1 = await send('B001', '到哪了');
    await send('B001', '不是，我问的是退款', lastL1.conversation.id);
    assert.equal(getRule('R002')!.misfireCount, hitBefore + 1);
    console.log('PASS 上一轮L1否定反馈误判计数');
    await assert.rejects(() => handleMessage({ buyerId: 'B002', conversationId: exchange.conversation.id, text: '你好' }), /其他买家/);
    await assert.rejects(() => handleMessage({ buyerId: 'B002', text: '查物流', context: { orderId: 'QM2026092801' } }), /其他买家/);
    await assert.rejects(() => handleMessage({ buyerId: 'B001', action: { type: 'quick_action', name: 'invalid' } }), /未知/);
    const blocked = await handleMessage({ buyerId: 'B003', conversationId: chosen.conversation.id, text: '律师', action: { type: 'confirm', pendingActionId: card(chosen, 'confirm').pendingAction.id, confirm: true }, debug: true });
    assert.equal(blocked.trace!.layer, 'risk_gate'); assert.equal(getOrder('QM2026100402')!.status, 'pending_payment'); await drainBackgroundTasks();
    console.log('PASS 买家/会话/订单越权、非法动作拒绝；确认动作不能绕过风险闸门');
    const l3 = await send('B003', '两个订单帮我处理，顺便查券');
    assert.equal(l3.trace!.layer, 'human'); assert.equal(l3.trace!.escalatedFrom, 'L3');
    const twice = await send('B003', '两个订单帮我处理，顺便查券', l3.conversation.id);
    assert.equal(twice.trace!.layer, 'human'); assert.equal(twice.messages.length, 1);
    const reset = createConversation('B001'); let finish!: (value: DecideResult) => void;
    await handleMessage({ buyerId: 'B001', conversationId: reset.id, text: '在吗' }, { decide: () => new Promise(r => { finish = r; }) });
    writeCollection('conversations', []); writeCollection('messages', []); writeCollection('traces', []);
    finish(risky); await drainBackgroundTasks(); assert.equal(listTraces().length, 0);
    console.log('PASS 无key的L3转人工、后续消息仅转发；重置后不回写后台旧结果');
    if (process.argv.includes('--report')) writeFileSync(join(root, `docs/reports/T04-${live ? 'live' : 'mock'}-transcript.json`), JSON.stringify(records, null, 2) + '\n');
    console.log(`全部通过（${live ? '真实分类器/生成 + 控制流夹具' : 'mock、无key、控制流夹具'}；隔离临时数据，未改当前演示数据）`);
  } finally {
    await drainBackgroundTasks(); process.chdir(root); clearStoreCache(); rmSync(temp, { recursive: true, force: true });
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = originalKey;
    if (originalProvider === undefined) delete process.env.CLASSIFIER_PROVIDER; else process.env.CLASSIFIER_PROVIDER = originalProvider;
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
