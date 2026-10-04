import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { currentVisitor, publicDemo, runVisitor, SID_COOKIE, validSid } from './visitor-context';
import { installPublicModelGuard, publicBudget } from './public-limits';
import { ensurePublicSharedData, resetDemoData } from './reset';
import { getBuyer } from './collections';

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}
export function requireBuyer(params: URLSearchParams): string {
  const id = params.get('buyerId')?.trim();
  if (!id) throw new ApiError('BAD_REQUEST', '请提供买家编号 buyerId', 400);
  if (!getBuyer(id)) throw new ApiError('NOT_FOUND', '没有找到这位买家', 404);
  return id;
}
export async function respond(read: () => unknown | Promise<unknown>): Promise<NextResponse> {
  try {
    if (!publicDemo() || currentVisitor()) return NextResponse.json(await read());
    installPublicModelGuard();
    await import('./reset-hooks');
    await ensurePublicSharedData();
    const requestHeaders = await headers();
    const cookie = requestHeaders.get('cookie')?.split(';').map(c => c.trim()).find(c => c.startsWith(`${SID_COOKIE}=`))?.slice(SID_COOKIE.length + 1);
    const sid = validSid(cookie) ? cookie : randomUUID();
    const response = await runVisitor(sid, resetDemoData, async () => {
      try { return NextResponse.json(await read()); }
      catch (error) {
        if (error instanceof ApiError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
        throw error;
      }
    });
    if (sid !== cookie) response.cookies.set(SID_COOKIE, sid, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 86400, path: '/', secure: requestHeaders.get('x-forwarded-proto') === 'https' });
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('X-Qimu-Simplified', publicBudget().exhausted ? '1' : '0');
    return response;
  }
  catch (error) {
    if (error instanceof ApiError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    console.error('[shop-api]', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: '数据暂时无法读取，请运行 npm run seed 重置演示数据' } }, { status: 500 });
  }
}
