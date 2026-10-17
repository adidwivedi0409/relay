// ─────────────────────────────────────────────────────────────────────────────
// Relay — shared domain contract. Every module (store, agents, executor, UI)
// imports from here. Keep this file the single source of truth.
// ─────────────────────────────────────────────────────────────────────────────

export type AgentRole = "architect" | "builder" | "reviewer";

export type AgentStatus =
  | "idle"
  | "thinking"   // model call in flight
  | "working"    // writing files / executing in sandbox
  | "waiting"    // blocked on another agent or human
  | "done"
  | "error";

export type TaskStatus =
  | "queued"
  | "running"
  | "stale"      // requirements moved past baseRevision while running
  | "done"
  | "failed"
  | "superseded"; // replaced by a newer task after a revision

export type BuildStatus =
  | "idle"
  | "provisioning"
  | "writing"
  | "building"
  | "live"
  | "failed";

export type ExecutorKind = "freestyle" | "local";

export interface Workspace {
  id: string;
  name: string;
  createdAt: number;
  /** Monotonically increasing. Bumped on every requirement change. */
  revision: number;
  /** Ordered list of requirements; each remembers the revision + author that introduced it. */
  requirements: Requirement[];
  /** Current architect plan (null until the architect has run once). */
  plan: Plan | null;
  /** Latest successfully built artifact, if any. Never replaced by a failed build. */
  artifact: Artifact | null;
  buildStatus: BuildStatus;
  buildError: string | null;
  executor: ExecutorKind;
  /** Opaque sandbox handle (Freestyle vmId etc). Server-only concern but harmless to expose. */
  sandboxId: string | null;
  /** Revision the orchestrator is currently building, or null when idle. */
  activeRevision: number | null;
  /** Revision the orchestrator has queued because a change arrived mid-build. */
  pendingRevision: number | null;
}

export interface Requirement {
  id: string;
  text: string;
  revision: number;
  authorId: string;
  authorName: string;
  createdAt: number;
}

export interface Participant {
  id: string;
  workspaceId: string;
  name: string;
  color: string;      // hex, assigned deterministically
  lastSeen: number;   // epoch ms; online if within PRESENCE_TTL_MS
  joinedAt: number;
}

export interface Agent {
  id: string;
  workspaceId: string;
  role: AgentRole;
  name: string;        // "Architect" | "Builder" | "Reviewer"
  provider: string;    // e.g. "wally" | "anthropic" | "openai"
  model: string;       // actual model id used
  status: AgentStatus;
  statusDetail: string | null;  // one-line human-readable, e.g. "Rewriting hero for graduates"
  currentTaskId: string | null;
  updatedAt: number;
}

export interface Task {
  id: string;
  workspaceId: string;
  agentRole: AgentRole;
  title: string;
  description: string;
  dependsOn: string[];
  /** Revision of the requirements this task was planned against. */
  baseRevision: number;
  status: TaskStatus;
  output: string | null;      // short summary of result
  error: string | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface PlanComponent {
  id: string;        // slug, stable across revisions when the component persists
  name: string;
  description: string;
  files: string[];   // files this component owns
}

export interface Plan {
  revision: number;
  summary: string;
  audience: string;
  components: PlanComponent[];
  /** Design tokens the builder must respect so revisions stay coherent. */
  design: { palette: string; typography: string; tone: string };
  /** Populated on revisions: what changed vs the previous plan. */
  delta: PlanDelta | null;
  createdAt: number;
}

export interface PlanDelta {
  fromRevision: number;
  toRevision: number;
  affectedComponents: string[];   // component ids
  addedComponents: string[];
  removedComponents: string[];
  rationale: string;
}

export interface ArtifactFile {
  path: string;      // relative, e.g. "index.html"
  content: string;
}

export interface Artifact {
  id: string;
  workspaceId: string;
  revision: number;
  files: ArtifactFile[];
  previewUrl: string;       // absolute URL humans can open
  executor: ExecutorKind;
  sandboxId: string | null;
  verification: "pending" | "passed" | "warnings" | "failed";
  verificationNotes: string | null;
  changedFiles: string[];   // vs previous artifact ([] for first)
  builtAt: number;
}

// ── Events ───────────────────────────────────────────────────────────────────
// The event log is the collaboration timeline. Every entry corresponds to a
// real state transition. Never emit a "done" before the operation succeeded.

export type EventType =
  | "workspace.created"
  | "participant.joined"
  | "participant.left"
  | "human.message"            // free-form chat from a human
  | "requirement.added"        // bumps revision
  | "revision.cascade"         // orchestrator detected in-flight work is now stale
  | "agent.status"             // agent status changed (payload: status, detail)
  | "agent.message"            // agent → room (reasoning summary, questions)
  | "agent.handoff"            // agent → agent structured message
  | "task.created"
  | "task.started"
  | "task.stale"
  | "task.completed"
  | "task.failed"
  | "plan.created"
  | "plan.revised"
  | "build.started"
  | "build.succeeded"
  | "build.failed"
  | "review.completed"
  | "error";

export interface Actor {
  kind: "human" | "agent" | "system";
  id: string;
  name: string;
  role?: AgentRole;
  color?: string;
}

export interface RelayEvent {
  id: string;
  workspaceId: string;
  seq: number;              // per-workspace monotonic sequence for SSE resume
  type: EventType;
  actor: Actor;
  /** Human-readable one-liner for the timeline. */
  message: string;
  /** Structured details. Shape depends on type; UI renders known keys. */
  payload: Record<string, unknown>;
  revision: number;         // workspace revision at the time of the event
  createdAt: number;
}

// ── Snapshot sent to clients ─────────────────────────────────────────────────

export interface WorkspaceSnapshot {
  workspace: Workspace;
  participants: Participant[];
  agents: Agent[];
  tasks: Task[];
  events: RelayEvent[];
  /** Server time so clients can compute presence without clock skew. */
  now: number;
}

/** SSE wire format. `snapshot` on connect, then `delta` frames. */
export type SseFrame =
  | { kind: "snapshot"; snapshot: WorkspaceSnapshot }
  | { kind: "event"; event: RelayEvent }
  | { kind: "workspace"; workspace: Workspace }
  | { kind: "agent"; agent: Agent }
  | { kind: "task"; task: Task }
  | { kind: "participants"; participants: Participant[]; now: number }
  | { kind: "ping"; now: number };

export const PRESENCE_TTL_MS = 15_000;
export const AGENT_COLORS: Record<AgentRole, string> = {
  architect: "#D9A86C", // warm amber
  builder: "#7FB3A5",   // sage
  reviewer: "#A48ACB",  // muted violet
};
export const HUMAN_COLORS = ["#E8B4A2", "#9CC2E5", "#C5D86D", "#F2C14E", "#B8A1D9", "#8FD3C7"];

export const AGENT_NAMES: Record<AgentRole, string> = {
  architect: "Architect",
  builder: "Builder",
  reviewer: "Reviewer",
};
