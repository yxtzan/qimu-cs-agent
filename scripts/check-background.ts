/** Deterministic T22 checks: real pipeline/background/store, fake delayed model transport, temporary data only. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd(), temp = mkdtempSync(join(tmpdir(), 'qimu-t22-'));
cpSync(join(root, 'data/seed'), join(temp, 'data/seed'), { recursive: true });
process.chdir(temp);
process.env.PUBLIC_DEMO = '1'; process.env.OPENROUTER_API_KEY = ''; process.env.CLASSIFIER_PROVIDER = 'mock';
process.env.JEV_KEEPALIVE_MS = '0'; process.env.DAILY_BUDGET_USD = '1'; process.env.GENERATION_MODEL = 'fixture';
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const tick = () => new Promise<void>(done => setTimeout(done, 10));
let checks = 0;
function pass(message: string) { checks++; console.log(`PASS ${message}`); }

async function main() {
  const context = await import('../lib/store/visitor-context');
  const { runVisitor, currentVisitor, withSharedStore, cleanupVisitors, bindVisitor } = context;
  const { resetDemoData, ensurePublicSharedData } = await import('../lib/store/reset');
  await import('../lib/store/reset-hooks');
  const store = await import('../lib/store');
  const conversations = await import('../lib/store/conversations');
  const { createConversation, listConversations, listTraces, getConversation, getMessage } = conversations;
  const { handleMessage } = await import('../lib/brain/pipeline');
  const { decideWithMock } = await import('../lib/brain/decide/mock');
  const { serializeConversation, drainBackgroundTasks, scheduleBackground } = await import('../lib/brain/background');
  const { enterHandoff } = await import('../lib/brain/handoff');
  const limits = await import('../lib/store/public-limits');
  const { consumeChat, publicBudget, recordTransportCost, recordTraceCosts, installPublicModelGuard } = limits;
  await ensurePublicSharedData();
  const sharedFiles = ['kb_index.json', 'simulated_traces.json', 'simulated_conversations.json', 'simulated_messages.json'];
  const sharedBefore = sharedFiles.map(name => readFileSync(join(temp, 'data/runtime', name), 'utf8'));
  const A = randomUUID(), B = randomUUID();
  const visit = <T>(sid: string, fn: () => T | Promise<T>) => runVisitor(sid, resetDemoData, async () => fn());

  // Same conversation id must not put B behind A's delayed queue.
  const hold = deferred<void>();
  const queuedA = visit(A, () => serializeConversation('C1001', () => hold.promise));
  await tick();
  const completedB = visit(B, () => serializeConversation('C1001', async () => 'B finished'));
  assert.equal(await Promise.race([completedB, new Promise(done => setTimeout(() => done('blocked'), 200))]), 'B finished');
  hold.resolve(); await queuedA; pass('两个访客同名 C1001 的队列互不阻塞');

  const pendingSummaries: { sid: string | undefined; resolve: (value: Response) => void }[] = [];
  let modelCalls = 0;
  globalThis.fetch = async () => {
    modelCalls++;
    const waiting = deferred<Response>();
    pendingSummaries.push({ sid: currentVisitor()?.sid, resolve: waiting.resolve });
    return waiting.promise;
  };
  installPublicModelGuard();
  process.env.CLASSIFIER_PROVIDER = 'jev'; process.env.OPENROUTER_API_KEY = 'fixture-not-a-real-key';
  const summaryResponse = (text: string) => Response.json({ choices: [{ finish_reason: 'stop', message: { content: text } }], usage: { cost: 0.00003 } });
  const finishSummary = (sid: string, text: string) => {
    const index = pendingSummaries.findIndex(item => item.sid === sid);
    assert.ok(index >= 0, `Expected an actual delayed summary for ${sid}`);
    pendingSummaries.splice(index, 1)[0].resolve(summaryResponse(text));
  };
  const late = deferred<ReturnType<typeof decideWithMock>>();
  const responseA = await visit(A, () => handleMessage({ buyerId: 'B001', text: '你好', debug: true }, { decide: async () => late.promise }));
  const responseB = await visit(B, () => handleMessage({ buyerId: 'B001', text: '你好', debug: true }, { decide: async (_state, text) => decideWithMock(text) }));
  const risk = decideWithMock('你好'); risk.provider = 'jev'; risk.risk.health_safety = 0.95; risk.costUsd = 0.00006;
  late.resolve(risk);
  for (let i = 0; !pendingSummaries.length && i < 100; i++) await tick();
  assert.equal(pendingSummaries[0]?.sid, A);
  finishSummary(A, 'A 的后台人工摘要'); await drainBackgroundTasks();
  await visit(A, () => {
    const trace = listTraces({ includeSimulated: false });
    assert.equal(trace.length, 1); assert.equal(trace[0].layer, 'risk_gate'); assert.equal(trace[0].escalatedFrom, 'L1');
    assert.ok(trace[0].cost.totalUsd >= 0.00009 - 1e-12);
    assert.equal(getConversation(responseA.conversation.id)?.handoffSummary, 'A 的后台人工摘要');
  });
  await visit(B, () => { assert.equal(listTraces({ includeSimulated: false }).length, 1); assert.equal(getConversation(responseB.conversation.id)?.mode, 'ai'); });
  pass('实际 L1 延迟风险补写 + 实际模型摘要回到 A，B trace 与模式不变');

  // Two concurrently delayed summaries must both survive; resetting A must not invalidate B's summary.
  await visit(A, resetDemoData);
  const ca = await visit(A, () => createConversation('B001'));
  const cb = await visit(B, () => createConversation('B002'));
  await Promise.all([visit(A, () => enterHandoff(ca.id, 'A 请求人工')), visit(B, () => enterHandoff(cb.id, 'B 请求人工'))]);
  await tick(); await visit(A, resetDemoData);
  finishSummary(B, 'B 的后台人工摘要'); finishSummary(A, 'A 已失效的旧摘要');
  await drainBackgroundTasks();
  await visit(A, () => assert.equal(listConversations().length, 0));
  await visit(B, () => assert.equal(getConversation(cb.id)?.handoffSummary, 'B 的后台人工摘要'));
  pass('A 重置不会取消 B 的在途摘要，A 旧摘要不会复活会话');

  // Hard risk keyword timeout: late classifier cost must update the original A trace, not append into B.
  process.env.KEYWORD_RISK_WAIT_MS = '1';
  const keywordDecision = deferred<ReturnType<typeof decideWithMock>>();
  const keyword = await visit(A, () => handleMessage({ buyerId: 'B001', text: '我要报警', debug: true }, { decide: async () => keywordDecision.promise }));
  await tick(); finishSummary(A, 'A 关键词风险摘要');
  const lateKeyword = decideWithMock('我要报警'); lateKeyword.provider = 'jev'; lateKeyword.costUsd = 0.00008; keywordDecision.resolve(lateKeyword);
  await drainBackgroundTasks();
  await visit(A, () => { const rows = listTraces({ includeSimulated: false }); assert.equal(rows.length, 1); assert.equal(rows[0].cost.decideUsd, 0.00008); assert.equal(rows[0].messageId, keyword.messages[0].id); });
  await visit(B, () => assert.equal(listTraces({ includeSimulated: false }).length, 1));
  pass('关键词超时后的实际费用补写仅更新 A 原 trace');

  // A bound callback already running when reset happens must not write into the replacement directory.
  const oldWrite = deferred<void>();
  await visit(A, () => scheduleBackground(async () => { await oldWrite.promise; store.writeCollection('old_callback', [{ leak: true }]); }));
  await tick(); await visit(A, resetDemoData); oldWrite.resolve(); await drainBackgroundTasks();
  assert.equal(existsSync(join(temp, 'data/runtime/visitors', A, 'old_callback.json')), false);
  pass('重置代次阻止已在运行的旧后台任务写回新目录');
  assert.deepEqual(sharedFiles.map(name => readFileSync(join(temp, 'data/runtime', name), 'utf8')), sharedBefore);
  assert.equal(existsSync(join(temp, 'data/runtime/visitors', A, 'kb_index.json')), false);
  pass('知识库、模拟历史未复制且重置后逐字节不变');

  // Caps and real Beijing midnight rollover, independent of demo business clock.
  const time = Date.parse('2026-10-04T02:30:00Z');
  const sid = randomUUID();
  for (let i = 0; i < 40; i++) assert.equal(consumeChat(sid, 'hourly', time + i), undefined);
  assert.match(consumeChat(sid, 'hourly', time + 100)!, /40/);
  assert.match(consumeChat(sid, 'hourly', time + 30 * 60_000)!, /40/);
  assert.equal(consumeChat(sid, 'hourly', time + 3600_001), undefined);
  pass('滚动一小时第 41 条拒绝，跨自然整点仍拒绝，满一小时恢复');
  const dailySid = randomUUID();
  for (let i = 0; i < 150; i++) assert.equal(consumeChat(dailySid, 'daily', time + Math.floor(i / 40) * 3600_000 + i), undefined);
  assert.match(consumeChat(dailySid, 'daily', time + 5 * 3600_000)!, /150/);
  const nextDay = Date.parse('2026-10-04T16:00:00Z');
  assert.equal(consumeChat(dailySid, 'daily', nextDay), undefined);
  pass('每访客 150/日，北京时间 0 点恢复');
  for (let i = 0; i < 400; i++) assert.equal(consumeChat(randomUUID(), 'same-ip', nextDay + i), undefined);
  assert.match(consumeChat(randomUUID(), 'same-ip', nextDay + 1000)!, /400/);
  pass('更换 400 个 cookie 后相同 IP 第 401 条仍拒绝');
  const midnightSid = randomUUID(), midnight = Date.parse('2026-10-05T16:00:00Z');
  for (let i = 0; i < 40; i++) assert.equal(consumeChat(midnightSid, 'midnight-hour', midnight - 30 * 60_000 + i), undefined);
  assert.match(consumeChat(midnightSid, 'midnight-hour', midnight)!, /40/);
  pass('北京时间零点日额度恢复，但滚动一小时上限不能绕过');
  // Execute the actual HTTP route's 41st-message branch and count model transport calls.
  process.chdir(root);
  const { POST } = await import('../app/api/chat/route');
  process.chdir(temp);
  const quotaSid = randomUUID();
  await visit(quotaSid, async () => {
    for (let i = 0; i < 40; i++) assert.equal(consumeChat(quotaSid, 'route-quota'), undefined);
    const beforeCalls = modelCalls;
    const result = await POST(new Request('http://localhost/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ buyerId: 'B001', text: '第41条你好' }) }));
    assert.equal(result.status, 429); assert.match((await result.json()).error.message, /40/);
    assert.equal(modelCalls, beforeCalls); assert.equal(listConversations().length, 0);
  });
  pass('实际 POST /api/chat 第 41 条拒绝，模型外呼数与会话数均未增加');

  // Trace deltas, simulated exclusion, reset does not refund the global allowance, transport guard no calls.
  const now = Date.now();
  process.env.DAILY_BUDGET_USD = '0.00001';
  await visit(A, () => recordTraceCosts([{ ...responseB.trace!, id: 'fixture-cost', isSimulated: false, cost: { decideUsd: 0.00002, generationUsd: 0, agentUsd: 0, totalUsd: 0.00002 } }], now));
  const before = publicBudget(now).spentUsd;
  await visit(A, () => recordTraceCosts([{ ...responseB.trace!, id: 'fixture-cost', isSimulated: false, cost: { decideUsd: 0.00002, generationUsd: 0, agentUsd: 0, totalUsd: 0.00002 } }], now));
  await visit(A, () => recordTraceCosts([{ ...responseB.trace!, isSimulated: true, cost: { ...responseB.trace!.cost, totalUsd: 100 } }], now));
  assert.equal(publicBudget(now).spentUsd, before); assert.equal(publicBudget(now).exhausted, true);
  await visit(A, resetDemoData); assert.equal(publicBudget(now).spentUsd, before);
  const calls = modelCalls;
  await assert.rejects(() => visit(A, () => fetch('https://openrouter.ai/api/v1/chat/completions')), /演示额度今日已用完/);
  assert.equal(modelCalls, calls);
  assert.equal(publicBudget(nextDay + 86400_000).exhausted, false);
  process.env.DAILY_BUDGET_USD = '1'; recordTransportCost(0.1, nextDay + 86400_000);
  assert.equal(publicBudget(nextDay + 86400_000).spentUsd, 0.1);
  pass('trace 增量计费不重复、模拟费用不计费、reset 不退额度、超额外呼为零、次日恢复');
  const traceDay = Date.now(), followingDay = traceDay + 86400_000;
  const historyTrace = { ...responseB.trace!, id: 'old-day-cost', isSimulated: false, cost: { ...responseB.trace!.cost, totalUsd: 0.01 } };
  await visit(A, () => recordTraceCosts([historyTrace], traceDay));
  await visit(A, () => recordTraceCosts([historyTrace], followingDay));
  assert.equal(publicBudget(followingDay).spentUsd, 0);
  pass('次日写回整个 trace 集合不会把昨日费用重新计入');
  recordTransportCost(0.012, Date.now());
  const persisted = publicBudget().spentUsd;
  const child = spawnSync(process.execPath, ['--import', join(root, 'node_modules/tsx/dist/loader.mjs'), '--input-type=module', '-e', `const { publicBudget } = await import(${JSON.stringify(join(root, 'lib/store/public-limits.ts'))}); console.log(publicBudget().spentUsd);`], { cwd: temp, env: process.env, encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr); assert.equal(Number(child.stdout.trim()), persisted);
  pass('新进程读取相同每日账本，服务重启不会退回额度');

  // Invalid cookie traversal never enters a store directory.
  await assert.rejects(() => runVisitor('../escape', resetDemoData, async () => null), /Invalid visitor/);
  pass('拒绝不合法访客号及目录穿越');
  // Cleanup uses wall time and evicts cache; active delayed callbacks are protected.
  const old = randomUUID(), dir = join(temp, 'data/runtime/visitors', old);
  await visit(old, () => createConversation('B001'));
  const past = (Date.now() - 25 * 3600_000) / 1000;
  utimesSync(join(dir, '.last-seen'), past, past);
  assert.ok(cleanupVisitors() >= 1); assert.equal(existsSync(dir), false);
  await visit(old, () => assert.equal(listConversations().length, 0));
  pass('24 小时未访问目录删除，重新访问得到干净种子与缓存');
  const active = randomUUID(), activeDir = join(temp, 'data/runtime/visitors', active);
  let releaseTask!: () => Promise<unknown>;
  await visit(active, () => { releaseTask = bindVisitor(async () => getMessage('none')); });
  utimesSync(join(activeDir, '.last-seen'), past, past); cleanupVisitors(); assert.equal(existsSync(activeDir), true);
  await releaseTask(); cleanupVisitors(); assert.equal(existsSync(activeDir), false);
  pass('正在排队的后台任务保留目录，完成后可清理');
  // More than 500 dirs: oldest inactive first, not the newest.
  for (let i = 0; i < 502; i++) { const d = join(temp, 'data/runtime/visitors', randomUUID()); mkdirSync(d); writeFileSync(join(d, '.last-seen'), ''); utimesSync(join(d, '.last-seen'), now / 1000 - 1000 + i, now / 1000 - 1000 + i); }
  cleanupVisitors(now);
  assert.equal(readdirSync(join(temp, 'data/runtime/visitors')).length, 500);
  pass('超过 500 个目录自动删除最久未用的，保持 500 个');
  // Avoid an unused import while making sure shared reads remain accessible outside visitor scope.
  withSharedStore(() => assert.equal(store.readCollection('simulated_traces').length, 295));
  console.log(`全部 ${checks} 项通过；模型响应为延迟夹具，实际 pipeline / 摘要 / 费用补写均执行，未调用外部模型。`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { process.chdir(root); rmSync(temp, { recursive: true, force: true }); });
