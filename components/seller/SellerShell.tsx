"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SellerProvider, useSeller } from "./SellerProvider";

interface TabDef {
  href: string;
  label: string;
  icon: (props: { active: boolean }) => React.ReactNode;
  match: (path: string) => boolean;
}

const stroke = (active: boolean) => ({
  fill: "none",
  stroke: "currentColor",
  strokeWidth: active ? 2 : 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

const TABS: TabDef[] = [
  {
    href: "/seller",
    label: "会话",
    match: (p) => p === "/seller" || p.startsWith("/seller/c/"),
    icon: ({ active }) => (
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden {...stroke(active)}>
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4h0A2.5 2.5 0 0 1 4 13.5v-8Z" />
        <path d="M8.5 8.5h7M8.5 11.5h4" />
      </svg>
    ),
  },
  {
    href: "/seller/dashboard",
    label: "看板",
    match: (p) => p.startsWith("/seller/dashboard"),
    icon: ({ active }) => (
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden {...stroke(active)}>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    ),
  },
  {
    href: "/seller/kb",
    label: "知识库",
    match: (p) => p.startsWith("/seller/kb"),
    icon: ({ active }) => (
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden {...stroke(active)}>
        <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5v-15Z" />
        <path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3M9 7.5h6" />
      </svg>
    ),
  },
  {
    href: "/seller/rules",
    label: "规则",
    match: (p) => p.startsWith("/seller/rules"),
    icon: ({ active }) => (
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden {...stroke(active)}>
        <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" />
      </svg>
    ),
  },
];

function TabBar() {
  const pathname = usePathname();
  const { waitingCount } = useSeller();
  return (
    <nav
      aria-label="底部导航"
      className="shrink-0 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="grid grid-cols-4">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                  active ? "text-brand" : "text-warm active:text-brand"
                }`}
              >
                <span className="relative">
                  {tab.icon({ active })}
                  {tab.href === "/seller" && waitingCount > 0 ? (
                    <span
                      aria-label={`${waitingCount} 个待人工`}
                      className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-white"
                    >
                      {waitingCount}
                    </span>
                  ) : null}
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * 卖家端外壳：移动端优先（基准 390×844）。
 * 手机上占满屏幕；桌面上居中显示 430px 宽的"手机容器"，背景浅灰。
 */
export function SellerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // 会话详情页有自己的输入栏，不显示底部 Tab（类似微信聊天页）
  const hideTabs = pathname.startsWith("/seller/c/");
  return (
    <SellerProvider>
      <div className="min-h-dvh bg-[#E9E7E2] md:flex md:items-center md:justify-center md:py-6">
        <div className="relative mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-cream md:h-[min(900px,calc(100dvh-48px))] md:rounded-[28px] md:shadow-lift md:ring-1 md:ring-black/5">
          <main className="flex min-h-0 flex-1 flex-col">{children}</main>
          {hideTabs ? null : <TabBar />}
        </div>
      </div>
    </SellerProvider>
  );
}
