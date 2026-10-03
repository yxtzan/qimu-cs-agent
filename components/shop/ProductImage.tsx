"use client";

import { useState } from "react";

const FALLBACK_COLORS = ["#d9cfbd", "#c9d3c6", "#d8c6bd", "#c3ccd4", "#ddd2b8", "#cfc4d0"];

function pickColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return FALLBACK_COLORS[h % FALLBACK_COLORS.length];
}

interface Props {
  src: string;
  /** 商品名：加载失败时取首字做纯色块 */
  name: string;
  className?: string;
}

/** 商品图。加载失败 → 纯色块 + 商品名首字。父元素需设置尺寸（本组件填满父元素）。 */
export function ProductImage({ src, name, className = "" }: Props) {
  // 记录"哪个 src 失败了"，src 变化后自然恢复，无需在 effect 里重置状态
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc === src;

  if (failed) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center text-4xl font-medium text-white/90 ${className}`}
        style={{ background: pickColor(name) }}
        role="img"
        aria-label={name}
      >
        {name.slice(0, 1)}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={(el) => {
        // 图片在 React 水合前就已失败时 onError 不会触发，这里补一次检查
        if (el && el.complete && el.naturalWidth === 0) setFailedSrc(src);
      }}
      src={src}
      alt={name}
      loading="lazy"
      onError={() => setFailedSrc(src)}
      className={`h-full w-full object-cover ${className}`}
    />
  );
}
