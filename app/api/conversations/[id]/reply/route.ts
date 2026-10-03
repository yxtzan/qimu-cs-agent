import { replyAsSeller } from '@/lib/store/conversations';
import { ApiError } from '@/lib/store/http';
import { readJsonBody, respondTo } from '../../_respond';
export const dynamic = 'force-dynamic';

// POST /api/conversations/:id/reply  { text }  卖家回复（未接管则自动接管）
export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return respondTo(async () => {
    const { text } = await readJsonBody(request);
    if (typeof text !== 'string' || !text.trim()) throw new ApiError('BAD_REQUEST', '回复内容不能为空', 400);
    if (text.length > 2000) throw new ApiError('BAD_REQUEST', '回复内容太长了（最多 2000 字）', 400);
    return replyAsSeller((await context.params).id, text.trim());
  });
}
