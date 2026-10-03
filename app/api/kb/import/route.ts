import { importKnowledgeDoc } from '@/lib/rag';
import { readImport } from '@/lib/rag/http';
import { respond } from '@/lib/store/http';
export const dynamic = 'force-dynamic';
export function POST(request: Request) {
  return respond(async () => {
    const input = await readImport(request);
    return importKnowledgeDoc(input.title, input.content, input.source);
  });
}
