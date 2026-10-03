import { getKnowledgeChunks } from '@/lib/rag';
import { respond } from '@/lib/store/http';
export const dynamic = 'force-dynamic';
export function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return respond(async () => getKnowledgeChunks((await context.params).id));
}
