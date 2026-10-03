/**
 * Demo clock. All business logic must use this instead of `new Date()`.
 * The "current time" of the demo world starts at DEMO_NOW when the server
 * boots and then moves forward with real elapsed time.
 */
export const DEMO_NOW = "2026-10-05T10:00:00+08:00";

const demoNowMs = Date.parse(DEMO_NOW);
const bootRealMs = Date.now();

/** Current demo time (DEMO_NOW + real time elapsed since process start). */
export function now(): Date {
  return new Date(demoNowMs + (Date.now() - bootRealMs));
}

/** Current demo time as ISO 8601 with +08:00 offset. */
export function nowIso(): string {
  const shifted = new Date(now().getTime() + 8 * 3600 * 1000);
  return shifted.toISOString().replace("Z", "+08:00");
}
