import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadLocalEnv } from '../lib/llm/env';
import { handleMessage } from '../lib/brain/pipeline';
import { drainBackgroundTasks } from '../lib/brain/background';
import { getConversation, listMessages, listTraces } from '../lib/store/conversations';
import type { ChatAction } from '../lib/types';
import type { ChatContext } from '../lib/brain/state';

async function main(): Promise<void> {
  loadLocalEnv();
  const args = process.argv.slice(2);
  const param = (name: string) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
  const buyerId = param('--buyer') ?? 'B001';
  const context: ChatContext = param('--context') ? JSON.parse(param('--context')!) : {};
  const oneShot = param('--text');
  let conversationId = param('--conversation');
  const rl = createInterface({ input: stdin, output: stdout, terminal: stdin.isTTY });
  async function send(line: string): Promise<void> {
    let action: ChatAction | undefined;
    if (/^\/(confirm|cancel)\s+/.test(line)) action = { type: 'confirm', pendingActionId: line.split(/\s+/)[1], confirm: line.startsWith('/confirm') };
    if (line.startsWith('/select ')) action = { type: 'select_option', value: line.slice(8).trim() };
    const result = await handleMessage({ buyerId, conversationId, ...(action ? { action } : { text: line }), context, debug: true });
    conversationId = result.conversation.id;
    await drainBackgroundTasks();
    console.log(`\n会话 ${conversationId} · 买家 ${buyerId} · ${getConversation(conversationId)?.status}`);
    for (const message of listMessages(conversationId, { after: result.messages[0].id })) {
      console.log(`${message.role === 'system' ? '系统' : '客服'}：${message.text}`);
      if (message.card) console.log(JSON.stringify(message.card, null, 2));
    }
    const trace = listTraces({ conversationId }).find(t => t.messageId === result.messages[0].id);
    console.log('路由：' + JSON.stringify(trace));
  }
  try {
    if (oneShot) await send(oneShot);
    else {
      console.log(`栖木客服 · ${buyerId}（/confirm 动作ID，/cancel 动作ID，/select 选项值，/quit 退出）`);
      for await (const line of rl) {
        if (line.trim() === '/quit') break;
        if (line.trim()) await send(line.trim());
      }
    }
  } finally { rl.close(); }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : '聊天运行失败'); process.exitCode = 1; });
