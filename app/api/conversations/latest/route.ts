import { getLatestOpenConversation, listMessages } from '@/lib/store/conversations';
import { requireBuyer } from '@/lib/store/http';
import { respondTo } from '../_respond';
export const dynamic = 'force-dynamic';

// GET /api/conversations/latest?buyerId=B001  买家打开聊天窗时恢复最近一次未关闭的会话
export function GET(request: Request) {
  return respondTo(() => {
    const buyerId = requireBuyer(new URL(request.url).searchParams);
    const conversation = getLatestOpenConversation(buyerId);
    return { conversation: conversation ?? null, messages: conversation ? listMessages(conversation.id) : [] };
  });
}
