import { bindVisitor, currentVisitor, visitorNamespace } from '../store/visitor-context';
const globalState = globalThis as unknown as { __qimuBrainTasks?: Set<Promise<void>>; __qimuBrainQueues?: Map<string, Promise<unknown>> };
const tasks = globalState.__qimuBrainTasks ??= new Set<Promise<void>>();
const queues = globalState.__qimuBrainQueues ??= new Map<string, Promise<unknown>>();
export type Schedule = (task: () => Promise<void>) => void;
export const scheduleBackground: Schedule = task => {
  const promise = Promise.resolve().then(bindVisitor(task)).catch(error => { console.error('[brain-background]', error instanceof Error ? error.name : 'UnknownError'); });
  tasks.add(promise);
  void promise.finally(() => tasks.delete(promise));
};
export async function drainBackgroundTasks(): Promise<void> { while (tasks.size) await Promise.all([...tasks]); }
export async function serializeConversation<T>(id: string, task: () => Promise<T>): Promise<T> {
  const key = currentVisitor() ? `${visitorNamespace()}:${id}` : id;
  const run = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(bindVisitor(task)) as Promise<T>;
  queues.set(key, run);
  try { return await run; } finally { if (queues.get(key) === run) queues.delete(key); }
}
