import { createRule, listRulesWithSuggestion } from '@/lib/rules';
import { readJsonBody, respondTo } from '../conversations/_respond';
export const dynamic = 'force-dynamic';

// GET /api/rules  规则列表（含 suggestion）
export function GET() {
  return respondTo(() => listRulesWithSuggestion());
}

// POST /api/rules  新建规则（pattern 非法正则 → 400）
export function POST(request: Request) {
  return respondTo(async () => createRule(await readJsonBody(request)));
}
