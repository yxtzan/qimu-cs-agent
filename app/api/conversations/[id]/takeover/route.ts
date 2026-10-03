import { takeoverConversation } from '@/lib/store/conversations';
import { respondTo } from '../../_respond';
export const dynamic = 'force-dynamic';

// POST /api/conversations/:id/takeover  卖家接管
export function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  return respondTo(async () => takeoverConversation((await context.params).id));
}
