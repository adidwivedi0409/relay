// ─────────────────────────────────────────────────────────────────────────────
// Relay — Reviewer agent. Deterministic source checks first (facts), then a
// model judgement that must quote evidence. Never claims to have run a browser.
// ─────────────────────────────────────────────────────────────────────────────

import { completeJson, type LlmMeta } from "@/lib/llm";
import type { Requirement } from "@/lib/types";
import { reviewerSystemPrompt, reviewerUserPrompt, type ReviewCheck, type ReviewResult, type ReviewerCtx } from "./prompts";

export type { ReviewCheck, ReviewResult, ReviewerCtx } from "./prompts";

/** Optional per-agent model on the same provider (e.g. deepseek-v4.1-flash on Wally). */
const REVIEWER_MODEL = process.env.RELAY_REVIEWER_MODEL || undefined;

/** Contract entry point. */
export async function review(ctx: ReviewerCtx): Promise<ReviewResult> {
  const { review: result } = await reviewWithMeta(ctx);
  return result;
}

/** Review plus which provider/model produced it. */
export async function reviewWithMeta(ctx: ReviewerCtx): Promise<{ review: ReviewResult; meta: LlmMeta }> {
  const deterministic = runDeterministicChecks(ctx);
  const { value, result } = await completeJson({
    label: `reviewer:r${ctx.plan.revision}`,
    messages: [
      { role: "system", content: reviewerSystemPrompt() },
      { role: "user", content: reviewerUserPrompt(ctx, deterministic) },
    ],
    temperature: 0.2,
    maxTokens: 2200,
    model: REVIEWER_MODEL,
  });
  const merged = reconcile(value, deterministic, ctx);
  const { text: _text, ...meta } = result;
  void _text;
  return { review: merged, meta };
}

// ── deterministic checks ───────────────────────────────────────────────────

const HARD_CHECKS = new Set(["index-doctype", "index-title", "local-refs-exist", "preview-200", "no-external-scripts"]);

const STOPWORDS = new Set(
  (
    "a an and are as at be but by for from has have if in into is it its of on or that the their them then there these they this to was we were what when where which who will with would you your " +
    "about also any because been being can could did does doing done each else even every get got just like make makes made more most much must need needs new now only other our out over " +
    "own page pages please put same see should show site some such sure than through too under use used using very want wants way well while why without work works " +
    "landing website web app build built create add adds added section sections feature features include includes including users user people something things thing really maybe kind sort lot bit " +
    "look looks looking style styled nice better good great cool fancy clean simple modern sleek pretty beautiful little less change changes changed update updated updates instead rather"
  ).split(/\s+/),
);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^-+|-+$/g, ""))
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

/** Rough stem so "roommates" matches "roommate" and "verified" matches "verify". */
function stem(word: string): string {
  return word.replace(/(ing|ed|es|s|ly|tion|ions)$/i, "").slice(0, Math.max(4, word.length - 3));
}

function requirementCoverage(req: Requirement, haystack: string): ReviewCheck {
  const words = [...new Set(tokens(req.text))];
  const name = `requirement-r${req.revision}-keywords`;
  if (words.length === 0) {
    return { name, ok: true, detail: `r${req.revision} has no distinctive keywords to grep for ("${req.text.slice(0, 60)}"); judged by the model only` };
  }
  const found: string[] = [];
  const missing: string[] = [];
  for (const w of words) (haystack.includes(stem(w)) ? found : missing).push(w);
  const threshold = Math.min(words.length, Math.max(1, Math.ceil(words.length * 0.4)));
  const ok = found.length >= threshold;
  return {
    name,
    ok,
    detail: `r${req.revision}: ${found.length}/${words.length} keywords appear in index.html+styles.css+app.js (need ${threshold})` + (found.length ? ` (found: ${found.slice(0, 8).join(", ")})` : "") + (missing.length ? ` (missing: ${missing.slice(0, 8).join(", ")})` : ""),
  };
}

export function runDeterministicChecks(ctx: ReviewerCtx): ReviewCheck[] {
  const checks: ReviewCheck[] = [];
  const byPath = new Map(ctx.files.map((f) => [f.path, f.content]));
  const index = byPath.get("index.html") ?? "";
  const js = byPath.get("app.js") ?? "";
  const css = byPath.get("styles.css") ?? "";

  // 1. index.html exists and starts properly.
  checks.push({
    name: "index-doctype",
    ok: /^\uFEFF?\s*<!doctype\s+html/i.test(index),
    detail: index ? (/^\uFEFF?\s*<!doctype\s+html/i.test(index) ? "index.html starts with <!doctype html>" : `index.html starts with "${index.slice(0, 40).replace(/\s+/g, " ")}" instead of <!doctype html>`) : "index.html is missing from the artifact",
  });

  // 2. <title>
  const titleMatch = index.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "";
  checks.push({
    name: "index-title",
    ok: title.length > 0,
    detail: title ? `<title>${title.slice(0, 80)}</title>` : "index.html has no non-empty <title>",
  });

  // 3. Local script/link references resolve to files in the artifact.
  const refs: string[] = [];
  for (const m of index.matchAll(/<script[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi)) refs.push(m[1]);
  for (const m of index.matchAll(/<link[^>]*\shref\s*=\s*["']([^"']+)["']/gi)) refs.push(m[1]);
  const local = refs.filter((r) => !/^(https?:)?\/\//i.test(r) && !/^(data|mailto|tel):/i.test(r) && !r.startsWith("#"));
  const missingRefs = local.filter((r) => !byPath.has(r.replace(/^\.\//, "").replace(/^\//, "").split(/[?#]/)[0]));
  checks.push({
    name: "local-refs-exist",
    ok: missingRefs.length === 0,
    detail: local.length === 0 ? "index.html references no local files (styles.css/app.js are not linked)" : missingRefs.length === 0 ? `all local references resolve: ${local.join(", ")}` : `missing files for: ${missingRefs.join(", ")}`,
  });
  if (local.length === 0) checks[checks.length - 1].ok = false;

  // 4. No external JavaScript (Google Fonts stylesheets are the only allowed remote asset).
  const externalScripts = [...index.matchAll(/<script[^>]*\ssrc\s*=\s*["']((?:https?:)?\/\/[^"']+)["']/gi)].map((m) => m[1]);
  const externalLinks = [...index.matchAll(/<link[^>]*\shref\s*=\s*["']((?:https?:)?\/\/[^"']+)["']/gi)].map((m) => m[1]).filter((u) => !/fonts\.(googleapis|gstatic)\.com/i.test(u));
  checks.push({
    name: "no-external-scripts",
    ok: externalScripts.length === 0,
    detail: externalScripts.length === 0 ? (externalLinks.length ? `no external scripts; non-font external stylesheets: ${externalLinks.join(", ")}` : "no external scripts or non-font stylesheets") : `external scripts found: ${externalScripts.join(", ")}`,
  });

  // 5. Preview reachable.
  checks.push({
    name: "preview-200",
    ok: ctx.httpStatus === 200,
    detail:
      ctx.httpStatus === 200
        ? `executor fetched ${ctx.previewUrl ?? "preview"} and got 200`
        : ctx.httpStatus === null
          ? `executor reported no HTTP status for ${ctx.previewUrl ?? "preview"}; reachability not verified`
          : `executor fetched ${ctx.previewUrl ?? "preview"} and got HTTP ${ctx.httpStatus}`,
  });

  // 6. Plan components present as sections.
  const missingComponents = ctx.plan.components.filter((c) => !new RegExp(`(id|data-component)\\s*=\\s*["']${escapeRe(c.id)}["']`, "i").test(index)).map((c) => c.id);
  checks.push({
    name: "plan-sections-present",
    ok: missingComponents.length === 0,
    detail: missingComponents.length === 0 ? `all ${ctx.plan.components.length} plan component ids found as id/data-component in index.html` : `no section for: ${missingComponents.join(", ")}`,
  });

  // 7. JS selectors resolve to markup.
  const idTargets = new Set<string>();
  for (const m of js.matchAll(/getElementById\(\s*["'`]([^"'`]+)["'`]\s*\)/g)) idTargets.add(m[1]);
  for (const m of js.matchAll(/querySelector(?:All)?\(\s*["'`]#([A-Za-z0-9_-]+)["'`]\s*\)/g)) idTargets.add(m[1]);
  const htmlIds = new Set([...index.matchAll(/\sid\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]));
  const jsCreatesIds = new Set([...js.matchAll(/\bid\s*[:=]\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]));
  const unresolved = [...idTargets].filter((id) => !htmlIds.has(id) && !jsCreatesIds.has(id) && !js.includes(`id="${id}"`));
  checks.push({
    name: "js-id-selectors-resolve",
    ok: unresolved.length === 0,
    detail: idTargets.size === 0 ? "app.js targets no ids directly (uses class/data selectors or none)" : unresolved.length === 0 ? `all ${idTargets.size} id selectors in app.js exist in index.html` : `app.js targets ids missing from index.html: ${unresolved.slice(0, 8).join(", ")}`,
  });

  // 8. Placeholder copy.
  const placeholder = index.match(/lorem ipsum|\[(?:company|name|your [a-z ]+|insert [a-z ]+)\]|placeholder text|coming soon/i);
  checks.push({
    name: "no-placeholder-copy",
    ok: !placeholder,
    detail: placeholder ? `placeholder copy found: "${placeholder[0]}"` : "no lorem ipsum or bracketed placeholders in index.html",
  });

  // 9. Responsive CSS present.
  const hasMedia = /@media\s*\(/.test(css);
  const hasFluid = /clamp\(|minmax\(|auto-fit|auto-fill/.test(css);
  checks.push({
    name: "responsive-css",
    ok: hasMedia || hasFluid,
    detail: `styles.css ${hasMedia ? "has @media rules" : "has no @media rules"}${hasFluid ? " and fluid sizing (clamp/minmax/auto-fit)" : ""}; ${(css.match(/--[a-z0-9-]+\s*:/gi) ?? []).length} custom properties declared`,
  });

  // 10. Requirement keyword coverage, one check per requirement.
  const haystack = `${index}\n${css}\n${js}`.toLowerCase();
  for (const req of ctx.requirements.slice().sort((a, b) => a.revision - b.revision)) checks.push(requirementCoverage(req, haystack));

  return checks;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── reconcile model judgement with the facts ───────────────────────────────

type Raw = Record<string, unknown>;

function asRecord(v: unknown): Raw | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : null;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function reconcile(value: unknown, deterministic: ReviewCheck[], ctx: ReviewerCtx): ReviewResult {
  const raw = asRecord(value);
  if (!raw) throw new Error("Reviewer returned JSON that is not an object");

  const verdictRaw = asString(raw.verdict).toLowerCase();
  let verdict: ReviewResult["verdict"] = verdictRaw === "passed" || verdictRaw === "pass" ? "passed" : verdictRaw === "failed" || verdictRaw === "fail" ? "failed" : "warnings";
  let notes = asString(raw.notes);
  if (!notes) throw new Error("Reviewer returned no notes");

  const blocking = Array.isArray(raw.blocking) ? raw.blocking.map((b) => asString(b)).filter(Boolean) : [];

  // Model checks: keep its own, but deterministic names always carry the deterministic result.
  const byName = new Map<string, ReviewCheck>();
  for (const c of deterministic) byName.set(c.name, c);
  const modelChecks = Array.isArray(raw.checks) ? raw.checks : [];
  for (const item of modelChecks) {
    const c = asRecord(item);
    if (!c) continue;
    const name = asString(c.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (!name || byName.has(name)) continue;
    byName.set(name, { name, ok: c.ok === true, detail: asString(c.detail) || (c.ok === true ? "ok" : "not ok") });
  }
  const checks = [...byName.values()];

  // Facts override opinion: hard deterministic failures cannot pass.
  const hardFailures = deterministic.filter((c) => HARD_CHECKS.has(c.name) && !c.ok);
  const previewUnknown = ctx.httpStatus === null;
  const realHardFailures = hardFailures.filter((c) => !(c.name === "preview-200" && previewUnknown));
  if (realHardFailures.length > 0) {
    for (const f of realHardFailures) {
      const instruction = `Fix ${f.name}: ${f.detail}`;
      if (!blocking.some((b) => b.includes(f.name))) blocking.push(instruction);
    }
    if (verdict !== "failed") {
      notes += ` Deterministic checks failed (${realHardFailures.map((f) => f.name).join(", ")}), so I am marking this failed regardless of the rest.`;
      verdict = "failed";
    }
  } else if (verdict === "failed" && blocking.length === 0) {
    verdict = "warnings";
    notes += " I found no blocking item, so this is a warning rather than a failure.";
  } else if (verdict === "passed" && previewUnknown) {
    verdict = "warnings";
    notes += " The executor did not report an HTTP status for the preview, so reachability is unverified.";
  } else if (verdict === "passed" && deterministic.some((c) => !c.ok)) {
    verdict = "warnings";
  }

  // Keep the reviewer honest about its medium.
  if (/\bI (loaded|rendered|clicked|opened|saw|tested) /i.test(notes)) {
    notes = notes.replace(/\bI (loaded|rendered|clicked|opened|saw|tested) /gi, "The source shows ");
  }

  return { verdict, notes, blocking, checks };
}
