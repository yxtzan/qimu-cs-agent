import { searchKnowledge } from '@/lib/rag/search';
import { jsonObject } from '@/lib/rag/http';
import { ApiError, respond } from '@/lib/store/http';
export const dynamic = 'force-dynamic';
export function POST(request: Request) {
  return respond(async () => {
    const body = await jsonObject(request);
    if (typeof body.query !== 'string' || (body.topK !== undefined && typeof body.topK !== 'number')) throw new ApiError('BAD_REQUEST', '请提供文字 query 和可选整数 topK', 400);
    return searchKnowledge(body.query, body.topK as number | undefined);
  });
}
