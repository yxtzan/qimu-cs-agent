"use client";

import { useId } from "react";
import type { ProductCategory } from "@/lib/types";

/**
 * 商品图：按「类别 + 颜色」生成 SVG 服装剪影（PRD §4.1），不使用任何图库图片。
 * 商城页面与聊天窗里的商品卡片共用；切换颜色时图片跟着变色。
 * 父元素需设置尺寸（本组件填满父元素，宽高比 3:4 的容器效果最好）。
 */

// ───────────────────────── 颜色名 → 色值 ─────────────────────────

interface Fabric {
  base: string;
  /** 花型点色（有值时在衣身上叠加碎花） */
  dots?: string;
}

const FABRIC_BY_NAME: Record<string, Fabric> = {
  燕麦色: { base: "#d6c3a0" },
  燕麦: { base: "#d6c3a0" },
  炭灰: { base: "#4b4d50" },
  深灰: { base: "#5a5c5f" },
  浅灰: { base: "#b9b8b4" },
  灰: { base: "#8b8b8b" },
  象牙白: { base: "#f3ede0" },
  奶白: { base: "#f4eee2" },
  米白: { base: "#ece4d3" },
  白: { base: "#f4f1ea" },
  雾蓝: { base: "#9fb2c4" },
  蓝: { base: "#6f8fb5" },
  黑: { base: "#2a2a2c" },
  卡其: { base: "#b9a37c" },
  雾粉: { base: "#e4c4c4" },
  粉: { base: "#e4c4c4" },
  墨绿: { base: "#2f4f3e" },
  绿: { base: "#5f8a6c" },
  驼色: { base: "#b58a58" },
  棕: { base: "#8a6a4d" },
  红: { base: "#b5473d" },
  酒红: { base: "#7d2f3a" },
  黄: { base: "#d9b24c" },
  紫: { base: "#8c7aa5" },
  杏: { base: "#e8d3b5" },
  蓝底白花: { base: "#6f8fb5", dots: "#fbf8f1" },
  黑底黄花: { base: "#2b2b2d", dots: "#e3b94a" },
};

const FALLBACK_FABRICS = ["#d6c3a0", "#9fb2c4", "#c9b8a8", "#a9b9a4", "#d4b8b8", "#b8b0c4"];

function hashOf(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return h;
}

/** 颜色名 → 面料色。精确匹配 → 含关键字（如「浅杏色」含「杏」）→ 稳定的兜底色。 */
export function fabricFor(color: string | undefined, seed = ""): Fabric {
  if (color) {
    if (FABRIC_BY_NAME[color]) return FABRIC_BY_NAME[color];
    const keys = Object.keys(FABRIC_BY_NAME)
      .filter((k) => !FABRIC_BY_NAME[k].dots)
      .sort((a, b) => b.length - a.length);
    const hit = keys.find((k) => color.includes(k));
    if (hit) return FABRIC_BY_NAME[hit];
  }
  return { base: FALLBACK_FABRICS[hashOf(color ?? seed) % FALLBACK_FABRICS.length] };
}

/** 兼容订单行（OrderItem 没有 category）：按商品名关键字推断类别。 */
export function inferCategory(name: string): ProductCategory {
  if (/连衣裙|长裙|茶歇裙/.test(name) && !/半身/.test(name)) return "连衣裙";
  if (/半身裙|百褶|裙/.test(name)) return "半身裙";
  if (/大衣|外套|风衣|夹克|西装外套|羽绒|棉服/.test(name)) return "外套";
  if (/裤/.test(name)) return "裤装";
  if (/针织|毛衣|开衫|卫衣|羊绒|羊毛衫/.test(name)) return "针织衫";
  return "上衣";
}

// ───────────────────────── 颜色工具 ─────────────────────────

function shade(hex: string, amount: number): string {
  // amount < 0 → 变暗，> 0 → 变亮
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => {
    const t = amount < 0 ? 0 : 255;
    const p = Math.abs(amount);
    return Math.round((t - v) * p + v);
  };
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

// ───────────────────────── 6 个类别的剪影（画布 300×400） ─────────────────────────

interface Shape {
  /** 衣身轮廓 */
  body: string;
  /** 内部线条（缝线、门襟、褶皱等），用描边绘制 */
  lines: string[];
  /** 小圆点（纽扣） */
  buttons?: [number, number][];
}

const SHAPES: Record<ProductCategory, Shape> = {
  连衣裙: {
    body: "M122 48 L134 48 Q150 84 166 48 L178 48 L184 104 Q182 128 178 152 L254 356 Q150 378 46 356 L122 152 Q118 128 116 104 Z",
    lines: ["M121 152 Q150 160 179 152", "M150 160 L150 364", "M136 168 L100 361", "M164 168 L200 361"],
  },
  上衣: {
    body: "M120 60 Q150 86 180 60 L234 80 L274 172 L242 188 L220 140 L220 332 Q150 342 80 332 L80 140 L58 188 L26 172 L66 80 Z",
    lines: ["M150 84 L150 336", "M120 60 L134 84 L150 84 L166 84 L180 60", "M80 322 Q150 332 220 322"],
    buttons: [
      [150, 112],
      [150, 156],
      [150, 200],
      [150, 244],
      [150, 288],
    ],
  },
  针织衫: {
    body: "M118 62 Q150 82 182 62 L238 82 L266 304 L228 310 L216 156 L218 334 Q150 344 82 334 L84 156 L72 310 L34 304 L62 82 Z",
    lines: [
      "M118 62 Q150 98 182 62",
      "M84 316 Q150 328 218 316",
      "M38 296 L68 300",
      "M232 296 L262 300",
      "M150 98 L150 338",
    ],
    buttons: [
      [150, 128],
      [150, 170],
      [150, 212],
      [150, 254],
      [150, 296],
    ],
  },
  外套: {
    body: "M110 56 L150 78 L190 56 L240 76 L274 304 L238 312 L224 152 L228 360 Q150 372 72 360 L76 152 L62 312 L26 304 L60 76 Z",
    lines: [
      "M110 56 L138 154 L150 138 L162 154 L190 56",
      "M150 78 L150 366",
      "M76 340 Q150 352 228 340",
      "M96 220 L122 220 L122 250 L96 250 Z",
      "M204 220 L178 220 L178 250 L204 250 Z",
    ],
    buttons: [
      [140, 206],
      [160, 206],
      [140, 256],
      [160, 256],
      [140, 306],
      [160, 306],
    ],
  },
  裤装: {
    body: "M94 58 L206 58 L216 124 L236 362 L162 362 L150 150 L138 362 L64 362 L84 124 Z",
    lines: ["M91 80 L209 80", "M150 80 L150 150", "M92 100 Q112 130 108 150", "M208 100 Q188 130 192 150", "M122 120 L112 360", "M178 120 L188 360"],
    buttons: [[150, 94]],
  },
  半身裙: {
    body: "M104 66 L196 66 L250 352 Q150 372 50 352 Z",
    lines: [
      "M102 90 L198 90",
      "M118 94 L84 357",
      "M134 94 L117 361",
      "M150 94 L150 361",
      "M166 94 L183 361",
      "M182 94 L216 357",
    ],
  },
};

function Silhouette({ category, fabric, uid }: { category: ProductCategory; fabric: Fabric; uid: string }) {
  const shape = SHAPES[category];
  const stroke = shade(fabric.base, luminance(fabric.base) > 0.5 ? -0.28 : 0.28);
  const light = luminance(fabric.base) > 0.5;
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6f2ea" />
          <stop offset="1" stopColor="#e9e2d4" />
        </linearGradient>
        <linearGradient id={`${uid}-sheen`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="0.55" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.1" />
        </linearGradient>
        <clipPath id={`${uid}-clip`}>
          <path d={shape.body} />
        </clipPath>
        {fabric.dots ? (
          <pattern id={`${uid}-dots`} width="30" height="30" patternUnits="userSpaceOnUse">
            <circle cx="8" cy="9" r="3.2" fill={fabric.dots} />
            <circle cx="9" cy="9" r="1.2" fill={fabric.base} />
            <circle cx="23" cy="22" r="2.6" fill={fabric.dots} />
            <circle cx="24" cy="22" r="1" fill={fabric.base} />
            <circle cx="26" cy="5" r="1.4" fill={fabric.dots} opacity="0.8" />
            <circle cx="3" cy="25" r="1.4" fill={fabric.dots} opacity="0.8" />
          </pattern>
        ) : null}
      </defs>
      <rect width="300" height="400" fill={`url(#${uid}-bg)`} />
      <ellipse cx="150" cy="376" rx="104" ry="9" fill="#2b2a27" opacity="0.07" />
      <path d={shape.body} fill={fabric.base} stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
      {fabric.dots ? <rect width="300" height="400" fill={`url(#${uid}-dots)`} clipPath={`url(#${uid}-clip)`} /> : null}
      <path d={shape.body} fill={`url(#${uid}-sheen)`} />
      <g fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity={light ? 0.7 : 0.85}>
        {shape.lines.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      {shape.buttons?.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="3.4" fill={shade(fabric.base, light ? -0.12 : 0.18)} stroke={stroke} strokeWidth="1.2" />
      ))}
    </>
  );
}

interface Props {
  /** 商品类别；缺省时按 name 推断 */
  category?: ProductCategory;
  /** 当前颜色名（决定剪影的填充色） */
  color?: string;
  /** 商品名：无障碍文字，并用于推断类别 */
  name: string;
  className?: string;
}

export function ProductImage({ category, color, name, className = "" }: Props) {
  const uid = useId().replace(/:/g, "");
  const cat = category ?? inferCategory(name);
  const fabric = fabricFor(color, name);
  return (
    <svg
      viewBox="0 0 300 400"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={`${name}${color ? `（${color}）` : ""}`}
      className={`block h-full w-full ${className}`}
    >
      <Silhouette category={cat} fabric={fabric} uid={uid} />
    </svg>
  );
}
