import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLocalEnv } from '../lib/llm/env';
import { handleMessage } from '../lib/brain/pipeline';
import { clearStoreCache } from '../lib/store';
import { getOrder } from '../lib/store/collections';
import { listPendingActions } from '../lib/store/conversations';
import { drainBackgroundTasks } from '../lib/brain/background';
import type { ChatResponse } from '../lib/brain/pipeline';

async function main() {
  loadLocalEnv();
  assert(process.env.OPENROUTER_API_KEY, '需要已有OpenRouter key');
  const root = process.cwd(); const temp = mkdtempSync(join(tmpdir(), 'qimu-t05-live-'));
  const records: ChatResponse[] = [];
  try {
    cpSync(join(root, 'data/seed'), join(temp, 'data/seed'), { recursive: true });
    if (existsSync(join(root, 'data/runtime/kb_index.json'))) { mkdirSync(join(temp, 'data/runtime'), { recursive: true }); cpSync(join(root, 'data/runtime/kb_index.json'), join(temp, 'data/runtime/kb_index.json')); }
    process.chdir(temp); clearStoreCache(); process.env.JEV_KEEPALIVE_MS = '0';
    for (const [buyerId, text] of [
      ['B001', '上周买的那件外套换成L码，顺便帮我看看有没有能用的券'],
      ['B003', '两个订单都帮我处理下：没付款的取消，已经付了的改地址到浙江省 杭州市 西湖区 文三路88号'],
    ]) {
      const before = structuredClone([getOrder('QM2026092801'), getOrder('QM2026100401'), getOrder('QM2026100402')]);
      const response = await handleMessage({ buyerId, text, debug: true });
      await drainBackgroundTasks(); records.push(response);
      console.log(`${buyerId} → ${response.trace?.layer}, ${response.trace?.latency.totalMs}ms, agent $${response.trace?.cost.agentUsd}, generation $${response.trace?.cost.generationUsd}`);
      console.log('tools:', response.trace?.toolCalls.map(t => `${t.name}:${t.ok}`).join(' → '));
      console.log('messages:', response.messages.filter(m => m.role !== 'buyer').map(m => `${m.text} [${m.card?.kind ?? 'text'}]`).join('\n'));
      assert.equal(response.trace?.layer, 'L3');
      assert.deepEqual([getOrder('QM2026092801'), getOrder('QM2026100401'), getOrder('QM2026100402')], before);
      const pending = listPendingActions(response.conversation.id);
      assert.equal(pending.length, buyerId === 'B001' ? 1 : 2);
      if (buyerId === 'B001') {
        const names = response.trace!.toolCalls.map(t => t.name);
        let index = -1; for (const name of ['list_orders', 'check_stock', 'request_exchange', 'list_coupons']) { index = names.indexOf(name, index + 1); assert(index >= 0, name); }
        const card = response.messages.map(m => m.card).find(c => c?.kind === 'coupons'); assert(card?.kind === 'coupons'); assert(card.coupons.length > 0);
        assert(card.coupons.every(c => !c.used && Date.parse(c.expiresAt) > Date.parse('2026-10-05T10:00:00+08:00')));
      } else assert.deepEqual(new Set(pending.map(p => p.tool)), new Set(['cancel_order', 'modify_address']));
    }
    console.log('真实两条L3验收全部通过');
  } finally {
    process.chdir(root); clearStoreCache(); rmSync(temp, { recursive: true, force: true });
    mkdirSync(join(root, 'docs/reports'), { recursive: true });
    writeFileSync(join(root, 'docs/reports/T05-live.json'), JSON.stringify(records, null, 2) + '\n');
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
