import { chatCompletion, hasApiKey, OpenRouterError, type LlmMessage } from '../llm/openrouter';
import { DEMO_NOW } from '../demo-clock';
import { getConversation, listMessages } from '../store/conversations';
import { toolRegistry, toOpenAITools } from '../tools/registry';
import type { Coupon, KbSearchHit, Order, PendingAction } from '../types';
import type { NewMessage } from '../store/conversations';
import type { HandlerContext, HandlerResult } from './handlers/context';
import { addHistory, serializeStateForModel } from './state';
import { AGENT_SYSTEM_PROMPT } from './prompts/agent';

const MAX_TOOL_CALLS = 6;
export const AGENT_BUDGET_MS = 20000;
const failed = (reason = 'l3_failed'): HandlerResult => ({ status: 'collecting', handoffReason: reason, messages: [{ role: 'ai', text: '这个问题比较复杂，我帮您转接人工客服' }] });

function structuredResult(cards: NewMessage[]): HandlerResult {
  return { status: cards.some(m => m.card?.kind === 'confirm') ? 'awaiting_confirm' : 'done', messages: [{ role: 'ai', text: cards.map(m => m.card?.kind === 'confirm' ? `${m.card.pendingAction.summary}（待您确认后办理）` : m.card?.kind === 'coupons' ? `已查到${m.card.coupons.length}张可用优惠券，详情见卡片。` : '').filter(Boolean).join('\n') }, ...cards] };
}
// Only finish early for these finite combinations; extra questions keep the
// general model loop. Completion depends on successful real tool results.
function structuredGoals(text: string): string[] | undefined {
  if (/换/.test(text) && /券|优惠/.test(text) && !/退[款货]|取消|地址|物流|洗|材质|质量|发票|补偿|推荐|身高|体重|两件|三件|全部/.test(text)) return ['request_exchange', 'list_coupons'];
  if (/取消/.test(text) && /改地址|地址.*改/.test(text) && !/换|退款|退货|物流|券|洗|材质|质量|发票|补偿|三[个张单]|全部/.test(text)) return ['cancel_order', 'modify_address'];
  return undefined;
}
function completedTools(cards: NewMessage[]): string[] {
  return cards.flatMap(m => m.card?.kind === 'confirm' ? [m.card.pendingAction.tool] : m.card?.kind === 'coupons' ? ['list_coupons'] : []);
}
function structuredWorkComplete(text: string, cards: NewMessage[]): boolean {
  const goals = structuredGoals(text);
  const done = completedTools(cards);
  return Boolean(goals && goals.length === done.length && goals.every(g => done.includes(g)));
}
function modelToolResult(name: string, output: unknown): unknown {
  if (name !== 'list_orders') return output;
  return (output as Order[]).map(({ id, status, items, createdAt, paidAt, deliveredAt, address, afterSales }) => ({ id, status, items, createdAt, paidAt, deliveredAt, address, afterSales }));
}

// The deadline covers model calls and tool waits. Late read results cannot
// resume this loop or produce new writes after handoff.
async function within<T>(operation: Promise<T>, deadline: number): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('Agent deadline');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Agent deadline')), remaining); })]);
  } finally { if (timer) clearTimeout(timer); }
}
export async function runAgent(ctx: HandlerContext): Promise<HandlerResult> {
  if (!hasApiKey() || process.env.CLASSIFIER_PROVIDER === 'mock') return failed('l3_mock');
  const deadline = Date.now() + AGENT_BUDGET_MS;
  const cards: NewMessage[] = [];
  let calls = 0;
  try {
    const conversation = getConversation(ctx.toolContext.conversationId);
    if (!conversation) return failed();
    const recent = listMessages(conversation.id).slice(-12);
    const messages: LlmMessage[] = [
      { role: 'system', content: AGENT_SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify({ 演示当前时间: DEMO_NOW, 状态: serializeStateForModel({ ...conversation, state: ctx.state }, []), 最近对话: recent.map(m => ({ 角色: m.role, 内容: m.text })), 本次需求: ctx.text }) },
    ];
    if (/订单|上周|买的|换.*码|取消|改地址/.test(ctx.text)) {
      const orders = await within(ctx.call<Order[]>('list_orders', {}), deadline);
      calls++;
      messages.push({ role: 'assistant', content: null, tool_calls: [{ id: 'initial-orders', type: 'function', function: { name: 'list_orders', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 'initial-orders', name: 'list_orders', content: JSON.stringify(modelToolResult('list_orders', orders)) });
    }
    while (Date.now() < deadline) {
      const availableTools = toOpenAITools().filter(t => {
        const goals = structuredGoals(ctx.text);
        if (goals) return ['create_handoff', 'get_order'].includes(t.function.name) || goals.includes(t.function.name) || (goals.includes('request_exchange') && t.function.name === 'check_stock');
        if (t.function.name === 'list_orders') return !ctx.metrics.toolCalls.some(c => c.name === 'list_orders' && c.ok);
        if (t.function.name === 'request_exchange') return ctx.metrics.toolCalls.some(c => c.name === 'check_stock' && c.ok);
        if (t.function.name === 'list_coupons' && /换/.test(ctx.text)) return cards.some(m => m.card?.kind === 'confirm' && m.card.pendingAction.tool === 'request_exchange');
        return true;
      });
      messages.push({ role: 'system', content: `基于已有订单，一次提出能确定参数的完整操作计划，多个调用按业务依赖顺序返回；库存和资格由服务器逐步校验，任何失败都会转人工。本轮只能调用以下工具：${availableTools.map(t => t.function.name).join('、')}。已完成：${completedTools(cards).join('、') || '尚无确认或券结果'}。不要调用未提供的工具。` });
      const result = await within(chatCompletion({ model: process.env.AGENT_MODEL, messages, tools: availableTools,
        toolChoice: calls === MAX_TOOL_CALLS ? 'none' : structuredGoals(ctx.text) ? 'required' : 'auto', reasoning: { enabled: process.env.AGENT_REASONING === 'on' },
        provider: { sort: 'latency' }, temperature: 0, maxTokens: 650, timeoutMs: Math.min(8000, deadline - Date.now()),
      }), deadline);
      ctx.metrics.agentUsd += result.costUsd;
      ctx.metrics.estimated ||= result.estimated;
      const { data } = result;
      console.log('[agent-step]', { ms: result.latencyMs, tools: data.toolCalls.map(c => c.name), finish: data.finishReason });
      if (!data.toolCalls.length) {
        const structured = cards.some(m => m.card?.kind === 'confirm' || m.card?.kind === 'coupons');
        // Truncated prose is discarded when authoritative structured cards exist;
        // a truncated tool call still fails JSON validation and hands off.
        if (!calls || (!structured && !data.content.trim()) || !(data.finishReason === 'stop' || (structured && data.finishReason === 'length'))) return failed();
        return structured ? structuredResult(cards) : { status: 'done', messages: [{ role: 'ai', text: data.content }, ...cards] };
      }
      if (calls + data.toolCalls.length > MAX_TOOL_CALLS) return failed();
      messages.push(data.message);
      const priorities = ['check_stock', 'request_exchange', 'cancel_order', 'modify_address', 'list_coupons'];
      const plan = structuredGoals(ctx.text) ? [...data.toolCalls].sort((a, b) => priorities.indexOf(a.name) - priorities.indexOf(b.name)) : data.toolCalls;
      for (const call of plan) {
        if (Date.now() >= deadline || getConversation(conversation.id)?.mode !== 'ai') return failed();
        if (!availableTools.some(t => t.function.name === call.name)) return failed();
        if (call.name === 'request_exchange' && !ctx.metrics.toolCalls.some(c => c.name === 'check_stock' && c.ok)) return failed();
        const args: unknown = JSON.parse(call.arguments);
        if (!args || typeof args !== 'object' || Array.isArray(args)) return failed();
        calls++;
        const output = await within(ctx.call<unknown>(call.name, args as Record<string, unknown>), deadline);
        if (call.name === 'create_handoff') return failed((output as { reason: string }).reason);
        const definition = toolRegistry.get(call.name)!;
        if (definition.kind === 'write') {
          const pending = output as PendingAction;
          ctx.state.pendingActionId = pending.id;
          addHistory(ctx.state, 'pending_action', pending.id, pending.summary);
          cards.push({ role: 'ai', text: '请核对下面的信息，确认后再办理。', card: { kind: 'confirm', pendingAction: pending } });
        } else if (call.name === 'list_coupons') {
          cards.push({ role: 'ai', text: '以下是当前可用的优惠券。', card: { kind: 'coupons', coupons: output as Coupon[] } });
        } else if (call.name === 'search_kb') {
          const hits = output as KbSearchHit[];
          if (!hits.length) return failed('没有找到足够的政策资料，需要人工核实');
          ctx.metrics.ragHits += hits.length;
          cards.push({ role: 'ai', text: '本次回答参考的资料。', card: { kind: 'sources', sources: hits.map(h => ({ docTitle: h.chunk.docTitle, heading: h.chunk.heading, snippet: h.chunk.text.slice(0, 120) })) } });
        }
        messages.push({ role: 'tool', tool_call_id: call.id, name: call.name, content: JSON.stringify(modelToolResult(call.name, output)) });
      }
      if (structuredWorkComplete(ctx.text, cards)) return structuredResult(cards);
    }
  } catch (error) { console.error('[agent-failure]', error instanceof OpenRouterError ? { kind: error.kind, status: error.status } : error instanceof Error ? error.name : 'UnknownError'); ctx.metrics.estimated = true; /* Unknown cost on failed calls is explicitly estimated. */ }
  return failed();
}
