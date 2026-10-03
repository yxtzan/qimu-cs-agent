import { listBuyers } from '@/lib/store/collections';
import { respond } from '@/lib/store/http';
export const dynamic = 'force-dynamic';
export function GET() { return respond(listBuyers); }
