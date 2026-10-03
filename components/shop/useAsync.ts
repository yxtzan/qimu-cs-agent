"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api-client";

export interface AsyncState<T> {
  data: T | null;
  error: ApiError | Error | null;
  loading: boolean;
}

interface Settled<T> {
  key: string;
  data: T | null;
  error: Error | null;
}

/**
 * 简单的数据加载 hook：deps（需为可序列化的原始值）变化时重新请求；
 * 切换期间保留上一次的数据并标记 loading，方便页面做"淡出"而不是闪白。
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const key = JSON.stringify(deps);
  const [settled, setSettled] = useState<Settled<T> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fn()
      .then((data) => {
        if (!cancelled) setSettled({ key, data, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) setSettled({ key, data: null, error: error instanceof Error ? error : new Error(String(error)) });
      });
    return () => {
      cancelled = true;
    };
    // fn 每次渲染都是新函数，真正的依赖由 key 表达
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const loading = settled === null || settled.key !== key;
  return {
    data: settled?.data ?? null,
    error: loading ? null : (settled?.error ?? null),
    loading,
  };
}
