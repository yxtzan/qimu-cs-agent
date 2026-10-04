import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Do not let `next dev` rewrite AGENTS.md (it is maintained by hand, see docs).
  agentRules: false,
  // 关掉左下角开发角标，避免挡住卖家端底部导航的「会话」（T15b）
  devIndicators: false,
};

export default nextConfig;
