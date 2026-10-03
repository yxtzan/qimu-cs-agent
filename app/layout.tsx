import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "栖木 QIMU",
  description: "栖木 QIMU 女装 — 客服 Agent 演示",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
