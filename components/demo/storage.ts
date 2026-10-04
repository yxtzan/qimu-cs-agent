"use client";

import { useSyncExternalStore } from "react";
import type { RouteTrace } from "@/lib/types";
import { isStepId, type StepId } from "./steps";

const KEY = "qimu.demo.v1";
const TRY_KEY = "qimu.demo.try";

export interface DemoState {
  active: boolean;
  stepId: StepId;
  conversationId?: string;
  trace: RouteTrace | null;
  stepEnteredAt: number;
}

export interface TryScript {
  buyerId: string;
  draft: string;
}

const EMPTY: DemoState = {
  active: false,
  stepId: "intro",
  trace: null,
  stepEnteredAt: 0,
};

let memory: DemoState = EMPTY;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function persist(next: DemoState) {
  memory = next;
  try {
    if (!next.active) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 读不到就当没在演示 */
  }
  notify();
}

export function readDemo(): DemoState {
  return memory;
}

export function subscribeDemo(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 发送消息时直接读 sessionStorage，不依赖 React 是否已经水合。 */
export function isDemoActive(): boolean {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return memory.active;
    const parsed = JSON.parse(raw) as { active?: boolean };
    return Boolean(parsed.active);
  } catch {
    return false;
  }
}

export function hydrateDemo() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<DemoState>;
    if (!parsed || parsed.active !== true || !isStepId(parsed.stepId)) return;
    memory = {
      active: true,
      stepId: parsed.stepId,
      conversationId: typeof parsed.conversationId === "string" ? parsed.conversationId : undefined,
      trace: parsed.trace ?? null,
      stepEnteredAt: typeof parsed.stepEnteredAt === "number" ? parsed.stepEnteredAt : Date.now(),
    };
    notify();
  } catch {
    /* 读不到就当没在演示 */
  }
}

export function patchDemo(partial: Partial<DemoState>) {
  persist({ ...memory, ...partial });
}

const CLEARS_TRACE = new Set<StepId>(["s1-send", "s2-send", "s3-send", "s4-send", "intro"]);

export function goTo(stepId: StepId) {
  if (!memory.active || memory.stepId === stepId) return;
  persist({
    ...memory,
    stepId,
    stepEnteredAt: Date.now(),
    trace: CLEARS_TRACE.has(stepId) ? null : memory.trace,
  });
}

export function exitDemo() {
  persist({ ...EMPTY });
}

export function saveTryScript(script: TryScript) {
  try {
    sessionStorage.setItem(TRY_KEY, JSON.stringify(script));
  } catch {
    /* 忽略 */
  }
}

export function peekTryScript(): TryScript | null {
  try {
    const raw = sessionStorage.getItem(TRY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TryScript;
    if (!parsed?.draft || !parsed.buyerId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearTryScript() {
  try {
    sessionStorage.removeItem(TRY_KEY);
  } catch {
    /* 忽略 */
  }
}

function getClientSnapshot() {
  return memory;
}

function getServerSnapshot() {
  return EMPTY;
}

export function useDemo(): DemoState {
  return useSyncExternalStore(subscribeDemo, getClientSnapshot, getServerSnapshot);
}
