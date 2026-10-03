import { NextResponse } from 'next/server';
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
  try { return NextResponse.json(await read()); }
  catch (error) {
    if (error instanceof ApiError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    console.error('[shop-api]', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: '数据暂时无法读取，请运行 npm run seed 重置演示数据' } }, { status: 500 });
  }
}
