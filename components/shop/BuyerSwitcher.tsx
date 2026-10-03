"use client";

import { useEffect, useRef, useState } from "react";
import type { Buyer } from "@/lib/types";
import { useShop } from "./ShopProvider";

function Avatar({ buyer, size = 32 }: { buyer: Buyer; size?: number }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  if (failed || !buyer.avatar) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-full bg-brand text-sm font-medium text-white"
        style={style}
      >
        {buyer.nickname.slice(0, 1)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={buyer.avatar}
      alt={buyer.nickname}
      onError={() => setFailed(true)}
      className="shrink-0 rounded-full object-cover"
      style={style}
    />
  );
}

const LEVEL_CLASS: Record<Buyer["memberLevel"], string> = {
  普通: "bg-[#efece5] text-warm",
  银卡: "bg-[#e9ebee] text-[#5d6672]",
  金卡: "bg-[#f6ecd2] text-[#8a6a1c]",
};

export function BuyerSwitcher() {
  const { buyers, buyer, setBuyerId } = useShop();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!buyer) {
    return <div className="h-9 w-36 animate-pulse rounded-full bg-line/70" aria-hidden />;
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid="buyer-switcher"
        className="flex items-center gap-2 rounded-full border border-line bg-white py-1 pl-1 pr-3 text-sm transition hover:border-brand/40"
      >
        <Avatar buyer={buyer} />
        <span className="font-medium text-foreground">{buyer.nickname}</span>
        <span className={`rounded px-1.5 py-0.5 text-[11px] ${LEVEL_CLASS[buyer.memberLevel]}`}>
          {buyer.memberLevel}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          className={`text-warm transition ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="fade-up absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-card border border-line bg-white shadow-lift"
        >
          <div className="border-b border-line px-4 py-2.5 text-xs text-warm">切换演示买家（不同买家有不同订单）</div>
          <ul className="max-h-80 overflow-y-auto py-1">
            {buyers.map((b) => {
              const active = b.id === buyer.id;
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      setBuyerId(b.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-cream ${
                      active ? "bg-brand-soft/60" : ""
                    }`}
                  >
                    <Avatar buyer={b} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{b.nickname}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[11px] ${LEVEL_CLASS[b.memberLevel]}`}>
                          {b.memberLevel}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-warm">
                        {b.id}
                        {b.heightCm && b.weightKg ? ` · ${b.heightCm}cm / ${b.weightKg}kg` : ""}
                      </span>
                    </span>
                    {active && (
                      <svg width="16" height="16" viewBox="0 0 16 16" className="text-brand" aria-hidden>
                        <path
                          d="m3.5 8.5 3 3 6-7"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
