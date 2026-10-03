import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { DEMO_NOW } from "../lib/demo-clock";

/**
 * 演示剧本（docs/PRD.md §8）自动化冒烟测试。
 *
 * 和真人演示走同一条路：打开买家端 → 右下角「演示指南」→ 点第 N 步「开始」→ 点「发送」。
 * 只断言结构化元素（卡片 / 徽标 / 状态 / 红点），不断言 AI 的具体措辞——真实后端下 AI 文案每次都不同。
 *
 * 运行：
 *   npm run e2e                                  # mock 模式（默认）
 *   NEXT_PUBLIC_USE_MOCK=0 npm run e2e           # 真实后端（T15）
 *   npx playwright test --headed                 # 看着浏览器跑
 */

const USE_MOCK = (process.env.NEXT_PUBLIC_USE_MOCK ?? "1") !== "0";
const ARTIFACTS = path.join(__dirname, "artifacts");

/** L1/L2 步骤 10 秒，L3 步骤 30 秒（任务卡 T18）。 */
const T_FAST = 10_000;
const T_L3 = 30_000;
/** 卖家端红点 / 横幅：3 秒；买家端收到卖家消息：任务卡写 2 秒，买家端轮询周期正好是 2 秒，这里留一个周期的余量。 */
const T_SELLER_DOT = 3_000;
const T_BUYER_POLL = 4_000;

const BUYER_VIEWPORT = { width: 1440, height: 900 };
const SELLER_VIEWPORT = { width: 390, height: 844 };

let context: BrowserContext;
let buyer: Page;
let seller: Page;
let baselineMessages = 0;
let failed = false;

// ───────────────────────── 工具函数 ─────────────────────────

async function shot(page: Page, name: string) {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  await page.screenshot({ path: path.join(ARTIFACTS, `${name}.png`) });
}

/**
 * 重置演示数据。
 * - 真实后端：POST /api/admin/reset
 * - mock：调用 mock 的重置（window.__qimuMock.reset()，会清掉跨标签页快照并刷新页面）
 */
async function resetDemo() {
  if (USE_MOCK) {
    await buyer.goto("/");
    await Promise.all([
      buyer.waitForEvent("load"),
      buyer.evaluate(() => (window as unknown as { __qimuMock: { reset: () => void } }).__qimuMock.reset()),
    ]);
  } else {
    const res = await buyer.request.post("/api/admin/reset");
    expect(res.ok(), "POST /api/admin/reset 应返回 200").toBeTruthy();
  }
}

/** 通过「演示指南」走第 n 步：打开浮层 → 点「开始」→ 等示例话术填好 → 点「发送」。 */
async function runGuideStep(n: number) {
  await buyer.goto("/");
  await buyer.getByTestId("guide-fab").click();
  await buyer.getByTestId(`guide-step-${n}`).click();
  await expect(buyer.getByTestId("chat-drawer")).toBeVisible();
  await expect(buyer.getByTestId("chat-input")).not.toHaveValue("", { timeout: T_FAST });
  await buyer.getByTestId("chat-send").click();
}

const drawer = () => buyer.getByTestId("chat-drawer");

/** 读取看板「今天 · 总消息数」 */
async function readTotalMessages(page: Page): Promise<number> {
  await page.goto("/seller/dashboard");
  const value = page.locator('[data-testid="metric-card"][data-label="总消息数"] [data-testid="metric-value"]');
  await expect(value).toBeVisible({ timeout: T_FAST });
  const n = Number((await value.innerText()).replace(/[^\d]/g, ""));
  expect(Number.isFinite(n)).toBeTruthy();
  return n;
}

// ───────────────────────── 剧本 ─────────────────────────

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  // 买家端和卖家端放在同一个浏览器上下文里：mock 模式靠 localStorage 跨标签页同步（和真人开两个标签页一样）
  context = await browser.newContext({ viewport: BUYER_VIEWPORT, locale: "zh-CN", baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_PORT ?? 3000}` });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  buyer = await context.newPage();
  seller = await context.newPage();
  await seller.setViewportSize(SELLER_VIEWPORT);
  fs.mkdirSync(ARTIFACTS, { recursive: true });
});

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    failed = true;
    const slug = testInfo.title.slice(0, 12).replace(/[^\w\u4e00-\u9fa5]+/g, "-");
    await buyer.screenshot({ path: path.join(ARTIFACTS, `FAILED-${slug}-buyer.png`) }).catch(() => {});
    await seller.screenshot({ path: path.join(ARTIFACTS, `FAILED-${slug}-seller.png`) }).catch(() => {});
  }
});

test.afterAll(async () => {
  await context.tracing.stop(failed ? { path: path.join(ARTIFACTS, "trace.zip") } : {});
  await context.close();
});

test("1 售前：尺码卡片推荐 M + 引用资料", async () => {
  await resetDemo();
  // 基线：第 1 步之前，看板「今天总消息数」
  baselineMessages = await readTotalMessages(seller);
  console.log(`[e2e] 第 1 步之前 今天总消息数 = ${baselineMessages}`);

  await runGuideStep(1);

  const size = drawer().getByTestId("card-size");
  await expect(size.first()).toBeVisible({ timeout: T_FAST });
  await expect(size.first()).toHaveAttribute("data-size", "M");
  await expect(drawer().getByText(/参考了 \d+ 条资料/).first()).toBeVisible({ timeout: T_FAST });
  await shot(buyer, "1-presale");
});

test("2 售中：物流时间线卡片（≥ 3 个节点）", async () => {
  await resetDemo();
  await runGuideStep(2);

  const card = drawer().getByTestId("card-logistics").first();
  await expect(card).toBeVisible({ timeout: T_FAST });
  expect(await card.locator('[data-testid="logistics-timeline"] > li').count()).toBeGreaterThanOrEqual(3);
  expect(Number(await card.getAttribute("data-events"))).toBeGreaterThanOrEqual(3);
  await shot(buyer, "2-insale");
});

test("3 售后多步：确认卡片 → 确认 → 售后单号 + 优惠券（无过期券）", async () => {
  await resetDemo();
  await runGuideStep(3);

  const confirm = drawer().getByTestId("confirm-card").first();
  await expect(confirm).toBeVisible({ timeout: T_L3 });
  await expect(confirm).toHaveAttribute("data-status", "pending");
  await shot(buyer, "3a-aftersale-confirm");

  await confirm.getByRole("button", { name: "确认", exact: true }).click();

  // 卡片锁定：不再有「确认 / 取消」按钮，状态变为 confirmed，并出现售后单号
  await expect(confirm).toHaveAttribute("data-status", "confirmed", { timeout: T_L3 });
  await expect(confirm.getByRole("button")).toHaveCount(0);
  await expect(drawer().getByTestId("card-aftersale").first()).toBeVisible({ timeout: T_FAST });
  expect(await drawer().getByTestId("card-aftersale").first().getAttribute("data-id")).toMatch(/^AS/);
  await expect(confirm).toContainText(/售后单号\s*AS/);

  // 优惠券卡片：至少一张，且全部未过期（以演示时钟为准）
  const coupons = drawer().getByTestId("card-coupons").first();
  await expect(coupons).toBeVisible({ timeout: T_L3 });
  const rows = coupons.getByTestId("coupon-row");
  expect(await rows.count()).toBeGreaterThanOrEqual(1);
  const demoNow = Date.parse(DEMO_NOW);
  for (const expiresAt of await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-expires-at") ?? ""))) {
    expect(Date.parse(expiresAt), `优惠券到期时间 ${expiresAt} 应晚于演示当前时间`).toBeGreaterThan(demoNow);
  }
  await shot(buyer, "3b-aftersale-done");
});

test("4 高风险：转人工提示 + 顶栏「等待人工接入」", async () => {
  await resetDemo();
  await runGuideStep(4);

  await expect(drawer().getByTestId("human-banner")).toBeVisible({ timeout: T_FAST });
  await expect(drawer().locator("header")).toContainText("等待人工接入", { timeout: T_FAST });
  await shot(buyer, "4-risk-handoff");
});

test("5 卖家端：红点 + 横幅 → 接管 → 回复 → 买家 2 秒内收到", async () => {
  // 不 reset：本步要用第 4 步产生的待人工会话
  await seller.goto("/seller");

  const banner = seller.getByTestId("waiting-banner");
  await expect(banner).toBeVisible({ timeout: T_SELLER_DOT });
  // 找到第 4 步刚产生的那条会话：用买家聊天窗上的会话编号精确定位
  // （种子数据里也有别的待人工会话，甚至同一个买家，所以不能只按状态 / 买家找）
  const convId = await drawer().getAttribute("data-conversation-id");
  expect(convId, "买家聊天窗应带有会话编号").toBeTruthy();
  const row = seller.locator(`[data-testid="conv-row"][href="/seller/c/${convId}"]`);
  await expect(row).toBeVisible({ timeout: T_SELLER_DOT });
  await expect(row).toHaveAttribute("data-status", "waiting_human");
  await expect(row.getByTestId("unread-dot")).toBeVisible({ timeout: T_SELLER_DOT });
  await shot(seller, "5a-seller-list");

  await row.click();
  await expect(seller).toHaveURL(/\/seller\/c\//);
  await seller.getByRole("button", { name: "接管", exact: true }).click();
  // 接管后出现「交还 AI」，输入框可用
  await expect(seller.getByRole("button", { name: "交还 AI" })).toBeVisible({ timeout: T_FAST });

  const reply = `E2E人工回复${Date.now()}`;
  await seller.getByLabel("回复内容").fill(reply);
  await seller.getByRole("button", { name: "发送", exact: true }).click();
  await expect(seller.getByText(reply)).toBeVisible({ timeout: T_FAST });
  await shot(seller, "5b-seller-reply");

  // 回到买家页，等待轮询收到卖家消息
  await buyer.bringToFront();
  await expect(drawer().getByText(reply)).toBeVisible({ timeout: T_BUYER_POLL });
  await expect(drawer().getByTestId("human-banner")).toContainText("为您服务", { timeout: T_BUYER_POLL });
  await shot(buyer, "5c-buyer-receives");
});

test("6 看板：今天总消息数比第 1 步之前增加", async () => {
  const now = await readTotalMessages(seller);
  console.log(`[e2e] 现在 今天总消息数 = ${now}（第 1 步之前 ${baselineMessages}）`);
  expect(now).toBeGreaterThan(baselineMessages);
  await shot(seller, "6-dashboard");
});
