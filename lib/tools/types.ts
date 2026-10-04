import type { LlmTool } from '../llm/openrouter';

export interface ToolContext { buyerId: string; conversationId: string }
export type ToolFailureKind = 'input' | 'business' | 'manual_review' | 'access' | 'system';
export interface ToolFailureOptions { handoff?: boolean; kind?: ToolFailureKind }
export type ToolResult<T = unknown> = { ok: true; data: T } | { ok: false; reason: string; handoff?: boolean; kind?: ToolFailureKind };
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: LlmTool['function']['parameters'];
  kind: 'read' | 'write' | 'action';
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}
export class ToolError extends Error {
  readonly handoff: boolean;
  readonly kind: ToolFailureKind;
  constructor(message: string, options: ToolFailureOptions = {}) {
    super(message); this.handoff = options.handoff ?? false; this.kind = options.kind ?? 'input';
  }
}
export function textArg(args: Record<string, unknown>, name: string): string {
  const value = args[name];
  if (typeof value !== 'string' || !value.trim()) throw new ToolError(`请提供有效的 ${name}`);
  return value.trim();
}
