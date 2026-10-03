import { getProduct } from '@/lib/store/collections';
import { ApiError, respond } from '@/lib/store/http';
export const dynamic = 'force-dynamic';
export function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const product = getProduct((await context.params).id);
    if (!product) throw new ApiError('NOT_FOUND', '没有找到这个商品', 404);
    return product;
  });
}
