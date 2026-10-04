/** T22 HTTP acceptance against an already running PUBLIC_DEMO=1 server. May make real model calls. */
import assert from 'node:assert/strict';
import type { ChatResponse } from '../lib/brain/pipeline';
import type { Conversation, Order, Rule, RouteTrace } from '../lib/types';

const base = process.env.VISITOR_BASE_URL ?? 'http://localhost:3000';
let checks = 0;
function pass(message: string) { console.log(`PASS ${++checks} ${message}`); }
class Visitor {
  cookie = '';
  async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await this.raw(path, method, body);
    const result = await response.json();
    assert.ok(response.ok, `${path}: HTTP ${response.status} ${JSON.stringify(result)}`);
    return result as T;
  }
  async raw(path: string, method = 'GET', body?: unknown) {
    const response = await fetch(base + path, { method, headers: { ...(this.cookie ? { cookie: this.cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie?.includes('qimu_sid=')) {
      this.cookie = /qimu_sid=[^;]+/.exec(setCookie)![0];
      assert.match(setCookie, /HttpOnly/i); assert.match(setCookie, /SameSite=Lax/i); assert.match(setCookie, /Max-Age=604800/i);
    }
    return response;
  }
  chat(body: unknown) { return this.request<ChatResponse>('/api/chat', 'POST', body); }
}
const sleep = (ms: number) => new Promise(done => setTimeout(done, ms));
async function settled(visitor: Visitor, id: string, count: number) {
  for (let i = 0; i < 120; i++) {
    const detail = await visitor.request<{ traces: RouteTrace[]; conversation: Conversation }>(`/api/conversations/${id}`);
    if (detail.traces.length >= count) return detail;
    await sleep(100);
  }
  throw new Error('后台 trace 未在 12 秒内落盘');
}
async function main() {
  assert.deepEqual(await new Visitor().request('/api/health'), { ok: true }); pass('生产健康接口返回 ok');
  const a = new Visitor(), b = new Visitor();
  await a.request('/api/buyers'); await b.request('/api/buyers');
  assert.ok(a.cookie && b.cookie && a.cookie !== b.cookie); pass('首次请求发随机且不同的 HttpOnly/Lax/7 天 cookie');
  await Promise.all([a.request('/api/admin/reset', 'POST'), b.request('/api/admin/reset', 'POST')]);
  const bOrders = await b.request<Order[]>('/api/orders?buyerId=B001');
  const bSeller = await b.request<Conversation[]>('/api/conversations');
  const bAll = await b.request<Conversation[]>('/api/conversations?includeSimulated=1');
  const bAnalytics = await b.request('/api/analytics/routing?range=7d');
  const beforeA = await a.request<Order[]>('/api/orders?buyerId=B001');
  const scenario = { buyerId: 'B001', text: '上周买的那件外套换成 L，顺便看看有没有券', context: { orderId: 'QM2026092801' }, debug: true };
  const responseA = await a.chat(scenario);
  const cardA = responseA.messages.find(m => m.card?.kind === 'confirm')?.card;
  assert.ok(cardA?.kind === 'confirm', 'A 第 3 步必须出现真实确认卡；需要配置支持工具的 AGENT_MODEL 与模型 key');
  const confirmation = await a.chat({ buyerId: 'B001', conversationId: responseA.conversation.id, action: { type: 'confirm', pendingActionId: cardA.pendingAction.id, confirm: true }, debug: true });
  assert.ok(confirmation.messages.some(m => m.card?.kind === 'aftersale'));
  assert.notDeepEqual(await a.request('/api/orders?buyerId=B001'), beforeA); pass('A 完成第 3 步确认换货，实际订单改变且返回售后卡');
  assert.deepEqual(await b.request('/api/orders?buyerId=B001'), bOrders);
  assert.deepEqual(await b.request('/api/conversations'), bSeller);
  assert.deepEqual(await b.request('/api/conversations?includeSimulated=1'), bAll); pass('A 换货后 B 订单、卖家列表与模拟会话不变');
  await a.request('/api/admin/reset', 'POST');
  assert.deepEqual(await a.request('/api/orders?buyerId=B001'), beforeA);
  assert.deepEqual(await b.request('/api/orders?buyerId=B001'), bOrders);
  assert.deepEqual(await b.request('/api/conversations'), bSeller); pass('A 重置只恢复自己的订单和会话');
  const l1 = await a.chat({ buyerId: 'B001', text: '你好', debug: true });
  await settled(a, l1.conversation.id, 1);
  const risk = await a.chat({ buyerId: 'B001', conversationId: l1.conversation.id, text: '衣服让我起疹了，我要报警投诉', debug: true });
  assert.equal(risk.conversation.mode, 'human');
  await settled(a, risk.conversation.id, 2);
  assert.deepEqual(await b.request('/api/orders?buyerId=B001'), bOrders);
  assert.deepEqual(await b.request('/api/conversations'), bSeller);
  assert.deepEqual(await b.request('/api/analytics/routing?range=7d'), bAnalytics); pass('A 的 L1 后台补写及风险转人工后，B 会话与看板没有新增 trace');
  const responseB = await b.chat(scenario);
  assert.ok(responseB.messages.some(m => m.card?.kind === 'confirm'), 'B 第 3 步仍须出现确认卡'); pass('B 在 A 换货、重置、风险转人工之后，第 3 步仍能出真实确认卡');
  const rules = await b.request<Rule[]>('/api/rules');
  await a.request(`/api/rules/${rules[0].id}`, 'PATCH', { enabled: !rules[0].enabled });
  assert.deepEqual(await b.request('/api/rules'), rules); pass('A 开关规则不改变 B 规则与计数');
  const imported = await a.raw('/api/kb/import', 'POST', { title: '不应写入', content: '公开演示禁用导入' });
  assert.equal(imported.status, 403); assert.match((await imported.json()).error.message, /公开演示版不开放导入/);
  const deleted = await a.raw('/api/kb/KB-fake', 'DELETE'); assert.equal(deleted.status, 403);
  const search = await a.request<unknown[]>('/api/kb/search', 'POST', { query: '尺码 身高 体重' }); assert.ok(Array.isArray(search)); pass('知识库导入/删除禁用，试搜照常');
  // One human-mode message already exists for this separate visitor; remaining messages are forwarded without model work.
  const limit = new Visitor(); await limit.request('/api/buyers');
  const first = await limit.chat({ buyerId: 'B001', text: '我要报警投诉', debug: true }); assert.equal(first.conversation.mode, 'human');
  for (let i = 1; i < 40; i++) await limit.chat({ buyerId: 'B001', conversationId: first.conversation.id, text: `限流验收 ${i}`, debug: true });
  const before = await limit.request<{ traces: RouteTrace[] }>(`/api/conversations/${first.conversation.id}`);
  const denied = await limit.raw('/api/chat', 'POST', { buyerId: 'B001', conversationId: first.conversation.id, text: '第 41 条' });
  assert.equal(denied.status, 429); assert.match((await denied.json()).error.message, /40/);
  await limit.request('/api/admin/reset', 'POST');
  const deniedAfterReset = await limit.raw('/api/chat', 'POST', { buyerId: 'B001', text: '重置也不能绕过' }); assert.equal(deniedAfterReset.status, 429);
  assert.equal(before.traces.length, 40); pass('真实 HTTP 第 41 条返回友好 429；重置无法绕过额度');
  // A foreign conversation ID is rejected rather than reading the other visitor's data.
  const foreign = await b.raw(`/api/conversations/${risk.conversation.id}`); assert.equal(foreign.status, 404); pass('另一位访客的会话编号不能越界访问');
  assert.ok(a.cookie.includes('qimu_sid='));
  console.log(`全部 ${checks} 项通过（真实 HTTP / 数据层 / 模型配置，未使用前端 mock）。`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
