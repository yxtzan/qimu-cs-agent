import { registerResetHook } from '../../store/reset';
import { warmJevNow } from './warmup';

// Kept out of warmup.ts on purpose: the pipeline imports warmup.ts early, which would register this hook
// before the knowledge-index hook and warm Jev too soon. Only lib/store/reset-hooks.ts imports this file,
// as its last line, so the warm-up runs after everything else has been rebuilt.
registerResetHook('jev-warmup', warmJevNow);
