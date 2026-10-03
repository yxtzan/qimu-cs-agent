import { getOrder } from '@/lib/store/collections';
import { ApiError, requireBuyer, respond } from '@/lib/store/http';
export const dynamic = 'force-dynamic';
export function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const buyerId = requireBuyer(new URL(request.url).searchParams);
    const order = getOrder((await context.params).id);
    if (!order) throw new ApiError('NOT_FOUND', '没有找到这个订单', 404);
    if (order.buyerId !== buyerId) throw new ApiError('FORBIDDEN', '这个订单不属于当前买家', 403);
    return order;
  });
}
