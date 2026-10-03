import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Do not let `next dev` rewrite AGENTS.md (it is maintained by hand, see docs).
  agentRules: false,
};

export default nextConfig;
