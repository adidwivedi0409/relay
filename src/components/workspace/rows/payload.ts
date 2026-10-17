// Defensive readers for RelayEvent.payload (Record<string, unknown>). The UI
// renders known keys and degrades gracefully when a producer omits one.

import type { ArtifactFile, ExecutorKind, Plan, PlanComponent, PlanDelta, Requirement, Task } from "@/lib/types";

export type Payload = Record<string, unknown>;

export function str(p: Payload, key: string): string | null {
  const v = p[key];
  return typeof v === "string" ? v : null;
}

export function num(p: Payload, key: string): number | null {
  const v = p[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function bool(p: Payload, key: string): boolean | null {
  const v = p[key];
  return typeof v === "boolean" ? v : null;
}

export function obj(p: Payload, key: string): Payload | null {
  const v = p[key];
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Payload) : null;
}

export function strArr(p: Payload, key: string): string[] {
  const v = p[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function isRecord(v: unknown): v is Payload {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

export function asPlanComponent(v: unknown): PlanComponent | null {
  if (!isRecord(v)) return null;
  if (typeof v.id !== "string" || typeof v.name !== "string") return null;
  return {
    id: v.id,
    name: v.name,
    description: typeof v.description === "string" ? v.description : "",
    files: Array.isArray(v.files) ? v.files.filter((f): f is string => typeof f === "string") : [],
  };
}

export function asPlanDelta(v: unknown): PlanDelta | null {
  if (!isRecord(v)) return null;
  const arr = (k: string) => (Array.isArray(v[k]) ? (v[k] as unknown[]).filter((x): x is string => typeof x === "string") : []);
  return {
    fromRevision: typeof v.fromRevision === "number" ? v.fromRevision : 0,
    toRevision: typeof v.toRevision === "number" ? v.toRevision : 0,
    affectedComponents: arr("affectedComponents"),
    addedComponents: arr("addedComponents"),
    removedComponents: arr("removedComponents"),
    rationale: typeof v.rationale === "string" ? v.rationale : "",
  };
}

export function asPlan(v: unknown): Plan | null {
  if (!isRecord(v)) return null;
  const components = Array.isArray(v.components)
    ? v.components.map(asPlanComponent).filter((c): c is PlanComponent => c !== null)
    : [];
  const design = isRecord(v.design) ? v.design : {};
  return {
    revision: typeof v.revision === "number" ? v.revision : 0,
    summary: typeof v.summary === "string" ? v.summary : "",
    audience: typeof v.audience === "string" ? v.audience : "",
    components,
    design: {
      palette: typeof design.palette === "string" ? design.palette : "",
      typography: typeof design.typography === "string" ? design.typography : "",
      tone: typeof design.tone === "string" ? design.tone : "",
    },
    delta: asPlanDelta(v.delta),
    createdAt: typeof v.createdAt === "number" ? v.createdAt : 0,
  };
}

const TASK_STATUSES = new Set(["queued", "running", "stale", "done", "failed", "superseded"]);
const ROLES = new Set(["architect", "builder", "reviewer"]);

export function asTask(v: unknown): Task | null {
  if (!isRecord(v)) return null;
  if (typeof v.id !== "string" || typeof v.title !== "string") return null;
  const role = typeof v.agentRole === "string" && ROLES.has(v.agentRole) ? (v.agentRole as Task["agentRole"]) : "builder";
  const status = typeof v.status === "string" && TASK_STATUSES.has(v.status) ? (v.status as Task["status"]) : "queued";
  return {
    id: v.id,
    workspaceId: typeof v.workspaceId === "string" ? v.workspaceId : "",
    agentRole: role,
    title: v.title,
    description: typeof v.description === "string" ? v.description : "",
    dependsOn: Array.isArray(v.dependsOn) ? v.dependsOn.filter((d): d is string => typeof d === "string") : [],
    baseRevision: typeof v.baseRevision === "number" ? v.baseRevision : 0,
    status,
    output: typeof v.output === "string" ? v.output : null,
    error: typeof v.error === "string" ? v.error : null,
    createdAt: typeof v.createdAt === "number" ? v.createdAt : 0,
    startedAt: typeof v.startedAt === "number" ? v.startedAt : null,
    finishedAt: typeof v.finishedAt === "number" ? v.finishedAt : null,
  };
}

export function asRequirement(v: unknown): Requirement | null {
  if (!isRecord(v)) return null;
  if (typeof v.text !== "string") return null;
  return {
    id: typeof v.id === "string" ? v.id : "",
    text: v.text,
    revision: typeof v.revision === "number" ? v.revision : 0,
    authorId: typeof v.authorId === "string" ? v.authorId : "",
    authorName: typeof v.authorName === "string" ? v.authorName : "",
    createdAt: typeof v.createdAt === "number" ? v.createdAt : 0,
  };
}

export interface ReviewCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export function asChecks(v: unknown): ReviewCheck[] {
  if (!Array.isArray(v)) return [];
  const out: ReviewCheck[] = [];
  for (const item of v) {
    if (!isRecord(item) || typeof item.name !== "string") continue;
    out.push({ name: item.name, ok: Boolean(item.ok), detail: typeof item.detail === "string" ? item.detail : "" });
  }
  return out;
}

export function asFiles(v: unknown): ArtifactFile[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((f) => (isRecord(f) && typeof f.path === "string" ? { path: f.path, content: typeof f.content === "string" ? f.content : "" } : null))
    .filter((f): f is ArtifactFile => f !== null);
}

export function asExecutor(v: unknown): ExecutorKind | null {
  return v === "freestyle" || v === "local" ? v : null;
}

/** Task id for a task.* event: payload.task.id, else payload.taskId. */
export function taskIdOf(p: Payload): string | null {
  const t = obj(p, "task");
  if (t && typeof t.id === "string") return t.id;
  return str(p, "taskId");
}
