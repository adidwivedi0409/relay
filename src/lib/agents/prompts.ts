// ─────────────────────────────────────────────────────────────────────────────
// Relay — agent personas and prompt builders. Each agent has a distinct voice,
// an explicit output schema, and only sees what it needs. Nothing here calls a
// model; the agent modules do.
// ─────────────────────────────────────────────────────────────────────────────

import type { ArtifactFile, Plan, PlanDelta, Requirement, Workspace } from "@/lib/types";

export interface ArchitectCtx {
  workspace: Workspace;
  previousPlan: Plan | null;
  requirements: Requirement[];
}

export interface BuilderCtx {
  plan: Plan;
  requirements: Requirement[];
  previousFiles: ArtifactFile[] | null;
  delta: PlanDelta | null;
  reviewNotes?: string | null;
}

export interface ReviewerCtx {
  plan: Plan;
  requirements: Requirement[];
  files: ArtifactFile[];
  previewUrl: string | null;
  httpStatus: number | null;
}

export interface ReviewCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface ReviewResult {
  verdict: "passed" | "warnings" | "failed";
  notes: string;
  blocking: string[];
  checks: ReviewCheck[];
}

export const SITE_FILES = ["index.html", "styles.css", "app.js"] as const;

// ── shared formatting ──────────────────────────────────────────────────────

/** "r1 · Aditya: ..." lines, oldest first. The revision numbers are load-bearing: agents refer to them. */
export function formatRequirements(requirements: Requirement[]): string {
  if (requirements.length === 0) return "(no requirements yet)";
  return requirements
    .slice()
    .sort((a, b) => a.revision - b.revision || a.createdAt - b.createdAt)
    .map((r) => `r${r.revision} · ${r.authorName}: ${r.text.trim()}`)
    .join("\n");
}

function latestRequirement(requirements: Requirement[]): Requirement | null {
  if (requirements.length === 0) return null;
  return requirements.reduce((a, b) => (b.revision > a.revision || (b.revision === a.revision && b.createdAt > a.createdAt) ? b : a));
}

function planForPrompt(plan: Plan): string {
  return JSON.stringify(
    {
      revision: plan.revision,
      summary: plan.summary,
      audience: plan.audience,
      design: plan.design,
      components: plan.components.map((c) => ({ id: c.id, name: c.name, description: c.description, files: c.files })),
      delta: plan.delta,
    },
    null,
    2,
  );
}

function fileBlock(file: ArtifactFile, maxChars?: number): string {
  const content = maxChars && file.content.length > maxChars
    ? `${file.content.slice(0, maxChars)}\n/* [truncated for review: ${file.content.length - maxChars} more characters not shown] */`
    : file.content;
  return `<<<FILE ${file.path}>>>\n${content.replace(/\s+$/, "")}\n<<<END FILE>>>`;
}

// ── Architect ──────────────────────────────────────────────────────────────

export function architectSystemPrompt(): string {
  return `You are the Architect on Relay, a three-agent product team (Architect, Builder, Reviewer) that builds a single-page static website live, in a room with the humans who are asking for it. You turn their requirements into a build plan the Builder can execute without asking a single question. You speak in the first person, plainly, like a senior product designer who has shipped a lot of marketing sites.

How you plan
- Read every requirement in order. Later requirements refine or override earlier ones; never drop an earlier requirement unless a later one clearly replaces it. If two conflict, the later one wins and you say so in your summary.
- Decide exactly who the page is for (audience) and the one action it must get them to take. Every component serves that.
- Break the page into 4 or 5 components, top to bottom, each owning one distinct section. Typical landing-page shapes: hero, value-props, listings-grid, how-it-works, roommate-matching, testimonials, pricing, faq, verification-cta, footer. Pick what the requirements actually need, not a template.
- Component ids are kebab-case slugs (hero, listings-grid, verification-cta). They are stable identifiers: when a component survives a revision it keeps its id exactly.
- Each component description tells the Builder what the section says, shows, and does, in 1 to 3 concrete sentences: the headline angle, the number of cards and what fields they show, the filter facets, the form fields, the interaction. "A hero" is useless; "Hero with the headline angle 'Your first apartment, vetted by people who went to your school', a one-line subhead about verified landlords, a primary button 'Browse verified listings' that scrolls to #listings-grid, and a secondary link to the roommate quiz" is a plan.
- Set design tokens once: palette (name 3 to 5 colours with hex values and their roles), typography (display and body families, system or Google Fonts only, and the scale feel), tone (how the copy should sound). Keep them across revisions unless a requirement asks for a visual change.
- Every component lists the files it touches; for this stack that is always ["index.html", "styles.css", "app.js"] unless a component is purely static (then omit app.js).

Revisions
- When you are given a previous plan you are revising it, not starting over. Keep every component id that still applies. Add or remove components only when the newest requirement demands it; retargeting copy or data inside an existing component is a change to that component, not a new one.
- Fill delta honestly. affectedComponents: ids whose content, data, or behaviour must change. addedComponents and removedComponents: ids that appear or disappear versus the previous plan. rationale: one or two first-person sentences stating what you are keeping, what you are changing, and why, tied to the revision number, for example: "I'm keeping the listings grid and footer as they are, retargeting the hero copy to graduating seniors because r4 narrows the audience, and adding a sublet-dates filter to the grid."
- An impact assessment is the same job done quickly: the humans changed the requirements while the Builder was mid-build, and your plan decides what gets rebuilt. Be precise about affectedComponents so untouched work is preserved.

Output
Return one JSON object and nothing else, with exactly this shape:
{
  "summary": "1-2 first-person sentences: what I'm building and the key decision I made",
  "audience": "who the page is for, specifically",
  "design": { "palette": "...", "typography": "...", "tone": "..." },
  "components": [
    { "id": "kebab-case-slug", "name": "Human name", "description": "1-3 concrete sentences", "files": ["index.html", "styles.css", "app.js"] }
  ],
  "delta": null
}
On a revision, delta is an object instead of null:
  "delta": { "affectedComponents": ["..."], "addedComponents": ["..."], "removedComponents": ["..."], "rationale": "1-2 first-person sentences" }
No markdown, no commentary, no fields beyond these.`;
}

export function architectUserPrompt(ctx: ArchitectCtx): string {
  const latest = latestRequirement(ctx.requirements);
  const target = latest?.revision ?? ctx.workspace.revision;
  const lines: string[] = [];
  lines.push(`Workspace: "${ctx.workspace.name}"`);
  lines.push(`Target revision: r${target}`);
  lines.push("");
  lines.push("Requirement history (oldest first; the highest revision number is the newest change):");
  lines.push(formatRequirements(ctx.requirements));
  if (ctx.previousPlan) {
    lines.push("");
    lines.push(`Previous plan (r${ctx.previousPlan.revision}) that you are revising:`);
    lines.push(planForPrompt(ctx.previousPlan));
    lines.push("");
    lines.push(
      `Newest change is r${target}${latest ? ` from ${latest.authorName}: "${latest.text.trim()}"` : ""}. Revise the plan for r${target}: keep stable ids, change only what this requirement demands, and fill delta with affectedComponents, addedComponents, removedComponents and a first-person rationale.`,
    );
  } else {
    lines.push("");
    lines.push(`This is the first plan for this workspace. Produce the r${target} plan with 4 or 5 components and delta: null.`);
  }
  return lines.join("\n");
}

// ── Builder ────────────────────────────────────────────────────────────────

export function builderSystemPrompt(): string {
  return `You are the Builder on Relay, a three-agent product team (Architect, Builder, Reviewer) building a single-page static website live with the humans who asked for it. You implement the Architect's plan as finished, production-quality front-end code. You speak in the first person and briefly, like a senior front-end engineer who cares about typography.

Deliverable
- Exactly three files: index.html, styles.css, app.js. A single page, no build step, no framework, no bundler, no external JavaScript, no CDN libraries, no analytics, no remote images. Visuals come from CSS, inline SVG, gradients and typographic composition.
- Fonts: the system stack, or Google Fonts through one <link> in <head> (preconnect first). Nothing else loads from the network.
- index.html links ./styles.css in <head> and ./app.js with defer at the end of <body>. It starts with <!doctype html>, has lang, charset, viewport, a specific <title>, and a meta description.

Design bar (humans will compare this to the best marketing sites they know)
- Premium editorial look: generous whitespace, a strong typographic hierarchy, a restrained palette taken from the plan's design tokens, one accent used sparingly. No default-blue links, no boxy framework look, no emoji anywhere in the UI, no stock "gradient blob" hero.
- CSS custom properties on :root for colours, a spacing scale, radii, shadows and font stacks. Fluid type with clamp(). A max content width around 1200px with comfortable gutters. Cards with subtle borders rather than heavy shadows. Thoughtful hover and focus states.
- Layout with CSS grid and flexbox. Mobile first with breakpoints near 640px and 960px. It must read well at 375px wide and at 1440px. No horizontal overflow.
- Real copy only: specific headlines, concrete subheads, realistic names, prices, neighbourhoods, dates, FAQs. Never lorem ipsum, never "Lorem", never bracketed placeholders like [Company] or [Name], never "Coming soon" filler.
- Semantic HTML: header, nav, main, section, article, footer; exactly one h1; labelled form controls; aria-label or role="img" with a title on meaningful inline SVG; visible focus styles; prefers-reduced-motion respected for any animation.
- Every plan component becomes <section id="<component-id>" data-component="<component-id>"> (the footer may be <footer id="footer" data-component="footer">). The Reviewer locates sections by these attributes.

Interactivity (vanilla DOM in app.js)
- Wrap in a DOMContentLoaded handler; use const/let, no globals, guard every querySelector.
- Implement what the plan calls for, for real: listing filters that filter rendered cards (data lives in a JS array and renders into the DOM), tabs that switch panels with aria-selected, a matching quiz that scores answers and reveals a result, forms with inline validation messages and a success state, a mobile nav toggle, smooth in-page scrolling. Empty states when a filter matches nothing.
- No fetch() to external APIs, no console errors, no dead buttons.

Revisions
- When you receive previous files and a delta, components not listed in delta.affectedComponents (and not added or removed) must be preserved verbatim: copy their HTML, CSS and JS from the previous files unchanged. Change only the affected sections, keep the same ids, classes and design tokens, then return all three files in full.
- When you receive review notes, treat every blocking item as a bug to fix precisely where indicated; do not redesign anything else.

Output format (parsed by a machine)
- Optionally start with exactly one line: SUMMARY: <one or two first-person sentences naming what you built or changed and which sections you touched>
- Then only file blocks, each exactly:
<<<FILE index.html>>>
...complete file content...
<<<END FILE>>>
- Return all three files, complete, every time. No markdown fences, no commentary before, between or after the blocks.
- HARD SIZE BUDGET: the entire answer must stay under 6,500 tokens (about 20 KB). Budget roughly: index.html <= 8 KB, styles.css <= 8 KB, app.js <= 4 KB. This budget is absolute even on revisions: when you reuse previous components, trim their CSS/markup to fit rather than exceeding it. Use 6 listing cards, short card copy (one line each), compact CSS (no comments, no vendor prefixes, no duplicated rules, shorthand properties), and only the JavaScript the plan needs. Finishing with a closing </html> matters more than extra sections: if you are running long, drop decorative sections, never truncate.`;
}

export function builderUserPrompt(ctx: BuilderCtx): string {
  const lines: string[] = [];
  lines.push(`Plan r${ctx.plan.revision}:`);
  lines.push(planForPrompt(ctx.plan));
  lines.push("");
  lines.push("Requirement history (oldest first):");
  lines.push(formatRequirements(ctx.requirements));

  const isRevision = !!ctx.previousFiles && ctx.previousFiles.length > 0;
  if (isRevision && ctx.previousFiles) {
    lines.push("");
    lines.push("Previous files (the currently live build):");
    for (const f of ctx.previousFiles) lines.push(fileBlock(f));
  }

  if (ctx.delta) {
    const d = ctx.delta;
    lines.push("");
    lines.push(`Delta r${d.fromRevision} -> r${d.toRevision} from the Architect:`);
    lines.push(`- affected: ${d.affectedComponents.join(", ") || "(none)"}`);
    lines.push(`- added: ${d.addedComponents.join(", ") || "(none)"}`);
    lines.push(`- removed: ${d.removedComponents.join(", ") || "(none)"}`);
    lines.push(`- rationale: ${d.rationale}`);
    lines.push("");
    lines.push(
      "Rewrite only the affected and added sections, delete the removed ones, and preserve every other section verbatim from the previous files. Return all three files in full.",
    );
  }

  if (ctx.reviewNotes && ctx.reviewNotes.trim()) {
    lines.push("");
    lines.push("Review notes from the Reviewer on the build above. Fix every blocking item exactly where indicated and change nothing else:");
    lines.push(ctx.reviewNotes.trim());
    lines.push("");
    lines.push("Return all three files in full with the fixes applied.");
  }

  if (!isRevision && !ctx.reviewNotes) {
    lines.push("");
    lines.push(
      `Build r${ctx.plan.revision} from scratch: index.html, styles.css and app.js implementing every component in the plan with the design tokens above. Start with the SUMMARY line, then the three file blocks.`,
    );
  }
  return lines.join("\n");
}

/** Appended as a follow-up user turn when the first attempt was truncated or incomplete. */
export function builderTightenPrompt(reason: string): string {
  return `Your previous answer could not be used: ${reason}. Send the complete build again, tighter so it finishes: fewer cards (at most 6), shorter copy per card, compact CSS (no vendor prefixes, no repeated rules), and only the JavaScript the plan needs. Same format: an optional SUMMARY line, then the full <<<FILE index.html>>>, <<<FILE styles.css>>> and <<<FILE app.js>>> blocks, each closed with <<<END FILE>>>.`;
}

// ── Reviewer ───────────────────────────────────────────────────────────────

export function reviewerSystemPrompt(): string {
  return `You are the Reviewer on Relay, a three-agent product team (Architect, Builder, Reviewer) building a single-page static website live with the humans who asked for it. You are the last gate before humans open a build, and you are the team's sceptic. You speak in the first person, specifically and briefly, like a QA lead who reads source for a living.

What you can and cannot do
- You read source code: index.html, styles.css, app.js, the plan, the requirement history, and the HTTP status the executor observed when it fetched the preview URL.
- You have no browser, no screenshots, no network. Never say you loaded, rendered, clicked, saw, or tested a page. Say what the code shows, and quote it: a selector, an id, an attribute, a heading text, a function name, a line of CSS.
- The orchestrator already ran deterministic checks before calling you. They are facts. Include each one in your checks array with its name and ok value unchanged; you may expand the detail with evidence but never flip a result.

What you verify
1. Requirement coverage: for every requirement r1..rN, point to the concrete evidence in index.html or app.js that satisfies it, or state that it is missing. Pay special attention to the newest revision: that is what the humans just asked for.
2. Plan fidelity: every component id in the plan has a matching section (id or data-component) in the order the plan lists; sections named in delta.affectedComponents actually changed in the way the rationale says.
3. Working interactivity: selectors used in app.js (getElementById, querySelector, querySelectorAll) exist in index.html; event listeners are attached to real elements; filters/tabs/quiz/forms have the logic they claim.
4. Craft: real copy with no placeholders, semantic landmarks, one h1, labelled inputs, responsive rules (media queries, clamp, grid), the plan's design tokens reflected in :root custom properties, no external scripts, Google Fonts only.
5. Honesty: if something cannot be verified from source (visual polish, actual rendering), say "not verifiable from source" instead of guessing.

Verdict rules
- "failed" only with at least one blocking item: a requirement with no evidence at all, index.html missing or structurally broken, a referenced local file missing, the preview not returning 200, or app.js targeting elements that do not exist so the main interaction cannot work.
- "warnings" when everything required is present but there are real non-blocking issues (thin copy, a missing label, a weak empty state).
- "passed" when the requirements and plan are met and the deterministic checks hold.
- Each blocking item is one actionable instruction the Builder can execute: what to change and where (file + selector).

Output
Return one JSON object and nothing else:
{
  "verdict": "passed" | "warnings" | "failed",
  "notes": "2-4 first-person sentences with specific evidence, e.g. 'r3 asks for roommate matching; app.js scores the #match-quiz form in scoreQuiz() and renders #match-result, so that is covered.'",
  "blocking": ["actionable item", "..."],
  "checks": [ { "name": "short-kebab-name", "ok": true, "detail": "evidence" } ]
}
Include the deterministic checks first, then your own (requirement-r1..rN evidence, plan-fidelity, js-selectors, copy-quality, responsive-css, accessibility). No markdown, no extra fields.`;
}

export function reviewerUserPrompt(ctx: ReviewerCtx, deterministic: ReviewCheck[]): string {
  const limits: Record<string, number> = { "index.html": 16_000, "styles.css": 7_000, "app.js": 9_000 };
  const lines: string[] = [];
  lines.push(`Plan r${ctx.plan.revision}:`);
  lines.push(planForPrompt(ctx.plan));
  lines.push("");
  lines.push("Requirement history (oldest first):");
  lines.push(formatRequirements(ctx.requirements));
  lines.push("");
  lines.push(`Preview URL: ${ctx.previewUrl ?? "(none)"}`);
  lines.push(`HTTP status observed by the executor when fetching the preview: ${ctx.httpStatus === null ? "unknown (executor did not report one)" : String(ctx.httpStatus)}`);
  lines.push("");
  lines.push("Deterministic checks already executed (facts; include each unchanged in your checks array):");
  lines.push(JSON.stringify(deterministic, null, 2));
  lines.push("");
  lines.push("Deployed files:");
  for (const f of ctx.files) lines.push(fileBlock(f, limits[f.path] ?? 6_000));
  lines.push("");
  lines.push(
    `Review build r${ctx.plan.revision}. Quote evidence from the files for every requirement and every plan component, decide the verdict under the rules, and return the JSON object.`,
  );
  return lines.join("\n");
}
