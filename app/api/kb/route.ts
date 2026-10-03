import { listKnowledgeDocs } from '@/lib/rag';
import { respond } from '@/lib/store/http';
export const dynamic = 'force-dynamic';
export function GET() { return respond(listKnowledgeDocs); }
