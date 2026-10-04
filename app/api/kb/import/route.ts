import { importKnowledgeDoc } from '@/lib/rag';
import { readImport } from '@/lib/rag/http';
import { publicDemo } from '@/lib/store/visitor-context';
import { ApiError, respond } from '@/lib/store/http';
export const dynamic = 'force-dynamic';
export function POST(request: Request) {
  return respond(async () => {
    if (publicDemo()) throw new ApiError('PUBLIC_DEMO_READ_ONLY', '公开演示版不开放导入，可在本地运行体验', 403);
    const input = await readImport(request);
    return importKnowledgeDoc(input.title, input.content, input.source);
  });
}
