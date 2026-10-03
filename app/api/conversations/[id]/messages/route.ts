import { ConversationError, getConversation, listMessages } from '@/lib/store/conversations';
import { respondTo } from '../../_respond';
export const dynamic = 'force-dynamic';

// GET /api/conversations/:id/messages?after=<messageId>  轮询新消息（不会清零卖家未读）
export function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return respondTo(async () => {
    const id = (await context.params).id;
    const conversation = getConversation(id);
    if (!conversation) throw new ConversationError('NOT_FOUND', '没有找到这个会话', 404);
    const after = new URL(request.url).searchParams.get('after') || undefined;
    return { messages: listMessages(id, { after }), conversation };
  });
}
