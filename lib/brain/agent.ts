import type { HandlerContext, HandlerResult } from './handlers/context';
// T05 replaces this entry point with the bounded tool-calling agent loop.
export async function runAgent(_ctx: HandlerContext): Promise<HandlerResult> {
  void _ctx;
  return { status: 'collecting', unresolved: true, messages: [{ role: 'ai', text: '这个问题我需要再确认一下。' }] };
}
