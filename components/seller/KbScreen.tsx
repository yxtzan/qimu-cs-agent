"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { deleteKbDoc, getKbChunks, importKbDoc, listKbDocs, searchKb } from "@/lib/api-client";
import { fullDateTime } from "@/components/shop/format";
import { useAsync } from "@/components/shop/useAsync";
import type { KbChunk, KbDoc, KbSearchHit } from "@/lib/types";
import { BottomSheet, PageHeader, Toast } from "./ui";

const MAX_BYTES = 1024 * 1024;

const SOURCE_LABEL: Record<KbDoc["source"], string> = { seed: "内置", upload: "上传", paste: "粘贴" };

function errText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

// ───────────────────────── 试搜一下 ─────────────────────────

function SearchBox() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "done"; q: string; hits: KbSearchHit[] } | { kind: "error"; message: string }
  >({ kind: "idle" });

  const run = async (q: string) => {
    const text = q.trim();
    if (!text) return;
    setState({ kind: "loading" });
    try {
      setState({ kind: "done", q: text, hits: await searchKb(text, 4) });
    } catch (e) {
      setState({ kind: "error", message: errText(e, "搜索失败，请稍后再试") });
    }
  };

  return (
    <section aria-label="试搜一下" className="rounded-card bg-white p-3.5 shadow-card">
      <h2 className="flex items-baseline gap-2 text-[15px] font-semibold text-foreground">
        试搜一下
        <span className="text-[11px] font-normal text-warm">看看买家这样问时，AI 会查到哪些资料</span>
      </h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(query);
        }}
        className="mt-2.5 flex items-center gap-2"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="例如：真丝衬衫怎么洗"
          enterKeyHint="search"
          aria-label="搜索内容"
          className="min-h-[44px] min-w-0 flex-1 rounded-full bg-cream px-4 text-base text-foreground outline-none ring-1 ring-line transition focus:bg-white focus:ring-brand"
        />
        <button
          type="submit"
          disabled={state.kind === "loading" || query.trim() === ""}
          className="inline-flex min-h-[44px] min-w-[64px] items-center justify-center rounded-full bg-brand px-4 text-[15px] font-semibold text-white transition-colors active:bg-brand-dark disabled:bg-stone-300"
        >
          {state.kind === "loading" ? "搜索中" : "搜索"}
        </button>
      </form>

      {state.kind === "error" ? <p className="mt-2.5 text-sm text-risk">{state.message}</p> : null}

      {state.kind === "done" ? (
        <div className="mt-3">
          {state.hits.length === 0 ? (
            <p className="rounded-lg bg-cream px-3 py-3 text-center text-sm text-warm">
              没有找到和「{state.q}」相关的内容。买家这样问时，AI 会说“我帮您转人工”——可以导入相关文档来补上。
            </p>
          ) : (
            <>
              <p className="mb-2 text-[11px] text-warm">
                「{state.q}」命中 {state.hits.length} 个分块，分数越高越相关
              </p>
              <ul className="space-y-2">
                {state.hits.map((h, i) => (
                  <li key={h.chunk.id} className="rounded-lg bg-cream p-3 ring-1 ring-line">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-semibold text-white">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                        {h.chunk.docTitle}
                        {h.chunk.heading ? <span className="text-warm"> · {h.chunk.heading}</span> : null}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-brand">{h.score.toFixed(2)}</span>
                    </div>
                    <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-stone-200">
                      <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.min(100, Math.round(h.score * 100))}%` }} />
                    </span>
                    <p className="mt-2 text-[13px] leading-5 text-foreground">{h.chunk.text}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

// ───────────────────────── 文档卡片 ─────────────────────────

function DocCard({
  doc,
  fresh,
  onDeleted,
  onError,
}: {
  doc: KbDoc;
  fresh: boolean;
  onDeleted: () => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [chunks, setChunks] = useState<KbChunk[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && chunks === null) {
      try {
        setChunks(await getKbChunks(doc.id));
        setLoadError(null);
      } catch (e) {
        setLoadError(errText(e, "分块加载失败"));
      }
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteKbDoc(doc.id);
      onDeleted();
    } catch (e) {
      onError(errText(e, "删除失败，请稍后再试"));
      setBusy(false);
    }
  };

  return (
    <li className={`overflow-hidden rounded-card bg-white shadow-card ${fresh ? "ring-2 ring-brand/50" : ""}`}>
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-start gap-3 px-3.5 py-3 text-left active:bg-brand-soft/40">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3h8l4 4v14H6V3Z" />
            <path d="M14 3v4h4M9 12h6M9 16h6" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-semibold text-foreground">{doc.title}</span>
            {fresh ? <span className="shrink-0 rounded bg-brand px-1.5 py-px text-[10px] font-medium text-white">刚导入</span> : null}
          </span>
          <span className="mt-0.5 block text-xs text-warm">
            {doc.chunkCount} 个分块 · {doc.charCount} 字 · {fullDateTime(doc.createdAt)}
          </span>
          <span className="mt-1.5 flex items-center gap-1.5 text-[11px]">
            <span className="rounded bg-stone-100 px-1.5 py-px text-stone-600">{SOURCE_LABEL[doc.source]}</span>
            <span className="rounded bg-stone-100 px-1.5 py-px text-stone-600">
              {doc.indexMode === "embedding" ? "向量索引" : "关键词索引"}
            </span>
          </span>
        </span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          aria-hidden
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`mt-2 shrink-0 text-warm transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div className="space-y-2 border-t border-line bg-cream/60 px-3.5 py-3">
          {loadError ? <p className="text-sm text-risk">{loadError}</p> : null}
          {chunks === null && !loadError ? <p className="text-sm text-warm">正在加载分块…</p> : null}
          {chunks?.map((c, i) => (
            <div key={c.id} className="rounded-lg bg-white p-2.5 ring-1 ring-line">
              <p className="flex items-center gap-1.5 text-[11px] text-warm">
                <span className="font-semibold tabular-nums text-brand">#{i + 1}</span>
                {c.heading ? <span className="truncate font-medium text-foreground">{c.heading}</span> : <span>（无标题）</span>}
                <span className="ml-auto shrink-0">{c.text.length} 字</span>
              </p>
              <p className="mt-1 text-[13px] leading-5 text-foreground">{c.text}</p>
            </div>
          ))}
          <div className="flex items-center justify-end gap-2 pt-1">
            {confirmDelete ? (
              <>
                <span className="mr-auto text-xs text-risk">删除后买家就问不到这篇资料了</span>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="min-h-[40px] rounded-full px-3 text-sm text-warm active:bg-stone-100"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  className="min-h-[40px] rounded-full bg-red-600 px-4 text-sm font-semibold text-white active:bg-red-700 disabled:opacity-60"
                >
                  {busy ? "删除中…" : "确认删除"}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="min-h-[40px] rounded-full px-3 text-sm font-medium text-risk active:bg-orange-50"
              >
                删除文档
              </button>
            )}
          </div>
        </div>
      ) : null}
    </li>
  );
}

// ───────────────────────── 导入弹层 ─────────────────────────

type ImportStage = "idle" | "reading" | "chunking" | "indexing" | "error";

const STAGE_TEXT: Record<Exclude<ImportStage, "idle" | "error">, string> = {
  reading: "正在读取文件…",
  chunking: "正在切分段落…",
  indexing: "正在建立索引…",
};

function ImportSheet({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: (doc: KbDoc) => void;
}) {
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [stage, setStage] = useState<ImportStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const busy = stage === "reading" || stage === "chunking" || stage === "indexing";
  const canSubmit = !busy && (mode === "file" ? file !== null : title.trim() !== "" && content.trim() !== "");

  const pickFile = (f: File | null) => {
    setError(null);
    if (!f) return setFile(null);
    if (!/\.(md|txt)$/i.test(f.name)) {
      setFile(null);
      return setError("只支持 .md 或 .txt 文件");
    }
    if (f.size > MAX_BYTES) {
      setFile(null);
      return setError("文件太大了，请控制在 1MB 以内");
    }
    setFile(f);
  };

  const reset = () => {
    clearTimers();
    setFile(null);
    setTitle("");
    setContent("");
    setStage("idle");
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = async () => {
    setError(null);
    setStage("reading");
    // 后端一次性返回结果，这里用定时器把"读取 → 分块 → 建索引"三个阶段显示出来，让人知道在忙什么
    timers.current = [setTimeout(() => setStage("chunking"), 450), setTimeout(() => setStage("indexing"), 1000)];
    try {
      const doc = await importKbDoc(
        mode === "file" && file
          ? { file, title: title.trim() || undefined }
          : { title: title.trim(), content },
      );
      clearTimers();
      reset();
      onImported(doc);
    } catch (e) {
      clearTimers();
      setStage("error");
      setError(errText(e, "导入失败，请稍后再试"));
    }
  };

  const close = () => {
    if (busy) return;
    onClose();
  };

  return (
    <BottomSheet
      open={open}
      title="导入知识库文档"
      onClose={close}
      footer={
        <div className="space-y-2">
          {busy ? (
            <div role="status" className="flex items-center gap-2.5 rounded-lg bg-brand-soft px-3 py-2.5 text-sm font-medium text-brand">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
              {STAGE_TEXT[stage as keyof typeof STAGE_TEXT]}
              <span className="ml-auto flex gap-1" aria-hidden>
                {(["reading", "chunking", "indexing"] as const).map((s) => (
                  <span
                    key={s}
                    className={`h-1.5 w-5 rounded-full ${
                      s === stage || ["reading", "chunking", "indexing"].indexOf(s) < ["reading", "chunking", "indexing"].indexOf(stage)
                        ? "bg-brand"
                        : "bg-brand/20"
                    }`}
                  />
                ))}
              </span>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full bg-brand text-base font-semibold text-white transition-colors active:bg-brand-dark disabled:bg-stone-300"
          >
            {busy ? "导入中…" : "开始导入"}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-1 rounded-full bg-stone-100 p-1" role="tablist">
        {(["file", "paste"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            disabled={busy}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`min-h-[40px] rounded-full text-sm font-medium transition-colors ${
              mode === m ? "bg-white text-brand shadow-card" : "text-warm"
            }`}
          >
            {m === "file" ? "上传文件" : "粘贴文本"}
          </button>
        ))}
      </div>

      {mode === "file" ? (
        <div className="mt-3">
          <label
            className={`flex min-h-[112px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-card border-2 border-dashed px-4 py-5 text-center transition-colors ${
              file ? "border-brand/50 bg-brand-soft/50" : "border-stone-300 bg-cream active:bg-brand-soft/40"
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".md,.txt,text/markdown,text/plain"
              disabled={busy}
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              className="sr-only"
              aria-label="选择文件"
            />
            {file ? (
              <>
                <span className="max-w-full truncate text-[15px] font-semibold text-brand">{file.name}</span>
                <span className="text-xs text-warm">{(file.size / 1024).toFixed(1)} KB · 点击更换</span>
              </>
            ) : (
              <>
                <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-warm">
                  <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
                </svg>
                <span className="text-[15px] font-medium text-foreground">点击选择 .md / .txt 文件</span>
                <span className="text-xs text-warm">不超过 1MB，用二级标题分节效果最好</span>
              </>
            )}
          </label>
          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-medium text-warm">文档标题（可选，不填则取文件里的标题或文件名）</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              placeholder="例如：秋冬洗护补充说明"
              className="min-h-[44px] w-full rounded-lg bg-cream px-3 text-base outline-none ring-1 ring-line focus:bg-white focus:ring-brand"
            />
          </label>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-warm">文档标题</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              placeholder="例如：国庆活动说明"
              className="min-h-[44px] w-full rounded-lg bg-cream px-3 text-base outline-none ring-1 ring-line focus:bg-white focus:ring-brand"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-warm">正文（支持 Markdown，用 ## 标题分节）</span>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={busy}
              rows={8}
              placeholder={"## 活动时间\n10 月 1 日至 7 日……"}
              className="w-full resize-none rounded-lg bg-cream px-3 py-2.5 text-base leading-6 outline-none ring-1 ring-line focus:bg-white focus:ring-brand"
            />
            <span className="mt-1 block text-right text-[11px] text-warm">{content.length} 字</span>
          </label>
        </div>
      )}
    </BottomSheet>
  );
}

// ───────────────────────── 页面 ─────────────────────────

export function KbScreen() {
  const [tick, setTick] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "ok" | "error" } | null>(null);
  const { data: docs, error } = useAsync(() => listKbDocs(), [tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  const showToast = useCallback((message: string, tone: "ok" | "error" = "ok") => {
    setToast({ message, tone });
    setTimeout(() => setToast(null), 3200);
  }, []);

  const totalChunks = (docs ?? []).reduce((sum, d) => sum + d.chunkCount, 0);

  return (
    <>
      <PageHeader
        title="知识库"
        subtitle={docs ? `${docs.length} 篇文档 · ${totalChunks} 个分块` : "AI 回答问题时查阅的资料"}
        right={
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-brand px-4 text-sm font-semibold text-white shadow-card active:bg-brand-dark"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            导入
          </button>
        }
      />

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pb-6 pt-4">
        <SearchBox />

        <section aria-label="文档列表">
          <h2 className="mb-2 text-[13px] font-semibold text-foreground">
            全部文档 <span className="font-normal text-warm">点击查看分块</span>
          </h2>
          {error && !docs ? (
            <p className="rounded-card bg-white p-4 text-sm text-warm shadow-card">文档加载失败：{error.message}</p>
          ) : null}
          {!docs && !error ? (
            <div className="space-y-3" aria-busy>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[84px] animate-pulse rounded-card bg-white shadow-card" />
              ))}
            </div>
          ) : null}
          {docs && docs.length === 0 ? (
            <p className="rounded-card bg-white px-4 py-6 text-center text-sm text-warm shadow-card">
              还没有文档。点右上角「导入」，让 AI 学会你们店的规则吧。
            </p>
          ) : null}
          {docs && docs.length > 0 ? (
            <ul className="space-y-3">
              {docs.map((d) => (
                <DocCard
                  key={d.id}
                  doc={d}
                  fresh={d.id === freshId}
                  onDeleted={() => {
                    showToast(`已删除《${d.title}》`);
                    reload();
                  }}
                  onError={(m) => showToast(m, "error")}
                />
              ))}
            </ul>
          ) : null}
        </section>
      </div>

      <ImportSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onImported={(doc) => {
          setSheetOpen(false);
          setFreshId(doc.id);
          showToast(`已导入《${doc.title}》，共 ${doc.chunkCount} 个分块，可以试搜了`);
          reload();
        }}
      />
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </>
  );
}
