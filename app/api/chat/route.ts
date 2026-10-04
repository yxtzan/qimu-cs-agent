import { after } from 'next/server';
import { handleMessage } from '@/lib/brain/pipeline';
import { drainBackgroundTasks } from '@/lib/brain/background';
import { parseChatRequest, validateIdentity } from '@/lib/brain/input';
import { decideWithMock } from '@/lib/brain/decide/mock';
import { bindVisitor, currentVisitor, publicDemo } from '@/lib/store/visitor-context';
import { BUDGET_NOTICE, clientAddress, consumeChat, publicBudget } from '@/lib/store/public-limits';
import { appendMessages, getConversation } from '@/lib/store/conversations';
import { ApiError, respond } from '@/lib/store/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return respond(async () => {
    let body: unknown;
    try { body = await request.json(); } catch { throw new ApiError('BAD_REQUEST', '请求需要为有效的JSON', 400); }
    if (publicDemo()) {
      const parsed = parseChatRequest(body);
      const existing = validateIdentity(parsed);
      if (existing?.isSimulated) throw new ApiError('READ_ONLY', '模拟历史会话为只读，请新建自己的会话', 403);
      const denied = consumeChat(currentVisitor()!.sid, clientAddress(request.headers));
      if (denied) throw new ApiError('RATE_LIMITED', denied, 429);
    }
    const simplified = publicDemo() && publicBudget().exhausted;
    const result = await handleMessage(body, {
      ...(simplified ? { decide: async (_state, text) => decideWithMock(text) } : {}),
      schedule: task => {
        const captured = bindVisitor(async () => { await task(); await drainBackgroundTasks(); });
        after(async () => { await captured(); });
      },
    });
    if (simplified || (publicDemo() && publicBudget().exhausted)) {
      const [notice] = appendMessages(result.conversation.id, [{ role: 'system', text: BUDGET_NOTICE, traceId: result.trace?.id }]);
      result.messages.push(notice);
      result.conversation = getConversation(result.conversation.id)!;
    }
    after(drainBackgroundTasks);
    return result;
  });
}
