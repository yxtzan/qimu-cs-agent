import { closeConversation } from '@/lib/store/conversations';
import { respondTo } from '../../_respond';
export const dynamic = 'force-dynamic';

// POST /api/conversations/:id/close  结束会话
export function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  return respondTo(async () => closeConversation((await context.params).id));
}
