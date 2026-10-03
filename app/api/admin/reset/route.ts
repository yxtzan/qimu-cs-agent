import { resetDemoData } from '@/lib/store/reset';
import { respondTo } from '../../conversations/_respond';
export const dynamic = 'force-dynamic';

// 需要在重置时执行的钩子模块请在这里 import（T03 知识库索引、T17 种子流量），例如：
// import '@/lib/rag/reset-hook';

// POST /api/admin/reset  重置演示数据（等同 npm run seed）
export function POST() {
  return respondTo(async () => {
    await resetDemoData();
    return { ok: true };
  });
}
