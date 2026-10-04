import { NextResponse } from 'next/server';
import { cleanupVisitors, publicDemo } from '@/lib/store/visitor-context';
export const dynamic = 'force-dynamic';
export function GET() {
  if (publicDemo()) cleanupVisitors();
  return NextResponse.json({ ok: true });
}
