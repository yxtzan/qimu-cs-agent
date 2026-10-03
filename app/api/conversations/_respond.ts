/**
 * T16 各路由共用的小工具（下划线开头的文件不是路由）：
 * - respondTo：在 lib/store/http.ts 的 respond 之上，把数据层的 ConversationError / RuleError 转成标准错误响应
 * - readJsonBody：读 JSON 请求体，格式不对返回 400
 */
import { RuleError } from "@/lib/rules";
import { ConversationError } from "@/lib/store/conversations";
import { ApiError, respond } from "@/lib/store/http";

export function respondTo(read: () => unknown | Promise<unknown>) {
  return respond(async () => {
    try {
      return await read();
    } catch (error) {
      if (error instanceof ConversationError || error instanceof RuleError) {
        throw new ApiError(error.code, error.message, error.status);
      }
      throw error;
    }
  });
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError("BAD_REQUEST", "请求内容不是合法的 JSON", 400);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError("BAD_REQUEST", "请求内容格式不正确", 400);
  }
  return body as Record<string, unknown>;
}
