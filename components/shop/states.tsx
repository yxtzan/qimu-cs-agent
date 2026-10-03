import Link from "next/link";
import { ApiError } from "@/lib/api-client";

/**
 * 把任意错误变成一句温和的中文提示。
 * ApiError 的 message 本来就是给人看的中文；其他错误（开发中的 "not implemented"、网络栈的英文报错等）不直接露给用户。
 */
export function friendlyError(e: unknown, fallback = "出了一点小问题，请稍后再试"): string {
  if (e instanceof ApiError && e.message) return e.message;
  return fallback;
}

/** 买家端的错误态：温和的一句话 + 重试 / 返回。 */
export function ErrorState({
  message,
  onRetry,
  backHref,
  backLabel,
  className = "",
}: {
  message: string;
  onRetry?: () => void;
  backHref?: string;
  backLabel?: string;
  className?: string;
}) {
  return (
    <div role="alert" className={`rounded-card border border-line bg-white px-6 py-14 text-center ${className}`}>
      <span
        aria-hidden
        className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#fbeee6] text-lg font-semibold text-risk"
      >
        !
      </span>
      <p className="mt-4 text-[15px] text-foreground">{message}</p>
      <p className="mt-1 text-sm text-warm">{onRetry ? "别着急，点一下重新加载通常就好了。" : "换个地方看看吧。"}</p>
      <div className="mt-5 flex items-center justify-center gap-3">
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full bg-brand px-6 py-2.5 text-sm font-medium text-white transition hover:bg-brand-dark"
          >
            重新加载
          </button>
        ) : null}
        {backHref ? (
          <Link
            href={backHref}
            className="rounded-full border border-line bg-white px-6 py-2.5 text-sm text-foreground transition hover:border-brand/40"
          >
            {backLabel ?? "返回"}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/** 买家端的空状态：一句解释 + 下一步去哪。 */
export function EmptyState({
  title,
  hint,
  actionHref,
  actionLabel,
}: {
  title: string;
  hint?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="rounded-card border border-dashed border-line px-6 py-16 text-center">
      <span
        aria-hidden
        className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-brand-soft text-lg text-brand"
      >
        栖
      </span>
      <p className="mt-4 text-[15px] text-foreground">{title}</p>
      {hint ? <p className="mt-1 text-sm text-warm">{hint}</p> : null}
      {actionHref ? (
        <Link
          href={actionHref}
          className="mt-5 inline-block rounded-full bg-brand px-6 py-2.5 text-sm font-medium text-white transition hover:bg-brand-dark"
        >
          {actionLabel ?? "去逛逛"}
        </Link>
      ) : null}
    </div>
  );
}
