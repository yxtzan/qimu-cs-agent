import { deleteKnowledgeDoc } from '@/lib/rag';
import { respond } from '@/lib/store/http';
export const dynamic = 'force-dynamic';
export function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  return respond(async () => deleteKnowledgeDoc((await context.params).id));
}
