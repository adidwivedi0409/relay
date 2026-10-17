// ─────────────────────────────────────────────────────────────────────────────
// Relay — Builder agent. Emits the full static site as file blocks. On
// revisions it rewrites affected components and returns the full file set.
// ─────────────────────────────────────────────────────────────────────────────

import { complete, parseFiles, type ChatMessage, type LlmMeta } from "@/lib/llm";
import type { ArtifactFile } from "@/lib/types";
import { builderSystemPrompt, builderTightenPrompt, builderUserPrompt, SITE_FILES, type BuilderCtx } from "./prompts";

export type { BuilderCtx } from "./prompts";

const BUILDER_MAX_TOKENS = 9000;
const BUILDER_TIMEOUT_MS = 180_000;
/** Optional faster/better coder model on the same provider (e.g. mimo-v2.6-pro on Wally). */
const BUILDER_MODEL = process.env.RELAY_BUILDER_MODEL || undefined;

export interface BuildOutput {
  files: ArtifactFile[];
  summary: string;
}

/** Contract entry point. */
export async function build(ctx: BuilderCtx): Promise<BuildOutput> {
  const { files, summary } = await buildWithMeta(ctx);
  return { files, summary };
}

/** Build plus which provider/model produced it. */
export async function buildWithMeta(ctx: BuilderCtx): Promise<BuildOutput & { meta: LlmMeta }> {
  const label = ctx.reviewNotes ? `builder:fix:r${ctx.plan.revision}` : ctx.delta ? `builder:revise:r${ctx.plan.revision}` : `builder:build:r${ctx.plan.revision}`;
  const messages: ChatMessage[] = [
    { role: "system", content: builderSystemPrompt() },
    { role: "user", content: builderUserPrompt(ctx) },
  ];

  const first = await complete({ label, messages, temperature: 0.5, maxTokens: BUILDER_MAX_TOKENS, timeoutMs: BUILDER_TIMEOUT_MS, model: BUILDER_MODEL });
  const firstParsed = interpret(first.text, ctx);
  if (firstParsed.ok && first.finishReason !== "length") {
    const { text: _t, ...meta } = first;
    void _t;
    return { files: firstParsed.files, summary: firstParsed.summary, meta };
  }

  // One retry, asking for a tighter answer. Keep the first attempt in context so
  // the model knows what it was doing, but trimmed so we do not blow the window.
  const reason = !firstParsed.ok ? firstParsed.problem : "it was cut off by the output limit before the last file block closed";
  console.warn(`[builder] ${label}: ${reason}; retrying once with a tighter brief`);
  const retryMessages: ChatMessage[] = [
    ...messages,
    { role: "assistant", content: first.text.slice(0, 6000) + (first.text.length > 6000 ? "\n[...]" : "") },
    { role: "user", content: builderTightenPrompt(reason) },
  ];
  const second = await complete({ label: `${label}:retry`, messages: retryMessages, temperature: 0.4, maxTokens: BUILDER_MAX_TOKENS, timeoutMs: BUILDER_TIMEOUT_MS, model: BUILDER_MODEL });
  const secondParsed = interpret(second.text, ctx);
  if (!secondParsed.ok) {
    throw new Error(`Builder did not return a usable site after two attempts: ${secondParsed.problem}`);
  }
  if (second.finishReason === "length") {
    throw new Error("Builder output was truncated by the model's output limit on both attempts; the site would be incomplete");
  }
  const { text: _t2, ...meta } = second;
  void _t2;
  return { files: secondParsed.files, summary: secondParsed.summary, meta: { ...meta, ms: first.ms + second.ms } };
}

// ── parsing ────────────────────────────────────────────────────────────────

type Interpreted = { ok: true; files: ArtifactFile[]; summary: string } | { ok: false; problem: string };

function interpret(text: string, ctx: BuilderCtx): Interpreted {
  const summaryLine = extractSummary(text);
  let files = parseFiles(text);
  if (files.length === 0) return { ok: false, problem: "no <<<FILE ...>>> blocks were found in the answer" };

  // On a revision the model may legitimately omit a file it did not touch; carry
  // the previous content forward. On a first build every file must be present.
  const previous = new Map((ctx.previousFiles ?? []).map((f) => [f.path, f.content]));
  const present = new Set(files.map((f) => f.path));
  const carried: string[] = [];
  for (const required of SITE_FILES) {
    if (present.has(required)) continue;
    const prev = previous.get(required);
    if (prev !== undefined) {
      files.push({ path: required, content: prev });
      carried.push(required);
    }
  }
  const index = files.find((f) => f.path === "index.html");
  if (!index) return { ok: false, problem: "index.html block is missing" };
  if (!/<html[\s>]/i.test(index.content) || !/<\/html>/i.test(index.content)) {
    return { ok: false, problem: "index.html is incomplete (no closing </html>)" };
  }
  if (!files.some((f) => f.path === "styles.css")) return { ok: false, problem: "styles.css block is missing" };
  if (!files.some((f) => f.path === "app.js")) return { ok: false, problem: "app.js block is missing" };
  if (/lorem ipsum/i.test(index.content)) return { ok: false, problem: "index.html contains lorem ipsum placeholder copy" };

  files = orderFiles(files);
  let summary = summaryLine ?? describeFiles(files);
  if (carried.length) summary += ` Unchanged ${carried.join(" and ")} carried forward from the previous build.`;
  return { ok: true, files, summary };
}

/** The optional "SUMMARY: ..." line; only looked for in the first few non-empty lines before any file block. */
function extractSummary(text: string): string | null {
  const lines = text.split(/\r?\n/);
  let seen = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^<<<\s*FILE/i.test(trimmed)) return null;
    const m = trimmed.match(/^(?:\*\*)?SUMMARY\s*:(?:\*\*)?\s*(.+)$/i);
    if (m) return m[1].trim().replace(/\*\*$/, "").trim();
    if (++seen > 4) return null;
  }
  return null;
}

function describeFiles(files: ArtifactFile[]): string {
  const parts = files.map((f) => `${f.path} (${f.content.split("\n").length} lines)`);
  return `I wrote ${parts.join(", ")}.`;
}

function orderFiles(files: ArtifactFile[]): ArtifactFile[] {
  const rank = (p: string) => {
    const i = (SITE_FILES as readonly string[]).indexOf(p);
    return i === -1 ? SITE_FILES.length : i;
  };
  return files.slice().sort((a, b) => rank(a.path) - rank(b.path) || a.path.localeCompare(b.path));
}
