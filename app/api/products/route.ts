import { listProducts, productCategories } from '@/lib/store/collections';
import { ApiError, respond } from '@/lib/store/http';
import type { ProductCategory } from '@/lib/types';
export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  return respond(() => {
    const params = new URL(request.url).searchParams;
    const category = params.get('category') || undefined;
    if (category && !productCategories.includes(category as ProductCategory)) throw new ApiError('BAD_REQUEST', '商品分类不正确', 400);
    return listProducts({ category: category as ProductCategory | undefined, q: params.get('q') ?? undefined });
  });
}
