import { runTool, type ToolContext } from '../../tools/registry';
import type { ToolFailureOptions } from '../../tools/types';
import type { ChatAction, DialogState, IntentId, RouteTrace } from '../../types';
import type { NewMessage } from '../../store/conversations';
import { addHistory } from '../state';

export interface HandlerResult {
  messages: NewMessage[];
  status: 'collecting' | 'awaiting_confirm' | 'done';
  handoffReason?: string;
  unresolved?: boolean;
  quality?: boolean;
}
export interface HandlerMetrics {
  toolCalls: RouteTrace['toolCalls'];
  usedGeneration: boolean;
  generationUsd: number;
  agentUsd: number;
  estimated: boolean;
  ragHits: number;
  ragMs: number;
}
export class HandlerFailure extends Error {
  readonly handoff: boolean;
  readonly kind: ToolFailureOptions['kind'];
  constructor(message: string, options: ToolFailureOptions = {}) {
    super(message); this.handoff = options.handoff ?? false; this.kind = options.kind;
  }
}
export interface HandlerContext {
  toolContext: ToolContext;
  state: DialogState;
  text: string;
  action?: ChatAction;
  intent: IntentId;
  metrics: HandlerMetrics;
  deadlineMs?: number;
  call<T>(name: string, args: Record<string, unknown>): Promise<T>;
}
export function createHandlerContext(toolContext: ToolContext, state: DialogState, text: string, intent: IntentId, action?: ChatAction, deadlineMs?: number): HandlerContext {
  const metrics: HandlerMetrics = { toolCalls: [], usedGeneration: false, generationUsd: 0, agentUsd: 0, estimated: false, ragHits: 0, ragMs: 0 };
  return { toolContext, state, text, intent, action, metrics, deadlineMs, async call<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const started = Date.now();
    const result = await runTool(name, args, toolContext);
    metrics.toolCalls.push({ name, ok: result.ok, ms: Date.now() - started });
    addHistory(state, 'tool_call', name, result.ok ? `已查询或申请：${name}` : result.reason);
    if (!result.ok) throw new HandlerFailure(result.reason, result);
    return result.data as T;
  } };
}
export const say = (text: string): HandlerResult => ({ messages: [{ role: 'ai', text }], status: 'done' });
export const ask = (text: string): HandlerResult => ({ messages: [{ role: 'ai', text }], status: 'collecting' });
