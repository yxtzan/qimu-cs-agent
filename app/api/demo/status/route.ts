import { NextResponse } from 'next/server';
import { BUDGET_NOTICE, nextBudgetReset, publicBudget } from '@/lib/store/public-limits';
import { publicDemo } from '@/lib/store/visitor-context';
export const dynamic = 'force-dynamic';
export function GET() {
  if (!publicDemo()) return NextResponse.json({ error: { code: 'NOT_FOUND', message: '未开启公开演示' } }, { status: 404 });
  const { exhausted } = publicBudget();
  return NextResponse.json({ simplified: exhausted, message: exhausted ? BUDGET_NOTICE : '', resetsAt: nextBudgetReset() }, { headers: { 'Cache-Control': 'no-store' } });
}
