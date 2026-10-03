import { incrementMisfire } from '@/lib/rules';
import { ConversationError, getTrace, isMisfireMarked, markMisfire } from '@/lib/store/conversations';
import { respondTo } from '../../../conversations/_respond';
export const dynamic = 'force-dynamic';

// POST /api/traces/:id/misfire  卖家标记误判；若是 L1 规则命中，对应规则 misfireCount++（同一条 trace 只计一次）
export function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  return respondTo(async () => {
    const trace = getTrace((await context.params).id);
    if (!trace) throw new ConversationError('NOT_FOUND', '没有找到这条路由记录', 404);
    if (!isMisfireMarked(trace.id)) {
      markMisfire(trace.id);
      if (trace.ruleId) incrementMisfire(trace.ruleId);
    }
    return trace;
  });
}
