import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Load env files into process.env for standalone scripts run with `tsx`.
 * Order: `.env.local`, `.env`, then `.env.example` (only supplies default model IDs etc.).
 * Variables that are already set always win. Next.js loads `.env.local` by itself, so
 * only scripts need this.
 */
export function loadLocalEnv(cwd: string = process.cwd()): void {
  for (const name of [".env.local", ".env", ".env.example"]) {
    const file = resolve(cwd, name);
    if (existsSync(file)) process.loadEnvFile(file);
  }
}
