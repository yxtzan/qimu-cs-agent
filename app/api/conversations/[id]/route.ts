import { openConversationForSeller } from '@/lib/store/conversations';
import { respondTo } from '../_respond';
export const dynamic = 'force-dynamic';

// GET /api/conversations/:id  会话详情（读取后 unreadForSeller 归零）
export function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return respondTo(async () => openConversationForSeller((await context.params).id));
}
