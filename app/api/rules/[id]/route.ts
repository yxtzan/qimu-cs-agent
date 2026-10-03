import { deleteRule, patchRule } from '@/lib/rules';
import { readJsonBody, respondTo } from '../../conversations/_respond';
export const dynamic = 'force-dynamic';

// PATCH /api/rules/:id  修改 name / pattern / intent / maxLen / enabled
export function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return respondTo(async () => patchRule((await context.params).id, await readJsonBody(request)));
}

// DELETE /api/rules/:id
export function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  return respondTo(async () => {
    deleteRule((await context.params).id);
    return { ok: true };
  });
}
