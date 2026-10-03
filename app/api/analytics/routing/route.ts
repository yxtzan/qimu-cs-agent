import { getRoutingAnalytics } from '@/lib/analytics/routing';
import { ApiError, respond } from '@/lib/store/http';
export const dynamic = 'force-dynamic';

// GET /api/analytics/routing?range=today|7d&includeSimulated=1  看板数据（口径见 CONTRACTS §6）
export function GET(request: Request) {
  return respond(() => {
    const params = new URL(request.url).searchParams;
    const range = params.get('range') ?? '7d';
    if (range !== 'today' && range !== '7d') throw new ApiError('BAD_REQUEST', 'range 只能是 today 或 7d', 400);
    const includeSimulated = !['0', 'false'].includes(params.get('includeSimulated') ?? '1');
    return getRoutingAnalytics(range, includeSimulated);
  });
}
