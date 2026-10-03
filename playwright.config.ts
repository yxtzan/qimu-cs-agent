import { defineConfig, devices } from "@playwright/test";

/**
 * T18 演示剧本自动化冒烟测试。
 * - 默认 mock 模式（NEXT_PUBLIC_USE_MOCK=1）；联调真实后端时用 `NEXT_PUBLIC_USE_MOCK=0 npm run e2e`。
 * - 本机已经有 `npm run dev` 在跑就直接复用，没有就自动启动。
 * - 失败时保留截图（e2e/artifacts/FAILED-*.png）和 trace（e2e/artifacts/trace.zip，用 `npx playwright show-trace` 打开）。
 */
const PORT = Number(process.env.E2E_PORT ?? 3000);
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK ?? "1";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/test-results",
  // 6 步是一条连续的剧本（第 5 步依赖第 4 步），必须按顺序、单线程执行
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [["list"], ["html", { outputFolder: "e2e/report", open: "never" }]],
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    // 剧本里的买家 / 卖家页面共用一个手动创建的浏览器上下文，trace 和失败截图由 e2e/demo.spec.ts 自己保存
    trace: "off",
    screenshot: "off",
    locale: "zh-CN",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { NEXT_PUBLIC_USE_MOCK: USE_MOCK, PORT: String(PORT) },
  },
});
