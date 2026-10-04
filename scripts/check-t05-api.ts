import assert from 'node:assert/strict';
import type { ChatMessage, Conversation, Rule } from '../lib/types';
import type { ChatResponse } from '../lib/brain/pipeline';
const base = process.argv[2] ?? 'http://localhost:3001';
async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${base}/api${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  assert(r.ok, `${path}: ${r.status}`); return r.json() as Promise<T>;
}
async function main() {
  await api('/admin/reset', {});
  const handoff = await api<ChatResponse>('/chat', { buyerId: 'B003', text: '转人工', debug: true });
  const c = handoff.conversation;
  assert.equal(c.mode, 'human'); assert.equal(c.status, 'waiting_human'); assert(c.handoffAt); assert(c.handoffSummary);
  const list = await api<Conversation[]>('/conversations'); assert.equal(list[0].id, c.id);
  console.log(`PASS 待人工置顶、handoffAt、摘要：${c.handoffSummary}`);
  const forwarded = await api<ChatResponse>('/chat', { buyerId: 'B003', conversationId: c.id, text: '请帮我核实', debug: true });
  assert.equal(forwarded.messages.length, 1); assert.equal(forwarded.conversation.unreadForSeller, c.unreadForSeller + 1);
  const after = forwarded.messages[0].id;
  const reply = await api<ChatMessage>(`/conversations/${c.id}/reply`, { text: '已收到，我来帮您核实。' });
  const polled = await api<{ conversation: Conversation; messages: ChatMessage[] }>(`/conversations/${c.id}/messages?after=${after}`);
  assert(polled.messages.some(m => m.id === reply.id && m.role === 'seller'));
  assert.equal(polled.conversation.status, 'human_active');
  const released = await api<Conversation>(`/conversations/${c.id}/release`, {});
  assert.equal(released.mode, 'ai'); assert.equal(released.handoffAt, undefined); assert.equal(released.unreadForSeller, 0);
  const resumed = await api<ChatResponse>('/chat', { buyerId: 'B003', conversationId: c.id, text: '在吗', debug: true });
  assert(resumed.messages.some(m => m.role === 'ai'));
  console.log('PASS 人工消息仅转发+未读1、reply自动接管、after取到卖家消息、release恢复AI');
  const rules = await api<Rule[]>('/rules'); assert(rules.some(r => r.id === 'R007')); assert(rules.some(r => r.id === 'R008'));
  const invalid = await fetch(`${base}/api/rules`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '非法正则', pattern: '[', intent: 'greeting', maxLen: 12, enabled: true }) });
  assert.equal(invalid.status, 400);
  console.log('PASS T16规则读取及非法正则400');
  const start = Date.now(); await api('/admin/reset', {}); const ms = Date.now() - start; assert(ms < 5000);
  console.log(`PASS HTTP重复重置 ${ms}ms (<5000ms)`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
