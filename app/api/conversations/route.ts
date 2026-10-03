import { listConversations } from '@/lib/store/conversations';
import { ApiError } from '@/lib/store/http';
import type { ConversationStatus } from '@/lib/types';
import { respondTo } from './_respond';
export const dynamic = 'force-dynamic';

const statuses: ConversationStatus[] = ['ai_active', 'waiting_human', 'human_active', 'closed'];

// GET /api/conversations?status=&includeSimulated=1  卖家会话列表
export function GET(request: Request) {
  return respondTo(() => {
    const params = new URL(request.url).searchParams;
    const status = params.get('status') || undefined;
    if (status && !statuses.includes(status as ConversationStatus)) throw new ApiError('BAD_REQUEST', '会话状态不正确', 400);
    const includeSimulated = ['1', 'true'].includes(params.get('includeSimulated') ?? '');
    return listConversations({ status: status as ConversationStatus | undefined, includeSimulated });
  });
}
