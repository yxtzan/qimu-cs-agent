import type { MetadataRoute } from "next";

/** 卖家端 PWA（docs/PRD.md §5.2）：可"添加到主屏幕"，不做离线。 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "栖木商家",
    short_name: "栖木",
    description: "栖木 QIMU 商家端：接管转人工会话、看路由看板、管理知识库与规则",
    id: "/seller",
    start_url: "/seller",
    scope: "/seller",
    display: "standalone",
    orientation: "portrait",
    lang: "zh-CN",
    background_color: "#F7F4EE",
    theme_color: "#2F4F3E",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
