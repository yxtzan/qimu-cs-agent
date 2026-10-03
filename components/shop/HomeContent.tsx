"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getProducts } from "@/lib/api-client";
import type { ProductCategory } from "@/lib/types";
import { PRODUCT_CATEGORIES } from "./labels";
import { ProductCard } from "./ProductCard";
import { ProductImage } from "./ProductImage";
import { useAsync } from "./useAsync";

const SERVICES = [
  { title: "满 ¥99 包邮", desc: "金卡会员全部顺丰" },
  { title: "7 天无理由", desc: "吊牌完好即可退换" },
  { title: "48 小时发货", desc: "付款后 48 小时内发出" },
  { title: "智能客服在线", desc: "24 小时 · 人工 9:00–23:00" },
];

function Hero() {
  return (
    <section className="relative overflow-hidden rounded-[20px] bg-brand text-white">
      <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/5" />
      <div className="pointer-events-none absolute -bottom-32 left-1/3 h-80 w-80 rounded-full bg-white/[0.04]" />
      <div className="relative grid grid-cols-12 items-center gap-8 px-12 py-14">
        <div className="col-span-7">
          <p className="text-xs font-medium tracking-[0.35em] text-white/60">AUTUMN · WINTER 2026</p>
          <h1 className="mt-5 text-5xl font-semibold leading-tight tracking-wide">
            慢一点，
            <br />
            穿久一点。
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/75">
            为 25–35 岁的通勤与日常而做。好面料、好版型，每一件都值得被认真穿很多年。
          </p>
          <div className="mt-8 flex items-center gap-4">
            <a
              href="#products"
              className="rounded-full bg-white px-7 py-3 text-sm font-medium text-brand transition hover:bg-cream"
            >
              逛逛新品
            </a>
            <Link href="/orders" className="text-sm text-white/80 underline-offset-4 transition hover:text-white hover:underline">
              查看我的订单 →
            </Link>
          </div>
        </div>
        <div className="col-span-5 flex items-end justify-end gap-4">
          <div className="h-64 w-40 translate-y-6 overflow-hidden rounded-2xl shadow-lift ring-1 ring-white/20">
            <ProductImage category="外套" color="燕麦色" name="燕麦色羊毛混纺大衣" />
          </div>
          <div className="h-72 w-44 -translate-y-4 overflow-hidden rounded-2xl shadow-lift ring-1 ring-white/20">
            <ProductImage category="上衣" color="雾蓝" name="云感真丝衬衫" />
          </div>
          <div className="hidden h-56 w-36 translate-y-10 overflow-hidden rounded-2xl shadow-lift ring-1 ring-white/20 2xl:block">
            <ProductImage category="连衣裙" color="蓝底白花" name="法式碎花茶歇裙" />
          </div>
        </div>
      </div>
    </section>
  );
}

function ServiceStrip() {
  return (
    <section className="mt-6 grid grid-cols-4 gap-4">
      {SERVICES.map((s) => (
        <div key={s.title} className="rounded-card border border-line bg-white/60 px-5 py-4">
          <div className="text-sm font-medium text-brand">{s.title}</div>
          <div className="mt-1 text-xs text-warm">{s.desc}</div>
        </div>
      ))}
    </section>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-4 gap-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-card bg-white shadow-card">
          <div className="aspect-[3/4] animate-pulse bg-[#ece7dc]" />
          <div className="space-y-2 px-4 py-4">
            <div className="h-4 w-3/4 animate-pulse rounded bg-line" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-line" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function HomeContent() {
  const params = useSearchParams();
  const rawCategory = params.get("category");
  const category = PRODUCT_CATEGORIES.includes(rawCategory as ProductCategory)
    ? (rawCategory as ProductCategory)
    : undefined;
  const q = params.get("q")?.trim() || undefined;

  const { data, error, loading } = useAsync(() => getProducts({ category, q }), [category, q]);

  const title = q ? `「${q}」的搜索结果` : category ?? "全部商品";

  return (
    <main className="mx-auto w-full max-w-[1280px] px-6 pt-8">
      <Hero />
      <ServiceStrip />

      <section id="products" className="scroll-mt-24 pt-14">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
            <p className="mt-1 text-sm text-warm">
              {loading && !data ? "加载中…" : `共 ${data?.length ?? 0} 件 · 按销量排序`}
            </p>
          </div>
          <nav className="flex flex-wrap justify-end gap-2" aria-label="商品分类">
            <Link
              href="/"
              className={`rounded-full border px-4 py-1.5 text-sm transition ${
                !category && !q
                  ? "border-brand bg-brand text-white"
                  : "border-line bg-white text-warm hover:border-brand/40 hover:text-foreground"
              }`}
            >
              全部
            </Link>
            {PRODUCT_CATEGORIES.map((c) => (
              <Link
                key={c}
                href={`/?category=${encodeURIComponent(c)}`}
                className={`rounded-full border px-4 py-1.5 text-sm transition ${
                  category === c
                    ? "border-brand bg-brand text-white"
                    : "border-line bg-white text-warm hover:border-brand/40 hover:text-foreground"
                }`}
              >
                {c}
              </Link>
            ))}
          </nav>
        </div>

        {error ? (
          <div className="rounded-card border border-line bg-white px-6 py-16 text-center text-warm">
            {error.message}
          </div>
        ) : loading && !data ? (
          <GridSkeleton />
        ) : data && data.length === 0 ? (
          <div className="rounded-card border border-dashed border-line px-6 py-20 text-center">
            <p className="text-warm">没有找到相关商品</p>
            <Link href="/" className="mt-3 inline-block text-sm text-brand underline-offset-4 hover:underline">
              看看全部商品
            </Link>
          </div>
        ) : (
          <div className={`grid grid-cols-4 gap-6 transition-opacity ${loading ? "opacity-60" : ""}`}>
            {data?.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </section>
    </main>
  );
}
