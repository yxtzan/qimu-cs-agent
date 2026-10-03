/**
 * 重置钩子登记表（见 docs/questions/T16-1.md）。
 *
 * `POST /api/admin/reset` 和 `npm run seed` 都只 import 这一个文件，
 * 所以每个用 registerResetHook() 注册钩子的模块，都要在这里加一行 import——别的地方不用改。
 * Codex 和 Cursor 都可以往这里加 import 行（只允许加 import 行）。
 */
import "../analytics/gen-traffic"; // T17：种子流量（模拟历史数据）
import '../rag/reset-hook';
// import "../rag/<知识库索引钩子模块>"; // T03：合并后由 T03 补这一行
