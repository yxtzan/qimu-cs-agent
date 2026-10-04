/** T22 browser check against a PUBLIC_DEMO=1 production server with a tiny DAILY_BUDGET_USD. */
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import type { ChatResponse } from '../lib/brain/pipeline';
const base = process.env.BUDGET_BASE_URL ?? 'http://localhost:3000';
async function main() {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ baseURL: base, viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.name + ': ' + error.message));
    page.on('console', message => { if (message.type() === 'error' && /hydration|Minified React error/i.test(message.text())) errors.push(message.text()); });
    await page.goto('/');
    const status = async () => (await context.request.get('/api/demo/status')).json() as Promise<{ simplified: boolean; message: string }>;
    if (!(await status()).simplified) {
      // A tiny positive budget is crossed by this real classifier call. L1 completes its trace after returning.
      const first = await context.request.post('/api/chat', { data: { buyerId: 'B001', text: '你好', debug: true } });
      assert.equal(first.status(), 200);
      for (let i = 0; !(await status()).simplified && i < 200; i++) await page.waitForTimeout(100);
    }
    assert.equal((await status()).simplified, true, '请用 DAILY_BUDGET_USD=0.0000001（配置模型 key）或 0 启动服务器');
    const result = await context.request.post('/api/chat', { data: { buyerId: 'B001', text: '我想换一件外套并看看优惠券', debug: true } });
    assert.equal(result.status(), 200);
    const chat = await result.json() as ChatResponse;
    assert.equal(chat.trace?.decideProvider, 'mock');
    assert.equal(chat.trace?.cost.totalUsd, 0);
    assert.ok(chat.messages.some(message => message.text.includes('演示额度今日已用完，以下为简化模式')));
    console.log('PASS 超小预算触发简化模式，分类器为 mock、L3 不花钱、聊天含中文说明');
    const banner = page.getByTestId('public-budget-banner');
    await banner.waitFor({ state: 'visible', timeout: 10_000 });
    assert.match(await banner.getByRole('status').innerText(), /演示额度今日已用完/);
    const header = await page.locator('header.sticky').first().boundingBox();
    assert.ok(header && header.y >= (await banner.boundingBox())!.height, '额度横幅不能遮住商城顶部导航');
    await page.screenshot({ path: process.env.BUDGET_SCREENSHOT ?? '/private/tmp/qimu-t22-budget.png' });
    console.log('PASS 网页顶部实际出现额度横幅并保存截图');
    const link = page.locator('a[href^="/product/"]').first();
    if (await link.count()) { await link.click(); await page.waitForURL(/\/product\//); assert.equal(await banner.isVisible(), true); }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await banner.isVisible(), true);
    await page.goto('/seller/dashboard');
    await page.getByTestId('public-budget-banner').waitFor({ state: 'visible', timeout: 10_000 });
    const navigation = await page.getByRole('navigation', { name: '底部导航' }).boundingBox();
    assert.ok(navigation && navigation.y + navigation.height <= 844, '手机底部导航不能被额度横幅挤出屏幕');
    assert.deepEqual(errors, [], '公开横幅注入不能引发 hydration/页面运行时异常');
    console.log('PASS 手机、卖家页面和页面跳转均保留横幅，未出现页面异常');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
