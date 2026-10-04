const globalState = globalThis as unknown as { __qimuBrainTasks?: Set<Promise<void>>; __qimuBrainQueues?: Map<string, Promise<unknown>> };
const tasks = globalState.__qimuBrainTasks ??= new Set<Promise<void>>();
const queues = globalState.__qimuBrainQueues ??= new Map<string, Promise<unknown>>();
export type Schedule = (task: () => Promise<void>) => void;
export const scheduleBackground: Schedule = task => {
  const promise = Promise.resolve().then(task).catch(error => { console.error('[brain-background]', error instanceof Error ? error.name : 'UnknownError'); });
  tasks.add(promise);
  void promise.finally(() => tasks.delete(promise));
};
export async function drainBackgroundTasks(): Promise<void> { while (tasks.size) await Promise.all([...tasks]); }
export async function serializeConversation<T>(id: string, task: () => Promise<T>): Promise<T> {
  const run = (queues.get(id) ?? Promise.resolve()).catch(() => {}).then(task);
  queues.set(id, run);
  try { return await run; } finally { if (queues.get(id) === run) queues.delete(id); }
}
