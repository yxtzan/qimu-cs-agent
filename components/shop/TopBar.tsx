"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { BuyerSwitcher } from "./BuyerSwitcher";
import { PRODUCT_CATEGORIES } from "./labels";

function navClass(active: boolean) {
  return `relative whitespace-nowrap px-1 py-1 text-sm transition ${
    active ? "font-medium text-brand" : "text-warm hover:text-foreground"
  }`;
}

function Underline({ active }: { active: boolean }) {
  return active ? <span className="absolute inset-x-0 -bottom-[17px] h-0.5 rounded-full bg-brand" /> : null;
}

function CategoryNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const category = params.get("category");
  const onHome = pathname === "/";
  return (
    <nav className="flex items-center gap-6" aria-label="商品分类">
      <Link href="/" className={navClass(onHome && !category)}>
        全部
        <Underline active={onHome && !category} />
      </Link>
      {PRODUCT_CATEGORIES.map((c) => {
        const active = onHome && category === c;
        return (
          <Link key={c} href={`/?category=${encodeURIComponent(c)}`} className={navClass(active)}>
            {c}
            <Underline active={active} />
          </Link>
        );
      })}
    </nav>
  );
}

function CategoryNavFallback() {
  return (
    <nav className="flex items-center gap-6" aria-hidden>
      <span className={navClass(false)}>全部</span>
      {PRODUCT_CATEGORIES.map((c) => (
        <span key={c} className={navClass(false)}>
          {c}
        </span>
      ))}
    </nav>
  );
}

function SearchBox() {
  const router = useRouter();
  const [value, setValue] = useState("");
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        router.push(q ? `/?q=${encodeURIComponent(q)}` : "/");
      }}
      className="relative hidden xl:block"
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 16 16"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-warm"
        aria-hidden
      >
        <circle cx="7" cy="7" r="4.8" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="m10.8 10.8 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="搜索商品"
        className="h-9 w-44 rounded-full border border-line bg-white pl-9 pr-3 text-sm outline-none transition placeholder:text-warm/70 focus:border-brand/50 focus:ring-2 focus:ring-brand/10"
      />
    </form>
  );
}

export function TopBar() {
  const pathname = usePathname();
  const onOrders = pathname.startsWith("/orders");
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-cream/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-8 px-6">
        <Link href="/" className="flex items-baseline gap-2" aria-label="栖木 QIMU 首页">
          <span className="text-xl font-semibold tracking-wide text-brand">栖木</span>
          <span className="text-sm font-medium tracking-[0.28em] text-brand/70">QIMU</span>
        </Link>

        <div className="hidden min-w-0 flex-1 lg:block">
          <Suspense fallback={<CategoryNavFallback />}>
            <CategoryNav />
          </Suspense>
        </div>
        <div className="flex-1 lg:hidden" />

        <div className="flex items-center gap-5">
          <SearchBox />
          <Link href="/orders" className={navClass(onOrders)}>
            我的订单
            <Underline active={onOrders} />
          </Link>
          <BuyerSwitcher />
        </div>
      </div>
    </header>
  );
}
