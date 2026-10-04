import { deleteKnowledgeDoc } from '@/lib/rag';
import { publicDemo } from '@/lib/store/visitor-context';
import { ApiError, respond } from '@/lib/store/http';
export const dynamic = 'force-dynamic';
export function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    if (publicDemo()) throw new ApiError('PUBLIC_DEMO_READ_ONLY', '公开演示版不开放导入或删除，可在本地运行体验', 403);
    return deleteKnowledgeDoc((await context.params).id);
  });
}
