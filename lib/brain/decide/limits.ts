const MAX_CONCURRENCY = 4;
let active = 0;
const waiters: (() => void)[] = [];

export class ClassifierBudgetError extends Error {
  constructor() {
    super("classifier decision budget exceeded");
    this.name = "ClassifierBudgetError";
  }
}

export async function withClassifierSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENCY) await new Promise<void>((resolve) => waiters.push(resolve));
  active += 1;
  try {
    return await fn();
  } finally {
    active -= 1;
    waiters.shift()?.();
  }
}

export function isRateLimitError(error: unknown): boolean {
  const status = error && typeof error === "object" && "status" in error ? (error as { status?: number }).status : undefined;
  const message = error instanceof Error ? error.message : String(error);
  return status === 429 || /\b429\b|rate.?limit|too many requests/i.test(message);
}

export async function with429Retry<T>(fn: () => Promise<T>, deadlineMs?: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= 2; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRateLimitError(error) || attempt === 2) throw error;
      const delayMs = 200 * 2 ** attempt;
      if (deadlineMs !== undefined) {
        const remainingMs = deadlineMs - Date.now();
        if (remainingMs <= delayMs) throw new ClassifierBudgetError();
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}
