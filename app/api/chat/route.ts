import { after } from 'next/server';
import { handleMessage } from '@/lib/brain/pipeline';
import { ApiError, respond } from '@/lib/store/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return respond(async () => {
    let body: unknown;
    try { body = await request.json(); } catch { throw new ApiError('BAD_REQUEST', '请求需要为有效的JSON', 400); }
    return handleMessage(body, { schedule: task => after(task) });
  });
}
