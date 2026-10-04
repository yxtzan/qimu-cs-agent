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
