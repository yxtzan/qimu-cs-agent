import { resetDemoData } from '@/lib/store/reset';
import { respondTo } from '../../conversations/_respond';
export const dynamic = 'force-dynamic';

// 重置钩子（T03 知识库索引、T17 种子流量…）统一登记在 reset-hooks.ts，新增钩子只改那一个文件
import '@/lib/store/reset-hooks';

// POST /api/admin/reset  重置演示数据（等同 npm run seed）
export function POST() {
  return respondTo(async () => {
    await resetDemoData();
    return { ok: true };
  });
}
