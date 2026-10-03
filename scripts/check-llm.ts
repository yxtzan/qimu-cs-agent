/**
 * T00 self-check for lib/llm/openrouter.ts.  Run: npx tsx scripts/check-llm.ts
 *
 *  1. Offline: a local stub server proves request shape, `usage.include`, parsing, timeout.
 *  2. No key: chatCompletion() must throw NoApiKeyError.
 *  3. Real key (only if OPENROUTER_API_KEY is set in .env.local): ask for one Chinese sentence.
 *
 * The key is never printed.
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { loadLocalEnv } from "../lib/llm/env";
import {
  NoApiKeyError,
  OpenRouterError,
  chatCompletion,
  decisions,
  embed,
} from "../lib/llm/openrouter";
import { formatCny } from "../lib/llm/cost";

loadLocalEnv();

let failures = 0;
function check(name: string, ok: boolean, extra = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  ${extra}` : ""}`);
  if (!ok) failures++;
}

async function offlineStubTests(): Promise<void> {
  const seen: { path: string; auth: string | undefined; body: Record<string, unknown> }[] = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw || "{}");
      seen.push({ path: req.url ?? "", auth: req.headers.authorization, body });
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/v1/chat/completions") {
        if (body.messages?.[0]?.content === "slow") return; // never answer → timeout
        res.end(
          JSON.stringify({
            model: body.model,
            choices: [{ finish_reason: "stop", message: { role: "assistant", content: "你好，我是栖木客服。" } }],
            usage: { prompt_tokens: 10, completion_tokens: 8, cost: 0.000012 },
          }),
        );
      } else if (req.url === "/v1/embeddings") {
        res.end(
          JSON.stringify({
            data: [
              { index: 1, embedding: [0, 1] },
              { index: 0, embedding: [1, 0] },
            ],
            usage: { prompt_tokens: 6, total_tokens: 6 },
          }),
        );
      } else if (req.url === "/alpha/decisions") {
        res.end(
          JSON.stringify({
            id: "gen-dec-x",
            model: "typesafe/jev-1.13-test",
            answers: { risk: { type: "noul", noul: 0.9 } },
            usage: { input_tokens: 100, output_tokens: 5, cost: 0.00001 },
          }),
        );
      } else {
        res.statusCode = 404;
        res.end("{}");
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;

  const saved = { key: process.env.OPENROUTER_API_KEY, base: process.env.OPENROUTER_API_BASE };
  process.env.OPENROUTER_API_KEY = "test-key-not-real";
  process.env.OPENROUTER_API_BASE = `http://127.0.0.1:${port}`;
  try {
    const chat = await chatCompletion({
      model: "stub/model",
      messages: [{ role: "user", content: "hi" }],
      responseFormat: { type: "json_object" },
    });
    check("[stub] chatCompletion parses content", chat.data.content === "你好，我是栖木客服。");
    check("[stub] costUsd taken from usage.cost, estimated=false", chat.costUsd === 0.000012 && !chat.estimated);
    check("[stub] latencyMs measured", chat.latencyMs >= 0);
    const req = seen[0];
    check("[stub] request has usage.include and Bearer auth", (req.body.usage as { include?: boolean })?.include === true && req.auth === "Bearer test-key-not-real");
    check("[stub] response_format forwarded", (req.body.response_format as { type?: string })?.type === "json_object");

    const emb = await embed({ model: "stub/embed", input: ["a", "b"] });
    check("[stub] embed sorts by index", emb.data[0][0] === 1 && emb.data[1][1] === 1);
    check("[stub] embed cost estimated when usage.cost missing", emb.estimated && emb.costUsd > 0);

    const dec = await decisions({
      state: { text: "x" },
      questions: { risk: { type: "noul", instructions: "?" } },
    });
    const last = seen[seen.length - 1];
    check("[stub] decisions hits /alpha/decisions with default Jev model", last.path === "/alpha/decisions" && last.body.model === "typesafe/jev-1.13");
    check("[stub] decisions parses answers + cost", dec.data.answers.risk.type === "noul" && dec.costUsd === 0.00001);

    try {
      await chatCompletion({ model: "stub/model", messages: [{ role: "user", content: "slow" }], timeoutMs: 300 });
      check("[stub] timeout raises OpenRouterError(timeout)", false);
    } catch (err) {
      check("[stub] timeout raises OpenRouterError(timeout)", err instanceof OpenRouterError && err.kind === "timeout");
    }
  } finally {
    process.env.OPENROUTER_API_KEY = saved.key ?? "";
    if (saved.base === undefined) delete process.env.OPENROUTER_API_BASE;
    else process.env.OPENROUTER_API_BASE = saved.base;
    server.closeAllConnections();
    server.close();
  }
}

async function noKeyTest(): Promise<void> {
  const saved = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try {
    await chatCompletion({ messages: [{ role: "user", content: "你好" }] });
    check("[no key] chatCompletion throws NoApiKeyError", false);
  } catch (err) {
    check("[no key] chatCompletion throws NoApiKeyError", err instanceof NoApiKeyError, `(${(err as Error).name})`);
  }
  for (const [label, fn] of [
    ["embed", () => embed({ input: ["x"] })],
    ["decisions", () => decisions({ state: "x", questions: {} })],
  ] as const) {
    try {
      await fn();
      check(`[no key] ${label} throws NoApiKeyError`, false);
    } catch (err) {
      check(`[no key] ${label} throws NoApiKeyError`, err instanceof NoApiKeyError);
    }
  }
  if (saved !== undefined) process.env.OPENROUTER_API_KEY = saved;
}

async function realKeyTest(): Promise<void> {
  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    console.log("SKIP  [real key] OPENROUTER_API_KEY not set — see README / handoff for how to create .env.local");
    return;
  }
  const model = process.env.GENERATION_MODEL;
  try {
    const r = await chatCompletion({
      model,
      messages: [{ role: "user", content: "请用一句中文介绍你自己，不超过30个字。" }],
      maxTokens: 200,
      reasoning: { enabled: false },
      timeoutMs: 20000,
    });
    const hasChinese = /[\u4e00-\u9fff]/.test(r.data.content);
    console.log(`      model=${r.data.model}\n      reply=${r.data.content}`);
    console.log(
      `      latency=${r.latencyMs}ms cost=$${r.costUsd.toFixed(6)} (${formatCny(r.costUsd)}) estimated=${r.estimated}`,
    );
    check("[real key] chatCompletion returns a Chinese sentence", hasChinese);
  } catch (err) {
    check("[real key] chatCompletion returns a Chinese sentence", false, `(${(err as Error).message})`);
  }
}

(async () => {
  await offlineStubTests();
  await noKeyTest();
  await realKeyTest();
  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
