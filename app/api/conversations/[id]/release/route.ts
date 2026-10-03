import { releaseConversation } from '@/lib/store/conversations';
import { respondTo } from '../../_respond';
export const dynamic = 'force-dynamic';

// POST /api/conversations/:id/release  交还 AI
export function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  return respondTo(async () => releaseConversation((await context.params).id));
}
