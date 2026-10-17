// ─────────────────────────────────────────────────────────────────────────────
// Relay — Architect agent. Turns the requirement history into a Plan (JSON).
// On revisions it keeps stable component ids and fills `delta`.
// ─────────────────────────────────────────────────────────────────────────────

import { completeJson, type LlmMeta } from "@/lib/llm";
import type { Plan, PlanComponent, PlanDelta } from "@/lib/types";
import { architectSystemPrompt, architectUserPrompt, SITE_FILES, type ArchitectCtx } from "./prompts";

export type { ArchitectCtx } from "./prompts";

const MIN_COMPONENTS = 2;
const MAX_COMPONENTS = 9;

/** Contract entry point: the plan alone. */
export async function plan(ctx: ArchitectCtx): Promise<Plan> {
  const { plan: result } = await planWithMeta(ctx);
  return result;
}

/** Plan plus which provider/model produced it, for honest agent cards and messages. */
export async function planWithMeta(ctx: ArchitectCtx): Promise<{ plan: Plan; meta: LlmMeta }> {
  const targetRevision = ctx.requirements.reduce((max, r) => Math.max(max, r.revision), 0) || ctx.workspace.revision;
  const { value, result } = await completeJson({
    label: ctx.previousPlan ? `architect:revise:r${targetRevision}` : `architect:plan:r${targetRevision}`,
    messages: [
      { role: "system", content: architectSystemPrompt() },
      { role: "user", content: architectUserPrompt(ctx) },
    ],
    temperature: 0.4,
    maxTokens: 2600,
  });
  const normalized = normalizePlan(value, ctx.previousPlan, targetRevision);
  const { text: _text, ...meta } = result;
  void _text;
  return { plan: normalized, meta };
}

// ── normalisation ──────────────────────────────────────────────────────────

type Raw = Record<string, unknown>;

function asRecord(v: unknown): Raw | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : null;
}

function asString(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return fallback;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => asString(x)).filter((s) => s.length > 0);
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function normalizePlan(value: unknown, previousPlan: Plan | null, targetRevision: number): Plan {
  const raw = asRecord(value);
  if (!raw) throw new Error("Architect returned JSON that is not an object");

  const rawComponents = Array.isArray(raw.components) ? raw.components : [];
  const seen = new Set<string>();
  const components: PlanComponent[] = [];
  for (const item of rawComponents) {
    const c = asRecord(item);
    if (!c) continue;
    const name = asString(c.name) || asString(c.id);
    let id = slugify(asString(c.id) || name);
    if (!id) continue;
    let suffix = 2;
    while (seen.has(id)) id = `${slugify(asString(c.id) || name)}-${suffix++}`;
    seen.add(id);
    const files = asStringArray(c.files).map((f) => f.replace(/^\.\//, ""));
    components.push({
      id,
      name: name || id,
      description: asString(c.description) || `${name} section`,
      files: files.length ? files : [...SITE_FILES],
    });
  }
  if (components.length < MIN_COMPONENTS) {
    throw new Error(`Architect returned ${components.length} component(s); expected at least ${MIN_COMPONENTS}`);
  }
  if (components.length > MAX_COMPONENTS) components.length = MAX_COMPONENTS;

  const designRaw = asRecord(raw.design) ?? {};
  const design = {
    palette: asString(designRaw.palette) || previousPlan?.design.palette || "",
    typography: asString(designRaw.typography) || previousPlan?.design.typography || "",
    tone: asString(designRaw.tone) || previousPlan?.design.tone || "",
  };
  if (!design.palette || !design.typography || !design.tone) {
    throw new Error("Architect plan is missing design tokens (palette/typography/tone)");
  }

  const summary = asString(raw.summary);
  if (!summary) throw new Error("Architect plan is missing a summary");
  const audience = asString(raw.audience) || previousPlan?.audience || "";
  if (!audience) throw new Error("Architect plan is missing an audience");

  const delta = previousPlan ? buildDelta(raw.delta, previousPlan, components, targetRevision, summary) : null;

  return {
    revision: targetRevision,
    summary,
    audience,
    components,
    design,
    delta,
    createdAt: Date.now(),
  };
}

/**
 * The model proposes the delta; the code owns the truth about which ids were
 * added/removed (computed from the two component lists). Affected ids are the
 * model's claim filtered to real ids, plus everything added.
 */
function buildDelta(rawDelta: unknown, previousPlan: Plan, components: PlanComponent[], targetRevision: number, summary: string): PlanDelta {
  const d = asRecord(rawDelta) ?? {};
  const prevIds = new Set(previousPlan.components.map((c) => c.id));
  const nextIds = new Set(components.map((c) => c.id));
  const added = [...nextIds].filter((id) => !prevIds.has(id));
  const removed = [...prevIds].filter((id) => !nextIds.has(id));
  const claimedAffected = asStringArray(d.affectedComponents).map(slugify).filter((id) => nextIds.has(id));
  const affected = [...new Set([...claimedAffected, ...added])];
  const rationale = asString(d.rationale) || summary;
  return {
    fromRevision: previousPlan.revision,
    toRevision: targetRevision,
    affectedComponents: affected,
    addedComponents: added,
    removedComponents: removed,
    rationale,
  };
}
