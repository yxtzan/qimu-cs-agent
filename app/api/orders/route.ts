import { listOrders, orderStatuses } from '@/lib/store/collections';
import { ApiError, requireBuyer, respond } from '@/lib/store/http';
import type { OrderStatus } from '@/lib/types';
export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  return respond(() => {
    const params = new URL(request.url).searchParams;
    const buyerId = requireBuyer(params);
    const status = params.get('status') || undefined;
    if (status && !orderStatuses.includes(status as OrderStatus)) throw new ApiError('BAD_REQUEST', '订单状态不正确', 400);
    return listOrders(buyerId, status as OrderStatus | undefined);
  });
}
