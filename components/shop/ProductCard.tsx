import Link from "next/link";
import type { Product } from "@/lib/types";
import { formatSales, money } from "./format";
import { ProductImage } from "./ProductImage";

export function ProductCard({ product }: { product: Product }) {
  const soldOut = product.skus.every((s) => s.stock <= 0);
  return (
    <Link
      href={`/product/${product.id}`}
      className="group block overflow-hidden rounded-card bg-white shadow-card transition duration-300 hover:-translate-y-0.5 hover:shadow-lift"
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-[#ece7dc]">
        <div className="h-full w-full transition duration-500 group-hover:scale-[1.03]">
          <ProductImage src={product.images[0]} name={product.name} />
        </div>
        {product.tags[0] && (
          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-medium text-brand backdrop-blur">
            {product.tags[0]}
          </span>
        )}
        {soldOut && (
          <span className="absolute inset-x-0 bottom-0 bg-foreground/70 py-1.5 text-center text-xs text-white">
            已售罄
          </span>
        )}
      </div>
      <div className="px-4 pb-4 pt-3.5">
        <h3 className="truncate text-[15px] font-medium text-foreground">{product.name}</h3>
        <p className="mt-0.5 truncate text-xs text-warm">
          {product.category} · {product.colors.join(" / ")}
        </p>
        <div className="mt-3 flex items-baseline justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold text-brand">{money(product.price)}</span>
            {product.originalPrice && (
              <span className="text-xs text-warm line-through">{money(product.originalPrice)}</span>
            )}
          </div>
          <span className="text-xs text-warm">已售 {formatSales(product.sales)}</span>
        </div>
      </div>
    </Link>
  );
}
