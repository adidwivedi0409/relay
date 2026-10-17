// ─────────────────────────────────────────────────────────────────────────────
// Relay — orchestrator. One build pipeline per workspace at a time, with the
// revision cascade: a requirement that lands mid-build marks in-flight work
// stale, kicks off an impact assessment by the Architect right away, and the
// pipeline abandons its current stage at the next boundary and restarts on the
// new revision using that plan. Every event here corresponds to something that
// actually happened; success events are emitted only after the operation
// resolved.
// ─────────────────────────────────────────────────────────────────────────────

import { nanoid } from "nanoid";
import { store } from "@/lib/store";
import { executor, type DeployExisting, type DeployProgress, type DeployResult } from "@/lib/executor";
import { errorMessage, type LlmMeta } from "@/lib/llm";
import { planWithMeta } from "@/lib/agents/architect";
import { buildWithMeta } from "@/lib/agents/builder";
import { reviewWithMeta, type ReviewResult } from "@/lib/agents/reviewer";
import {
  AGENT_COLORS,
  AGENT_NAMES,
  type Actor,
  type Agent,
  type AgentRole,
  type AgentStatus,
  type Artifact,
  type ArtifactFile,
  type EventType,
  type ExecutorKind,
  type Plan,
  type Requirement,
  type Task,
  type Workspace,
} from "@/lib/types";

const TASK_TIMEOUT_MS = 300_000;
const MAX_FIX_PASSES = 1;
const MAX_LOOP_ITERATIONS = 25;

// ── per-workspace state (survives HMR) ─────────────────────────────────────

interface ImpactJob {
  /** Revision this assessment plans for. */
  revision: number;
  promise: Promise<{ plan: Plan; meta: LlmMeta }>;
}

interface WsState {
  /** The mutex: resolves when the current run loop exits. */
  active: Promise<void> | null;
  /** Impact assessment started by a mid-build cascade, consumed by the restarted pipeline. */
  impact: ImpactJob | null;
}

const g = globalThis as unknown as { __relayOrchestrator?: Map<string, WsState> };
const states: Map<string, WsState> = g.__relayOrchestrator ?? (g.__relayOrchestrator = new Map());

function stateFor(wsId: string): WsState {
  let s = states.get(wsId);
  if (!s) {
    s = { active: null, impact: null };
    states.set(wsId, s);
  }
  return s;
}

class SupersededError extends Error {
  constructor(public readonly byRevision: number) {
    super(`superseded by r${byRevision}`);
    this.name = "SupersededError";
  }
}

// ── injectable seam (offline simulations stub the agents + executor) ───────

interface Deps {
  plan: typeof planWithMeta;
  build: typeof buildWithMeta;
  review: typeof reviewWithMeta;
  deploy: (wsId: string, files: ArtifactFile[], revision: number, onProgress: DeployProgress, existing?: DeployExisting) => Promise<DeployResult>;
  executorKind: () => ExecutorKind;
  taskTimeoutMs: number;
}

const deps: Deps = {
  plan: planWithMeta,
  build: buildWithMeta,
  review: reviewWithMeta,
  deploy: (wsId, files, revision, onProgress, existing) => executor.deploy(wsId, files, revision, onProgress, existing),
  executorKind: () => executor.kind(),
  taskTimeoutMs: TASK_TIMEOUT_MS,
};

/** Test-only: replace agents/executor with doubles (scripts/sim-cascade.ts). No-op in production. */
export function __setTestDoubles(overrides: Partial<Deps>): void {
  if (process.env.NODE_ENV === "production") return;
  Object.assign(deps, overrides);
}

// ── public API ─────────────────────────────────────────────────────────────

export const orchestrator = {
  /**
   * Called by the messages route after store.addRequirement + requirement.added.
   * Returns immediately; the pipeline runs in the background and reports through events.
   */
  async onRequirementAdded(wsId: string, requirement: Requirement): Promise<void> {
    const ws = store.getWorkspace(wsId);
    if (!ws) return;
    const state = stateFor(wsId);

    if (!state.active) {
      startLoop(wsId, state);
      return;
    }

    cascade(wsId, state, ws, requirement);
  },
};

function startLoop(wsId: string, state: WsState): void {
  state.active = runLoop(wsId)
    .catch((err) => {
      console.error(`[orchestrator] ${wsId}: run loop crashed: ${errorMessage(err)}`);
      safeEmit(wsId, "error", SYSTEM, `Orchestrator stopped: ${errorMessage(err)}`, { error: errorMessage(err) });
    })
    .finally(() => {
      state.active = null;
      const ws = store.getWorkspace(wsId);
      if (!ws) return;
      // A requirement may have landed in the gap between the loop's last check and here.
      if (ws.pendingRevision !== null || (ws.activeRevision !== null && ws.revision > ws.activeRevision)) {
        startLoop(wsId, state);
        return;
      }
      // Crash path: the loop died outside runPipeline; leave nothing mid-flight.
      if (ws.activeRevision !== null) finishRun(wsId, state, ws.activeRevision, "failed");
    });
}

/** A requirement landed while a pipeline is running: mark stale, assess impact now. */
function cascade(wsId: string, state: WsState, ws: Workspace, requirement: Requirement): void {
  const to = ws.revision;
  const from = ws.activeRevision ?? ws.pendingRevision ?? to - 1;
  store.updateWorkspace(wsId, { pendingRevision: to });

  const running = store.getTasks(wsId).filter((t) => t.status === "running" || t.status === "queued");
  const staleTitles = running.map((t) => `${AGENT_NAMES[t.agentRole]}: ${t.title}`);
  safeEmit(
    wsId,
    "revision.cascade",
    SYSTEM,
    `Requirement changed mid-build (r${from} → r${to}). Marking in-flight work stale.`,
    { fromRevision: from, toRevision: to, requirementId: requirement.id, staleTaskIds: running.map((t) => t.id), staleTasks: staleTitles },
    to,
  );
  for (const t of running) {
    const stale = store.updateTask(t.id, { status: "stale" });
    safeEmit(wsId, "task.stale", agentActor(wsId, t.agentRole), `${t.title} is now stale (planned against r${t.baseRevision}, requirements are at r${to})`, { task: stale, toRevision: to }, to);
  }

  // Start the impact assessment immediately, concurrently with whatever stage is still finishing.
  const job: ImpactJob = { revision: to, promise: Promise.resolve() as unknown as Promise<{ plan: Plan; meta: LlmMeta }> };
  job.promise = runImpactAssessment(wsId, state, job);
  state.impact = job;
  job.promise.catch(() => {
    /* consumed (or logged) by the pipeline; never unhandled */
  });
}

async function runImpactAssessment(wsId: string, state: WsState, job: ImpactJob): Promise<{ plan: Plan; meta: LlmMeta }> {
  const target = job.revision;
  const ws = must(store.getWorkspace(wsId));
  const previousPlan = ws.plan;
  const requirements = ws.requirements.filter((r) => r.revision <= target);
  setStatus(wsId, "architect", "thinking", `Assessing impact of r${target}`, target);

  const { task, result } = await runTask(
    wsId,
    { role: "architect", title: `Assess impact of r${target}`, description: latestText(requirements), baseRevision: target },
    () => deps.plan({ workspace: ws, previousPlan, requirements }),
    (r) => r.plan.delta?.rationale ?? r.plan.summary,
  );

  if (state.impact !== job) {
    // A newer requirement arrived while this assessment ran; its own assessment supersedes this one.
    const by = state.impact?.revision ?? store.getWorkspace(wsId)?.revision ?? target;
    supersedeTask(wsId, task, by);
    throw new SupersededError(by);
  }
  commitPlan(wsId, target, result.plan, result.meta, previousPlan);
  return result;
}

// ── run loop + pipeline ────────────────────────────────────────────────────

async function runLoop(wsId: string): Promise<void> {
  const state = stateFor(wsId);
  for (let i = 0; i < MAX_LOOP_ITERATIONS; i++) {
    const ws = store.getWorkspace(wsId);
    if (!ws) return;
    // Always build the newest revision. pendingRevision is only the signal that a
    // change landed mid-build; a value persisted by an older process can lag revision.
    const target = ws.revision;
    store.updateWorkspace(wsId, { activeRevision: target, pendingRevision: null });

    let outcome: Outcome;
    try {
      outcome = await runPipeline(wsId, target);
    } catch (err) {
      if (err instanceof SupersededError) {
        outcome = "superseded";
      } else {
        outcome = "failed";
        console.error(`[orchestrator] ${wsId} r${target}: pipeline failed: ${errorMessage(err)}`);
      }
    }
    console.log(`[orchestrator] ${wsId} r${target}: ${outcome}`);

    const after = store.getWorkspace(wsId);
    if (after && (after.pendingRevision !== null || after.revision > target)) continue;
    finishRun(wsId, state, target, outcome);
    return;
  }
  console.warn(`[orchestrator] ${wsId}: stopped after ${MAX_LOOP_ITERATIONS} consecutive revisions`);
  finishRun(wsId, state, store.getWorkspace(wsId)?.revision ?? 0, "failed");
}

type Outcome = "completed" | "superseded" | "failed";

const MID_FLIGHT: ReadonlySet<AgentStatus> = new Set<AgentStatus>(["thinking", "working", "waiting"]);

/** End of a run: the workspace is idle again and no agent is left thinking/working/waiting. */
function finishRun(wsId: string, state: WsState, target: number, outcome: Outcome): void {
  if (state.impact && state.impact.revision <= target) state.impact = null;
  try {
    store.updateWorkspace(wsId, { activeRevision: null });
  } catch (err) {
    console.error(`[orchestrator] ${wsId}: could not clear activeRevision: ${errorMessage(err)}`);
  }
  finalizeAgents(wsId, target, outcome);
}

function finalizeAgents(wsId: string, target: number, outcome: Outcome): void {
  let agents: Agent[];
  try {
    agents = store.getAgents(wsId);
  } catch {
    return;
  }
  for (const agent of agents) {
    if (!MID_FLIGHT.has(agent.status)) continue;
    const detail =
      outcome === "failed"
        ? `Stopped: the r${target} pipeline failed before ${AGENT_NAMES[agent.role]} finished`
        : outcome === "superseded"
          ? `r${target} superseded`
          : `Idle after r${target}`;
    setStatus(wsId, agent.role, "idle", detail, target, { currentTaskId: null });
  }
}

function pendingRevision(wsId: string): number | null {
  return store.getWorkspace(wsId)?.pendingRevision ?? null;
}

async function runPipeline(wsId: string, target: number): Promise<Outcome> {
  const state = stateFor(wsId);
  const ws = must(store.getWorkspace(wsId));
  const requirements = ws.requirements.filter((r) => r.revision <= target);
  const previousPlan = ws.plan;
  const previousArtifact = ws.artifact;

  // ── Stage A: plan ───────────────────────────────────────────────────────
  let plan: Plan;
  if (state.impact && state.impact.revision !== target) {
    // Left over from a revision that never ran; its own completion handler supersedes it.
    state.impact = null;
  }
  const impact = state.impact;
  if (impact) {
    try {
      plan = (await impact.promise).plan;
    } catch (err) {
      if (err instanceof SupersededError) return "superseded";
      console.warn(`[orchestrator] ${wsId} r${target}: impact assessment failed (${errorMessage(err)}); planning again`);
      plan = await planStage(wsId, target, requirements, previousPlan);
    } finally {
      if (state.impact === impact) state.impact = null;
    }
  } else {
    plan = await planStage(wsId, target, requirements, previousPlan);
  }

  {
    const pending = pendingRevision(wsId);
    if (pending !== null) return "superseded";
  }

  const componentNames = plan.components.map((c) => c.name);
  const delta = plan.delta;
  safeEmit(
    wsId,
    "agent.handoff",
    agentActor(wsId, "architect"),
    delta
      ? `Architect → Builder: rebuild ${delta.affectedComponents.length} of ${plan.components.length} components for r${target}`
      : `Architect → Builder: build ${plan.components.length} components for r${target}`,
    {
      from: "architect",
      to: "builder",
      summary: delta ? delta.rationale : plan.summary,
      items: delta
        ? plan.components.filter((c) => delta.affectedComponents.includes(c.id)).map((c) => c.name)
        : componentNames,
      affectedComponents: delta?.affectedComponents ?? plan.components.map((c) => c.id),
      addedComponents: delta?.addedComponents ?? [],
      removedComponents: delta?.removedComponents ?? [],
    },
    target,
  );
  setStatus(wsId, "architect", "done", `Plan r${target} handed to Builder (${plan.components.length} components)`, target, { currentTaskId: null });

  // ── Stages B + C with a bounded fix loop ────────────────────────────────
  let previousFiles: ArtifactFile[] | null = previousArtifact?.files ?? null;
  let reviewNotes: string | null = null;
  let lastReview: ReviewResult | null = null;

  for (let pass = 0; pass <= MAX_FIX_PASSES; pass++) {
    const isFix = pass > 0;
    setStatus(wsId, "reviewer", "waiting", `Waiting for a live preview of r${target}`, target);

    // B1. Builder writes the site.
    // A delta only makes sense when there are previous files to preserve; otherwise it is a full build.
    const built = await builderStage(wsId, target, plan, requirements, previousFiles, isFix || !previousFiles ? null : delta, reviewNotes, pass);

    {
      const pending = pendingRevision(wsId);
      if (pending !== null) {
        supersedeTask(wsId, built.task, pending);
        setStatus(wsId, "builder", "idle", `r${target} build discarded; requirements moved to r${pending}`, target, { currentTaskId: null });
        return "superseded";
      }
    }

    const changedFiles = diffFiles(previousFiles ?? [], built.files);
    safeEmit(
      wsId,
      "agent.handoff",
      agentActor(wsId, "builder"),
      `Builder → Reviewer: ${built.files.length} files for r${target}${changedFiles.length ? ` (${changedFiles.length} changed)` : ""}`,
      { from: "builder", to: "reviewer", summary: built.summary, items: built.files.map((f) => f.path), changedFiles },
      target,
    );

    // B2. Deploy to the executor.
    const deployed = await deployStage(wsId, target, built.files, changedFiles, pass);
    if (!deployed) return "failed";
    const { artifact, httpStatus } = deployed;

    {
      const pending = pendingRevision(wsId);
      if (pending !== null) {
        // The artifact is live and stored; only the review is skipped.
        setStatus(wsId, "reviewer", "idle", `Skipped review of r${target}; requirements moved to r${pending}`, target, { currentTaskId: null });
        return "superseded";
      }
    }

    // C. Review.
    const reviewed = await reviewerStage(wsId, target, plan, requirements, artifact, httpStatus, pass);
    if (!reviewed) return "failed";
    lastReview = reviewed;

    const needsFix = reviewed.verdict === "failed" && reviewed.blocking.length > 0;
    if (needsFix && pass < MAX_FIX_PASSES && pendingRevision(wsId) === null) {
      reviewNotes = [`Verdict: failed.`, `Notes: ${reviewed.notes}`, `Blocking:`, ...reviewed.blocking.map((b, i) => `${i + 1}. ${b}`)].join("\n");
      previousFiles = artifact.files;
      safeEmit(
        wsId,
        "agent.handoff",
        agentActor(wsId, "reviewer"),
        `Reviewer → Builder: ${reviewed.blocking.length} blocking item${reviewed.blocking.length === 1 ? "" : "s"} to fix in r${target}`,
        { from: "reviewer", to: "builder", summary: reviewed.notes, items: reviewed.blocking },
        target,
      );
      continue;
    }
    break;
  }

  // ── Wrap up ─────────────────────────────────────────────────────────────
  const finalWs = store.getWorkspace(wsId);
  const host = finalWs?.artifact ? hostOf(finalWs.artifact.previewUrl) : null;
  setStatus(wsId, "builder", "done", host ? `r${target} live at ${host}` : `r${target} built`, target, { currentTaskId: null });
  if (lastReview) {
    const verdictText = lastReview.verdict === "passed" ? "passed review" : lastReview.verdict === "warnings" ? "passed with warnings" : `failed review (${lastReview.blocking.length} blocking)`;
    setStatus(wsId, "reviewer", "done", `r${target} ${verdictText}`, target, { currentTaskId: null });
  }
  return "completed";
}

// ── stages ─────────────────────────────────────────────────────────────────

async function planStage(wsId: string, target: number, requirements: Requirement[], previousPlan: Plan | null): Promise<Plan> {
  const ws = must(store.getWorkspace(wsId));
  const latest = latestText(requirements);
  setStatus(wsId, "architect", "thinking", previousPlan ? `Revising plan for r${target}` : `Planning r${target}: ${truncate(latest, 70)}`, target);
  const { task, result } = await runTask(
    wsId,
    { role: "architect", title: previousPlan ? `Revise plan for r${target}` : `Plan r${target}`, description: latest, baseRevision: target },
    () => deps.plan({ workspace: ws, previousPlan, requirements }),
    (r) => r.plan.delta?.rationale ?? r.plan.summary,
  );
  const pending = pendingRevision(wsId);
  if (pending !== null) {
    supersedeTask(wsId, task, pending);
    throw new SupersededError(pending);
  }
  commitPlan(wsId, target, result.plan, result.meta, previousPlan);
  return result.plan;
}

function commitPlan(wsId: string, target: number, plan: Plan, meta: LlmMeta, previousPlan: Plan | null): void {
  const current = store.getWorkspace(wsId);
  if (current?.plan && current.plan.revision > target) {
    console.warn(`[orchestrator] ${wsId}: not writing plan r${target} over the newer plan r${current.plan.revision}`);
    return;
  }
  store.updateWorkspace(wsId, { plan });
  recordModel(wsId, "architect", meta);
  const actor = agentActor(wsId, "architect");
  const revised = previousPlan !== null;
  safeEmit(
    wsId,
    revised ? "plan.revised" : "plan.created",
    actor,
    revised
      ? `Plan revised for r${target}: ${plan.delta?.affectedComponents.length ?? 0} affected, ${plan.delta?.addedComponents.length ?? 0} added, ${plan.delta?.removedComponents.length ?? 0} removed`
      : `Plan for r${target}: ${plan.components.length} components for ${plan.audience}`,
    { plan },
    target,
  );
  safeEmit(wsId, "agent.message", actor, plan.delta?.rationale ?? plan.summary, { kind: "plan", revision: target, ...modelPayload(meta) }, target);
  setStatus(wsId, "architect", "done", `Plan r${target} ready (${plan.components.length} components)`, target, { currentTaskId: null });
}

interface BuiltStage {
  task: Task;
  files: ArtifactFile[];
  summary: string;
}

async function builderStage(
  wsId: string,
  target: number,
  plan: Plan,
  requirements: Requirement[],
  previousFiles: ArtifactFile[] | null,
  delta: Plan["delta"],
  reviewNotes: string | null,
  pass: number,
): Promise<BuiltStage> {
  const isFix = pass > 0;
  const affected = delta ? plan.components.filter((c) => delta.affectedComponents.includes(c.id)).map((c) => c.name) : [];
  const detail = isFix
    ? `Fixing review findings for r${target}`
    : delta
      ? `Rewriting ${affected.length ? affected.slice(0, 3).join(", ") : "affected sections"} for r${target}`
      : `Writing index.html, styles.css, app.js for r${target}`;
  setStatus(wsId, "builder", "thinking", detail, target);

  const { task, result } = await runTask(
    wsId,
    {
      role: "builder",
      title: isFix ? `Fix r${target} after review` : delta ? `Rebuild affected components for r${target}` : `Build site for r${target}`,
      description: isFix ? (reviewNotes ?? "") : delta ? delta.rationale : plan.summary,
      baseRevision: target,
    },
    () => deps.build({ plan, requirements, previousFiles, delta, reviewNotes }),
    (r) => r.summary,
  );
  recordModel(wsId, "builder", result.meta);
  safeEmit(wsId, "agent.message", agentActor(wsId, "builder"), result.summary, { kind: "build", revision: target, files: result.files.map((f) => f.path), ...modelPayload(result.meta) }, target);
  return { task, files: result.files, summary: result.summary };
}

interface Deployed {
  artifact: Artifact;
  /** What the executor observed when it fetched the preview; null when it could not check. */
  httpStatus: number | null;
}

async function deployStage(wsId: string, target: number, files: ArtifactFile[], changedFiles: string[], pass: number): Promise<Deployed | null> {
  const ws = must(store.getWorkspace(wsId));
  const kind = deps.executorKind();
  const executorLabel = kind === "freestyle" ? "Freestyle VM" : "local host";
  const builder = agentActor(wsId, "builder");
  const previousArtifact = ws.artifact;

  setStatus(wsId, "builder", "working", `Deploying r${target} to ${executorLabel}`, target);
  safeEmit(wsId, "build.started", builder, `Deploying r${target} to ${executorLabel} (${files.length} files)`, { revision: target, executor: kind, files: files.map((f) => f.path), pass }, target);

  const started = Date.now();
  try {
    const { task, result } = await runTask(
      wsId,
      { role: "builder", title: `Deploy r${target} to ${executorLabel}`, description: `${files.length} files: ${files.map((f) => f.path).join(", ")}`, baseRevision: target },
      (task) =>
        deps.deploy(
          wsId,
          files,
          target,
          (status, progressDetail) => {
            // A deploy that already timed out or was superseded must not keep
            // repainting the workspace while a newer revision is building.
            const live = store.getTask(task.id)?.status;
            if (live !== "running" && live !== "stale") return;
            store.updateWorkspace(wsId, { buildStatus: status });
            store.setAgent(wsId, "builder", { statusDetail: progressDetail || `${status} r${target}` });
          },
          // Lets the executor reuse this workspace's VM by id after a server restart
          // (it also falls back to the slug lookup when this is null or stale).
          { sandboxId: ws.sandboxId },
        ),
      (r) => `${r.previewUrl}${r.httpStatus !== null ? ` (HTTP ${r.httpStatus})` : ""}`,
    );

    const verifiedOk = result.httpStatus === 200;
    const unverifiedButServed = result.httpStatus === null && typeof result.previewUrl === "string" && result.previewUrl.length > 0;
    if (!verifiedOk && !unverifiedButServed) {
      throw new Error(`Preview at ${result.previewUrl || "(no url)"} returned HTTP ${result.httpStatus ?? "unknown"}`);
    }
    if (unverifiedButServed) {
      console.warn(`[orchestrator] ${wsId} r${target}: executor returned no HTTP status; accepting ${result.previewUrl} without a reachability check`);
    }

    const newest = store.getWorkspace(wsId)?.artifact;
    if (newest && newest.revision > target) {
      // Never let an older deploy replace a newer live artifact.
      supersedeTask(wsId, task, newest.revision);
      throw new SupersededError(newest.revision);
    }

    const ms = Date.now() - started;
    const artifact: Artifact = {
      id: nanoid(12),
      workspaceId: wsId,
      revision: target,
      files,
      previewUrl: result.previewUrl,
      executor: result.executor,
      sandboxId: result.sandboxId,
      verification: "pending",
      verificationNotes: null,
      changedFiles: previousArtifact ? diffFiles(previousArtifact.files, files) : [],
      builtAt: Date.now(),
    };
    store.updateWorkspace(wsId, { artifact, buildStatus: "live", buildError: null, sandboxId: result.sandboxId ?? ws.sandboxId });
    if (task.status === "stale") {
      // A cascade marked this deploy stale while files were being written, but the
      // deploy did finish and the artifact is live; close the task truthfully.
      const done = store.updateTask(task.id, { status: "done" });
      safeEmit(wsId, "task.completed", builder, `Deploy of r${target} finished after being marked stale; artifact kept until the next build succeeds`, { task: done }, target);
    }
    safeEmit(
      wsId,
      "build.succeeded",
      builder,
      `r${target} is live on ${executorLabel}${pass > 0 ? " (after fix pass)" : ""} in ${(ms / 1000).toFixed(1)}s`,
      {
        previewUrl: result.previewUrl,
        revision: target,
        changedFiles: artifact.changedFiles,
        executor: result.executor,
        sandboxId: result.sandboxId,
        ms,
        httpStatus: result.httpStatus,
        verified: verifiedOk,
        logs: result.logs.slice(-6),
        stagedChanges: changedFiles,
      },
      target,
    );
    return { artifact, httpStatus: result.httpStatus };
  } catch (err) {
    if (err instanceof SupersededError) throw err;
    const message = errorMessage(err);
    store.updateWorkspace(wsId, { buildStatus: "failed", buildError: message });
    safeEmit(wsId, "build.failed", builder, `Build of r${target} failed: ${message}`, { error: message, revision: target, executor: kind, ms: Date.now() - started }, target);
    store.setAgent(wsId, "builder", { status: "error", statusDetail: truncate(message, 140), currentTaskId: null });
    setStatus(wsId, "reviewer", "idle", `No build to review for r${target}`, target, { currentTaskId: null });
    return null;
  }
}

async function reviewerStage(
  wsId: string,
  target: number,
  plan: Plan,
  requirements: Requirement[],
  artifact: Artifact,
  httpStatus: number | null,
  pass: number,
): Promise<ReviewResult | null> {
  const reviewer = agentActor(wsId, "reviewer");
  setStatus(wsId, "reviewer", "thinking", `Reviewing r${target} against ${requirements.length} requirement${requirements.length === 1 ? "" : "s"}`, target);
  try {
    const { task, result } = await runTask(
      wsId,
      { role: "reviewer", title: pass > 0 ? `Re-review r${target} after fix` : `Review r${target}`, description: `Verify ${artifact.files.length} files at ${artifact.previewUrl}`, baseRevision: target },
      () => deps.review({ plan, requirements, files: artifact.files, previewUrl: artifact.previewUrl, httpStatus }),
      (r) => `${r.review.verdict}: ${truncate(r.review.notes, 120)}`,
    );
    const { review, meta } = result;
    recordModel(wsId, "reviewer", meta);
    if (task.status === "stale") {
      // A cascade marked this review stale, but its verdict still describes the live r${target} artifact.
      const done = store.updateTask(task.id, { status: "done" });
      safeEmit(wsId, "task.completed", reviewer, `Review of r${target} finished after being marked stale; the verdict applies to the live r${target} artifact`, { task: done }, target);
    }

    const current = store.getWorkspace(wsId);
    if (current?.artifact && current.artifact.id === artifact.id) {
      store.updateWorkspace(wsId, { artifact: { ...current.artifact, verification: review.verdict, verificationNotes: review.notes } });
    }
    const failedChecks = review.checks.filter((c) => !c.ok).length;
    safeEmit(
      wsId,
      "review.completed",
      reviewer,
      `Review of r${target}: ${review.verdict}${failedChecks ? ` (${failedChecks} of ${review.checks.length} checks not ok)` : ` (${review.checks.length} checks ok)`}`,
      { verdict: review.verdict, checks: review.checks, notes: review.notes, blocking: review.blocking, revision: target, pass },
      target,
    );
    safeEmit(wsId, "agent.message", reviewer, review.notes, { kind: "review", revision: target, verdict: review.verdict, ...modelPayload(meta) }, target);
    return review;
  } catch {
    // runTask already recorded the failure (task.failed + error event + agent error status).
    return null;
  }
}

// ── task lifecycle ─────────────────────────────────────────────────────────

interface TaskSpec {
  role: AgentRole;
  title: string;
  description: string;
  baseRevision: number;
  dependsOn?: string[];
}

/**
 * Runs one unit of agent work as a Task with the full event trail and a hard
 * timeout. On success the task is marked done unless a cascade marked it stale
 * meanwhile (the caller then decides whether to supersede it or keep its result).
 * On failure: task.failed + error event + agent "error" status, then rethrows.
 */
async function runTask<T>(wsId: string, spec: TaskSpec, fn: (task: Task) => Promise<T>, summarize: (result: T) => string): Promise<{ task: Task; result: T }> {
  const actor = agentActor(wsId, spec.role);
  let task = store.createTask({
    workspaceId: wsId,
    agentRole: spec.role,
    title: spec.title,
    description: spec.description,
    dependsOn: spec.dependsOn ?? [],
    baseRevision: spec.baseRevision,
    status: "queued",
  });
  safeEmit(wsId, "task.created", actor, `${AGENT_NAMES[spec.role]} queued: ${spec.title}`, { task }, spec.baseRevision);

  task = store.updateTask(task.id, { status: "running", startedAt: Date.now() });
  store.setAgent(wsId, spec.role, { currentTaskId: task.id });
  safeEmit(wsId, "task.started", actor, `${AGENT_NAMES[spec.role]} started: ${spec.title}`, { task }, spec.baseRevision);

  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${deps.taskTimeoutMs / 1000}s: ${spec.title}`)), deps.taskTimeoutMs);
  });

  try {
    const result = await Promise.race([fn(task), timeout]);
    const output = truncate(summarize(result), 400);
    const fresh = store.getTask(task.id) ?? task;
    if (fresh.status === "stale") {
      task = store.updateTask(task.id, { output, finishedAt: Date.now() });
    } else {
      task = store.updateTask(task.id, { status: "done", output, finishedAt: Date.now() });
      safeEmit(wsId, "task.completed", actor, `${AGENT_NAMES[spec.role]} finished: ${spec.title}`, { task }, spec.baseRevision);
    }
    return { task, result };
  } catch (err) {
    const message = errorMessage(err);
    task = store.updateTask(task.id, { status: "failed", error: message, finishedAt: Date.now() });
    safeEmit(wsId, "task.failed", actor, `${AGENT_NAMES[spec.role]} failed: ${spec.title} — ${truncate(message, 160)}`, { task, error: message }, spec.baseRevision);
    store.setAgent(wsId, spec.role, { status: "error", statusDetail: truncate(message, 140), currentTaskId: null });
    safeEmit(wsId, "error", actor, `${AGENT_NAMES[spec.role]}: ${message}`, { stage: spec.title, error: message, taskId: task.id }, spec.baseRevision);
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** A finished-but-stale task whose result is being thrown away because a newer revision took over. */
function supersedeTask(wsId: string, task: Task, byRevision: number): void {
  const updated = store.updateTask(task.id, { status: "superseded", finishedAt: task.finishedAt ?? Date.now() });
  // EventType has no task.superseded; the UI renders task.* rows from payload.task.status.
  safeEmit(wsId, "task.stale", agentActor(wsId, task.agentRole), `${task.title} superseded by r${byRevision}; its output was discarded`, { task: updated, superseded: true, toRevision: byRevision }, task.baseRevision);
}

// ── event / status helpers ─────────────────────────────────────────────────

const SYSTEM: Actor = { kind: "system", id: "system", name: "Relay" };

function agentActor(wsId: string, role: AgentRole): Actor {
  let id = `agent:${role}`;
  try {
    id = store.getAgent(wsId, role).id;
  } catch {
    /* agents are created with the workspace; fall back to a stable id */
  }
  return { kind: "agent", id, name: AGENT_NAMES[role], role, color: AGENT_COLORS[role] };
}

function safeEmit(wsId: string, type: EventType, actor: Actor, message: string, payload: Record<string, unknown>, revision?: number): void {
  try {
    store.emit(wsId, { type, actor, message, payload, ...(revision !== undefined ? { revision } : {}) });
  } catch (err) {
    console.error(`[orchestrator] ${wsId}: failed to emit ${type}: ${errorMessage(err)}`);
  }
}

function setStatus(wsId: string, role: AgentRole, status: AgentStatus, detail: string, revision: number, extra: Partial<Agent> = {}): void {
  try {
    store.setAgent(wsId, role, { status, statusDetail: detail, ...extra });
  } catch (err) {
    console.error(`[orchestrator] ${wsId}: failed to set ${role} status: ${errorMessage(err)}`);
    return;
  }
  safeEmit(wsId, "agent.status", agentActor(wsId, role), `${AGENT_NAMES[role]} ${status}: ${detail}`, { status, detail }, revision);
}

/** Keep the agent card honest about which provider/model actually answered (fallbacks included). */
function recordModel(wsId: string, role: AgentRole, meta: LlmMeta): void {
  try {
    const agent = store.getAgent(wsId, role);
    if (agent.provider !== meta.provider || agent.model !== meta.model) {
      store.setAgent(wsId, role, { provider: meta.provider, model: meta.model });
    }
  } catch {
    /* agent cards are a courtesy; the pipeline does not depend on them */
  }
}

function modelPayload(meta: LlmMeta): Record<string, unknown> {
  return { provider: meta.provider, model: meta.model, ms: meta.ms, usage: meta.usage ?? null };
}

// ── small utilities ────────────────────────────────────────────────────────

function diffFiles(previous: ArtifactFile[], next: ArtifactFile[]): string[] {
  const before = new Map(previous.map((f) => [f.path, f.content]));
  const changed: string[] = [];
  for (const f of next) {
    if (before.get(f.path) !== f.content) changed.push(f.path);
  }
  const nextPaths = new Set(next.map((f) => f.path));
  for (const p of before.keys()) if (!nextPaths.has(p)) changed.push(p);
  return changed;
}

function latestText(requirements: Requirement[]): string {
  if (requirements.length === 0) return "";
  return requirements.reduce((a, b) => (b.revision > a.revision || (b.revision === a.revision && b.createdAt > a.createdAt) ? b : a)).text;
}

function truncate(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("workspace disappeared mid-pipeline");
  return value;
}
