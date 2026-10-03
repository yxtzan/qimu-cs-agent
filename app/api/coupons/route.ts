import { listCoupons } from '@/lib/store/collections';
import { requireBuyer, respond } from '@/lib/store/http';
export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  return respond(() => listCoupons(requireBuyer(new URL(request.url).searchParams)));
}
