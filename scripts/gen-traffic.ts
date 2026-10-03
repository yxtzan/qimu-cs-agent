/**
 * 重新生成种子流量（模拟历史数据）并打印分布摘要，方便人类核对。
 *
 *   npx tsx scripts/gen-traffic.ts          生成并写入 data/runtime（保留演示中产生的真实会话）
 *   npx tsx scripts/gen-traffic.ts --dry    只生成不写盘，两次生成比对指纹，验证"固定随机种子可复现"
 */
import { createHash } from 'node:crypto';
import { buildSeedTraffic, generateSeedTraffic } from '../lib/analytics/gen-traffic';
import { getRoutingAnalytics } from '../lib/analytics/routing';

const fingerprint = (data: unknown) => createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 16);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

const dry = process.argv.includes('--dry');
const first = buildSeedTraffic();
if (dry) {
  const second = buildSeedTraffic();
  console.log(`第一次指纹 ${fingerprint(first)}`);
  console.log(`第二次指纹 ${fingerprint(second)}`);
  const same = fingerprint(first) === fingerprint(second);
  console.log(same ? '两次结果一致 ✅' : '两次结果不一致 ❌');
  if (!same) process.exitCode = 1;
} else {
  const data = generateSeedTraffic();
  console.log(`已写入 ${data.conversations.length} 个模拟会话、${data.messages.length} 条消息、${data.traces.length} 条 trace（指纹 ${fingerprint(data)}）`);
  const stats = getRoutingAnalytics('7d', true);
  console.log(`近 7 天买家消息 ${stats.totals.messages} 条，自动解决率 ${pct(stats.totals.autoResolvedRate)}，平均延迟 ${stats.totals.avgLatencyMs}ms`);
  for (const l of stats.byLayer) console.log(`  ${l.layer.padEnd(9)} ${String(l.count).padStart(4)} 条  ${pct(l.share).padStart(6)}  均延迟 ${String(l.avgLatencyMs).padStart(5)}ms  每千条 ¥${l.costPer1kCny}`);
  console.log(`  风险命中 ${stats.riskHits.reduce((s, r) => s + r.count, 0)} 条，低置信度样本 ${stats.lowConfidence.length} 条`);
}
