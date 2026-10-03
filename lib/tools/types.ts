import type { LlmTool } from '../llm/openrouter';

export interface ToolContext { buyerId: string; conversationId: string }
export type ToolResult<T = unknown> = { ok: true; data: T } | { ok: false; reason: string };
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: LlmTool['function']['parameters'];
  kind: 'read' | 'write' | 'action';
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}
export class ToolError extends Error {}
export function textArg(args: Record<string, unknown>, name: string): string {
  const value = args[name];
  if (typeof value !== 'string' || !value.trim()) throw new ToolError(`请提供有效的 ${name}`);
  return value.trim();
}
