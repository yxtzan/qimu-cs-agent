import { listBuyers } from '@/lib/store/collections';
import { respond } from '@/lib/store/http';
import { noteJevActivity } from '@/lib/brain/decide/warmup';
export const dynamic = 'force-dynamic';
// Every shop page loads the buyer list: a visitor is here, so start warming Jev before they type.
export function GET() { noteJevActivity(); return respond(listBuyers); }
