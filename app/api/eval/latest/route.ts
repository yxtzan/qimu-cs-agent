import { readLatestEval } from '@/lib/analytics/routing';
import { respond } from '@/lib/store/http';
export const dynamic = 'force-dynamic';

// GET /api/eval/latest  最近一次评测结果（npm run eval 写入 data/runtime/eval_latest.json），没有则返回 null
export function GET() {
  return respond(() => readLatestEval() ?? null);
}
