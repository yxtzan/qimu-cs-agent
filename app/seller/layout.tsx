import type { Metadata, Viewport } from "next";
import { SellerShell } from "@/components/seller/SellerShell";

// PWA：manifest 由 app/manifest.ts 提供（Next 自动注入 <link rel="manifest">）；
// 这里补上 iOS "添加到主屏幕" 需要的 meta 与图标。
export const metadata: Metadata = {
  title: { default: "栖木商家", template: "%s · 栖木商家" },
  description: "栖木 QIMU 商家端：接管转人工会话、查看路由看板、管理知识库与规则",
  applicationName: "栖木商家",
  appleWebApp: { capable: true, title: "栖木商家", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  other: {
    // Next 的 appleWebApp.capable 只输出 mobile-web-app-capable；iOS Safari 仍认旧名，这里显式补上
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#2F4F3E",
};

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return <SellerShell>{children}</SellerShell>;
}
