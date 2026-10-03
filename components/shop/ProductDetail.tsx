"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { getProduct } from "@/lib/api-client";
import type { Product, Size } from "@/lib/types";
import { COLOR_SWATCH, SIZE_CHART } from "./labels";
import { formatSales, money } from "./format";
import { ProductImage } from "./ProductImage";
import { PlainBadge } from "./StatusBadge";
import { useShop } from "./ShopProvider";
import { useAsync } from "./useAsync";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm text-warm">
      <svg width="14" height="14" viewBox="0 0 16 16" className="text-[#c9a24a]" aria-hidden>
        <path
          d="m8 1.5 1.9 4.1 4.5.5-3.3 3 .9 4.4L8 11.4l-4 2.1.9-4.4-3.3-3 4.5-.5z"
          fill="currentColor"
        />
      </svg>
      <span className="font-medium text-foreground">{rating.toFixed(1)}</span>
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card bg-white p-7 shadow-card">
      <h2 className="mb-4 text-base font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function stockText(stock: number, restockDate?: string): { text: string; tone: "ok" | "low" | "out" } {
  if (stock <= 0) {
    return {
      text: restockDate
        ? `暂时缺货，预计 ${Number(restockDate.slice(5, 7))} 月 ${Number(restockDate.slice(8, 10))} 日补货`
        : "暂时缺货",
      tone: "out",
    };
  }
  if (stock <= 5) return { text: `现货仅剩 ${stock} 件`, tone: "low" };
  if (stock <= 10) return { text: `现货 ${stock} 件`, tone: "ok" };
  return { text: "现货充足", tone: "ok" };
}

function Detail({ product }: { product: Product }) {
  const { openChat } = useShop();
  const skuOf = useMemo(() => {
    const map = new Map<string, Product["skus"][number]>();
    product.skus.forEach((s) => map.set(`${s.color}|${s.size}`, s));
    return (c: string, s: Size) => map.get(`${c}|${s}`);
  }, [product.skus]);

  const [color, setColor] = useState<string>(product.colors[0]);
  // 默认选第一个有货的尺码；之后切换颜色保留尺码（缺货时会显示缺货与补货时间）
  const [size, setSize] = useState<Size | null>(
    () => product.sizes.find((s) => (skuOf(product.colors[0], s)?.stock ?? 0) > 0) ?? null,
  );
  const [notice, setNotice] = useState(false);

  const sku = size ? skuOf(color, size) : undefined;
  const stock = sku ? stockText(sku.stock, sku.restockDate) : null;

  return (
    <main className="mx-auto w-full max-w-[1280px] px-6 pb-4 pt-6">
      <nav className="mb-6 flex items-center gap-2 text-sm text-warm" aria-label="面包屑">
        <Link href="/" className="hover:text-brand">
          首页
        </Link>
        <span>/</span>
        <Link href={`/?category=${encodeURIComponent(product.category)}`} className="hover:text-brand">
          {product.category}
        </Link>
        <span>/</span>
        <span className="text-foreground">{product.name}</span>
      </nav>

      <div className="grid grid-cols-12 gap-12">
        {/* 图片 */}
        <div className="col-span-6 flex gap-4">
          <div className="flex w-20 shrink-0 flex-col gap-3">
            {product.colors.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`查看${c}`}
                aria-pressed={c === color}
                className={`aspect-[3/4] overflow-hidden rounded-lg bg-[#ece7dc] ring-2 transition ${
                  c === color ? "ring-brand" : "ring-transparent opacity-70 hover:opacity-100"
                }`}
              >
                <ProductImage category={product.category} color={c} name={product.name} />
              </button>
            ))}
          </div>
          <div className="aspect-[3/4] flex-1 overflow-hidden rounded-card bg-[#ece7dc] shadow-card">
            <ProductImage category={product.category} color={color} name={product.name} />
          </div>
        </div>

        {/* 信息 */}
        <div className="col-span-6">
          <div className="flex flex-wrap items-center gap-2">
            {product.tags.map((t) => (
              <PlainBadge key={t} tone="green">
                {t}
              </PlainBadge>
            ))}
          </div>
          <h1 className="mt-3 text-3xl font-semibold leading-snug text-foreground">{product.name}</h1>
          <div className="mt-3 flex items-center gap-4 text-sm text-warm">
            <Stars rating={product.rating} />
            <span className="h-3 w-px bg-line" />
            <span>已售 {formatSales(product.sales)}</span>
            <span className="h-3 w-px bg-line" />
            <span>
              {product.category} · {product.fit}版型
            </span>
          </div>

          <div className="mt-6 flex items-baseline gap-3 rounded-card bg-white px-6 py-5 shadow-card">
            <span className="text-4xl font-semibold text-brand">{money(product.price)}</span>
            {product.originalPrice && (
              <span className="text-sm text-warm line-through">{money(product.originalPrice)}</span>
            )}
            <span className="ml-auto text-xs text-warm">满 ¥99 包邮 · 7 天无理由</span>
          </div>

          <div className="mt-7">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium">颜色 · <span className="text-warm">{color}</span></span>
            </div>
            <div className="flex flex-wrap gap-3">
              {product.colors.map((c) => {
                const active = c === color;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-pressed={active}
                    className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
                      active ? "border-brand bg-brand-soft text-brand" : "border-line bg-white hover:border-brand/40"
                    }`}
                  >
                    <span
                      className="h-4 w-4 rounded-full ring-1 ring-black/10"
                      style={{ background: COLOR_SWATCH[c] ?? "#cfc9bc" }}
                    />
                    {c}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium">
                尺码 · <span className="text-warm">{size ?? "请选择"}</span>
              </span>
              <a href="#size-chart" className="text-xs text-brand underline-offset-4 hover:underline">
                查看尺码表
              </a>
            </div>
            <div className="flex flex-wrap gap-3">
              {product.sizes.map((s) => {
                const out = (skuOf(color, s)?.stock ?? 0) <= 0;
                const active = s === size;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSize(s)}
                    aria-pressed={active}
                    className={`relative h-11 min-w-14 rounded-lg border px-4 text-sm transition ${
                      active
                        ? "border-brand bg-brand text-white"
                        : out
                          ? "border-dashed border-line bg-transparent text-warm/60 hover:border-warm/50"
                          : "border-line bg-white hover:border-brand/40"
                    }`}
                  >
                    {s}
                    {out && !active && <span className="absolute -right-1 -top-2 rounded bg-[#efece5] px-1 text-[10px] text-warm">缺货</span>}
                  </button>
                );
              })}
            </div>
            {stock && (
              <p
                className={`mt-3 text-sm ${
                  stock.tone === "out" ? "text-risk" : stock.tone === "low" ? "text-[#a16207]" : "text-success"
                }`}
                data-testid="stock-text"
              >
                {color} · {size}：{stock.text}
              </p>
            )}
          </div>

          <div className="mt-8 flex gap-3">
            <button
              type="button"
              disabled={!sku || sku.stock <= 0}
              onClick={() => setNotice(true)}
              className="h-12 flex-1 rounded-full bg-brand text-[15px] font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-warm/40"
            >
              加入购物车
            </button>
            <button
              type="button"
              onClick={() => openChat({ productId: product.id })}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full border border-brand bg-white text-[15px] font-medium text-brand transition hover:bg-brand-soft"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden>
                <path
                  d="M4 4.5h12a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H9l-3.5 3v-3H4A1.5 1.5 0 0 1 2.5 12V6A1.5 1.5 0 0 1 4 4.5Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
              问客服
            </button>
          </div>
          {notice && (
            <p className="mt-3 rounded-lg bg-brand-soft px-4 py-2.5 text-sm text-brand">
              这是演示商城，暂不支持下单。有什么想了解的，点「问客服」试试吧。
            </p>
          )}

          <ul className="mt-8 grid grid-cols-2 gap-x-6 gap-y-2.5 border-t border-line pt-6 text-sm text-warm">
            {product.highlights.map((h) => (
              <li key={h} className="flex items-start gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
                {h}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-14 grid grid-cols-12 gap-6">
        <div className="col-span-7 space-y-6">
          <Section title="商品介绍">
            <p className="leading-relaxed text-foreground/80">{product.description}</p>
          </Section>
          <Section title="面料与洗护">
            <dl className="grid grid-cols-[88px_1fr] gap-y-3 text-sm">
              <dt className="text-warm">材质成分</dt>
              <dd>{product.material}</dd>
              <dt className="text-warm">版型</dt>
              <dd>{product.fit}</dd>
              <dt className="text-warm">洗护说明</dt>
              <dd className="leading-relaxed text-foreground/80">{product.care}</dd>
            </dl>
          </Section>
        </div>
        <div className="col-span-5" id="size-chart">
          <Section title="尺码表">
            <table className="w-full text-center text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-warm">
                  <th className="py-2 text-left font-normal">尺码</th>
                  <th className="py-2 font-normal">身高 cm</th>
                  <th className="py-2 font-normal">体重 kg</th>
                  <th className="py-2 font-normal">胸围</th>
                  <th className="py-2 font-normal">腰围</th>
                </tr>
              </thead>
              <tbody>
                {SIZE_CHART.map((r) => {
                  const offered = product.sizes.includes(r.size as Size);
                  return (
                    <tr
                      key={r.size}
                      className={`border-b border-line/60 last:border-0 ${offered ? "" : "text-warm/50"} ${
                        r.size === size ? "bg-brand-soft/60" : ""
                      }`}
                    >
                      <td className="py-2.5 text-left font-medium">{r.size}</td>
                      <td>{r.height}</td>
                      <td>{r.weight}</td>
                      <td>{r.bust}</td>
                      <td>{r.waist}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-5 flex items-center justify-between rounded-lg bg-cream px-4 py-3 text-sm">
              <span className="text-warm">拿不准尺码？</span>
              <button
                type="button"
                onClick={() => openChat({ productId: product.id })}
                className="font-medium text-brand underline-offset-4 hover:underline"
              >
                问问客服，帮你推荐 →
              </button>
            </div>
          </Section>
        </div>
      </div>
    </main>
  );
}

function DetailSkeleton() {
  return (
    <main className="mx-auto grid w-full max-w-[1280px] grid-cols-12 gap-12 px-6 pt-12">
      <div className="col-span-6 aspect-[3/4] animate-pulse rounded-card bg-[#ece7dc]" />
      <div className="col-span-6 space-y-4">
        <div className="h-8 w-2/3 animate-pulse rounded bg-line" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-line" />
        <div className="h-20 animate-pulse rounded-card bg-line/60" />
      </div>
    </main>
  );
}

export function ProductDetail({ id }: { id: string }) {
  const { data, error, loading } = useAsync(() => getProduct(id), [id]);
  if (loading && !data) return <DetailSkeleton />;
  if (error || !data) {
    return (
      <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <p className="text-lg text-foreground">{error?.message ?? "没有找到这件商品"}</p>
        <Link href="/" className="rounded-full bg-brand px-6 py-2.5 text-sm text-white hover:bg-brand-dark">
          回首页逛逛
        </Link>
      </main>
    );
  }
  return <Detail key={data.id} product={data} />;
}
