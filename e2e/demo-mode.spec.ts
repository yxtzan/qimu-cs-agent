import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * 演示模式（?demo=1）至少走到第 2 步。
 * 不断言模型原文，只看结构化卡片、导览步骤，以及「展开详情」和调试行是不是同一组数字。
 */

const SHOTS = path.join(__dirname, "../docs/handoff/t21");

async function shot(page: import("@playwright/test").Page, name: string) {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

test("不带 demo=1 时没有导览层", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("guide-fab")).toBeVisible();
  await expect(page.getByTestId("demo-tour")).toHaveCount(0);
});

test("演示模式从开场走到第 2 步，刷新能续上，退出后恢复", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?demo=1");

  const tour = page.getByTestId("demo-tour");
  await expect(tour).toHaveAttribute("data-step", "intro");
  await expect(page.getByTestId("demo-sentence")).toContainText("风险闸门");
  await page.getByTestId("demo-expand").click();
  await expect(page.getByText("L2 Jev")).toBeVisible();
  await shot(page, "00-intro");

  await page.getByTestId("demo-start").click();
  await expect(page.getByTestId("chat-input")).toHaveValue(/160cm/, { timeout: 20_000 });
  await expect(tour).toHaveAttribute("data-step", "s1-send");
  await shot(page, "01-send");

  await page.reload();
  await expect(tour).toHaveAttribute("data-step", "s1-send", { timeout: 15_000 });
  await expect(page.getByTestId("chat-input")).toHaveValue(/160cm/, { timeout: 15_000 });

  await page.getByTestId("chat-send").click();
  await expect(tour).toHaveAttribute("data-step", "s1-reply", { timeout: 20_000 });
  await expect(page.getByTestId("card-size").last()).toBeVisible();
  await expect(page.getByTestId("card-size").last()).toHaveAttribute("data-size", "M");

  // 导览遮罩会接住鼠标事件，坐标点击（含 force）到不了按钮；直接触发点击，不改正常模式外观。
  await page.getByTestId("debug-toggle").evaluate((el: HTMLButtonElement) => el.click());
  await expect(page.getByTestId("debug-line").last()).toBeVisible();
  await page.getByTestId("demo-expand").click();
  const debugText = await page.getByTestId("debug-line").last().innerText();
  const traceText = await page.getByTestId("demo-trace").innerText();
  const ms = debugText.match(/(\d+)ms/)?.[1];
  const yen = debugText.match(/¥[\d.]+/)?.[0];
  expect(ms, `调试行应有耗时：${debugText}`).toBeTruthy();
  expect(yen, `调试行应有花费：${debugText}`).toBeTruthy();
  expect(traceText).toContain(`${ms}ms`);
  expect(traceText).toContain(yen!);
  await shot(page, "01-reply");

  await page.getByTestId("demo-next").click();
  await expect(tour).toHaveAttribute("data-step", "s2-send");
  await expect(page.getByTestId("chat-input")).toHaveValue("到哪了", { timeout: 15_000 });
  await page.getByTestId("chat-send").click();
  await expect(tour).toHaveAttribute("data-step", "s2-reply", { timeout: 20_000 });
  await expect(page.getByTestId("card-logistics").last()).toBeVisible();
  await shot(page, "02-reply");

  await page.getByTestId("demo-exit").click();
  await expect(page.getByTestId("demo-tour")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("demo-tour")).toHaveCount(0);
});

test("手机宽度卡片不挡住发送按钮", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?demo=1");
  await page.getByTestId("demo-start").click();
  const send = page.getByTestId("chat-send");
  await expect(send).toBeEnabled({ timeout: 20_000 });
  const card = page.getByTestId("demo-card");
  await expect(card).toBeVisible();
  const cardBox = await card.boundingBox();
  const sendBox = await send.boundingBox();
  expect(cardBox).toBeTruthy();
  expect(sendBox).toBeTruthy();
  const overlaps = !(
    cardBox!.y + cardBox!.height <= sendBox!.y ||
    sendBox!.y + sendBox!.height <= cardBox!.y ||
    cardBox!.x + cardBox!.width <= sendBox!.x ||
    sendBox!.x + sendBox!.width <= cardBox!.x
  );
  expect(overlaps, "手机宽度下导览卡片挡住了发送按钮").toBe(false);
  await shot(page, "mobile-send");
});

const PHONE = path.join(__dirname, "../docs/handoff/t21d");

async function phoneShot(page: import("@playwright/test").Page, name: string) {
  fs.mkdirSync(PHONE, { recursive: true });
  await page.screenshot({ path: path.join(PHONE, `${name}.png`) });
}

/** 390 宽：没有横向滚动，红圈和卡片都完整落在视口里。 */
async function assertPhoneFit(page: import("@playwright/test").Page, step: string) {
  const fit = await page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const box = (sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
    };
    const inside = (b: { l: number; t: number; r: number; b: number; w: number; h: number } | null) =>
      !!b && b.w > 2 && b.h > 2 && b.l >= -1 && b.t >= -1 && b.r <= vw + 1 && b.b <= vh + 1;
    const ring = box("[data-testid=demo-ring]");
    const card = box("[data-testid=demo-card]");
    return {
      scroll: document.documentElement.scrollWidth,
      inner: vw,
      ring,
      card,
      ringIn: inside(ring),
      cardIn: inside(card),
    };
  });
  expect(fit.scroll, `${step} 出现横向滚动 scrollWidth=${fit.scroll} inner=${fit.inner}`).toBe(fit.inner);
  expect(fit.cardIn, `${step} 卡片超出视口 ${JSON.stringify(fit.card)}`).toBe(true);
  if (fit.ring) expect(fit.ringIn, `${step} 红圈超出视口 ${JSON.stringify(fit.ring)}`).toBe(true);
}

test("手机宽度走完全程，每步都没有横向溢出", async ({ page }) => {
  test.setTimeout(8 * 60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?demo=1");
  const tour = page.getByTestId("demo-tour");

  async function at(step: string, shotName?: string) {
    await expect(tour).toHaveAttribute("data-step", step, { timeout: 45_000 });
    const centered = ["intro", "s5-go", "s5-back", "s6-go", "end"].includes(step);
    if (!centered) await expect(page.getByTestId("demo-ring")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(300);
    await assertPhoneFit(page, step);
    if (shotName) await phoneShot(page, shotName);
  }

  await at("intro");
  await page.getByTestId("demo-start").click();

  await at("s1-send", "phone-01-send");
  await page.getByTestId("chat-send").click();
  await at("s1-reply");
  await page.getByTestId("demo-next").click();

  await at("s2-send");
  await page.getByTestId("chat-send").click();
  await at("s2-reply");
  await page.getByTestId("demo-next").click();

  await at("s3-send");
  await page.getByTestId("chat-send").click();
  await expect(tour).toHaveAttribute("data-step", /s3-wait|s3-confirm/, { timeout: 45_000 });
  if ((await tour.getAttribute("data-step")) === "s3-wait") await at("s3-wait");
  await at("s3-confirm", "phone-03-confirm");
  await page.locator("[data-tour=confirm-yes]").click();
  await at("s3-done");
  await page.getByTestId("demo-next").click();

  await at("s4-send");
  await page.getByTestId("chat-send").click();
  await at("s4-reply");
  await page.getByTestId("demo-next").click();

  await at("s5-go");
  await page.getByTestId("demo-go-seller").click();
  await at("s5-list");
  await page.locator("[data-tour=handoff-row]").first().click();
  await at("s5-detail");
  await page.getByTestId("demo-next").click();
  await at("s5-takeover");
  await page.locator("[data-tour=takeover]").click();
  await at("s5-reply", "phone-05-reply");
  await page.locator("[data-tour=seller-send]").click();

  await at("s5-back");
  await page.getByTestId("demo-go-buyer").click();
  await expect(page.getByTestId("demo-ring")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(300);
  await assertPhoneFit(page, "s5-back-arrived");
  await page.getByTestId("demo-next").click();

  await at("s6-go");
  await page.getByTestId("demo-go-board").click();
  await at("s6-board");
  await page.getByTestId("demo-next").click();
  await at("s6-eval");
  await page.getByTestId("demo-next").click();
  await at("end");
});
