// Offline simulation of the orchestrator's revision cascade. No network and no
// model calls: the three agents and the executor are replaced through
// orchestrator.__setTestDoubles, and the store writes to a throwaway data dir.
//
//   npx tsx scripts/sim-cascade.ts
//
// Scenarios
//   1. r1, then r2 lands mid-build          -> converges on artifact r2, no task left non-terminal
//   2. r1, then r2 and r3 within 10ms       -> impact(r2) superseded, one build, artifact r3
//   3. builder throws on r1, then r2        -> failure leaves no agent mid-flight; r2 starts fresh
//   4. plan hangs past the task timeout     -> task.failed + architect "error" with the timeout message
//   5. reviewer keyword check leniency      -> 40% of content words is enough
// Exit code 0 when every assertion holds.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Agent, ArtifactFile, Plan, Requirement, Task, Workspace } from "../src/lib/types";

process.env.RELAY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "relay-sim-"));
delete process.env.FREESTYLE_API_KEY;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const TERMINAL = new Set<Task["status"]>(["done", "failed", "superseded"]);
const MID_FLIGHT = new Set<Agent["status"]>(["thinking", "working", "waiting"]);

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` -- ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main(): Promise<number> {
  const { store } = await import("../src/lib/store");
  const { orchestrator, __setTestDoubles } = await import("../src/lib/orchestrator");
  const { runDeterministicChecks } = await import("../src/lib/agents/reviewer");

  // ── doubles ──────────────────────────────────────────────────────────────
  const timing = { plan: 40, build: 150, deploy: 30, review: 40 };
  const calls: string[] = [];
  let builderFailsFor: number | null = null;
  let planHangsMs = 0;

  const meta = { provider: "sim", model: "stub", ms: 1 };
  const fakePlan = (revision: number, previousPlan: Plan | null): Plan => ({
    revision,
    summary: `Plan r${revision}: hero, listings, footer`,
    audience: "students",
    components: [
      { id: "hero", name: "Hero", description: `Hero for r${revision}`, files: ["index.html", "styles.css"] },
      { id: "listings", name: "Listings", description: "Grid", files: ["index.html", "styles.css", "app.js"] },
      { id: "footer", name: "Footer", description: "Footer", files: ["index.html"] },
    ],
    design: { palette: "ink", typography: "serif", tone: "warm" },
    delta: previousPlan
      ? { fromRevision: previousPlan.revision, toRevision: revision, affectedComponents: ["hero"], addedComponents: [], removedComponents: [], rationale: `I retarget the hero for r${revision}.` }
      : null,
    createdAt: Date.now(),
  });
  const fakeFiles = (revision: number): ArtifactFile[] => [
    { path: "index.html", content: `<!doctype html><html><head><title>r${revision}</title><link rel="stylesheet" href="styles.css"></head><body><section id="hero" data-component="hero">verified student housing r${revision}</section><section id="listings" data-component="listings"></section><footer id="footer" data-component="footer"></footer><script src="app.js" defer></script></body></html>` },
    { path: "styles.css", content: `:root{--ink:#111}@media (max-width:640px){body{margin:0}}` },
    { path: "app.js", content: `document.addEventListener("DOMContentLoaded",()=>{const grid=document.getElementById("listings");if(grid)grid.textContent="roommate matching";});` },
  ];

  __setTestDoubles({
    plan: async (ctx) => {
      const revision = Math.max(...ctx.requirements.map((r) => r.revision));
      calls.push(`plan:r${revision}`);
      await sleep(timing.plan + planHangsMs);
      return { plan: fakePlan(revision, ctx.previousPlan), meta };
    },
    build: async (ctx) => {
      calls.push(`build:r${ctx.plan.revision}${ctx.reviewNotes ? ":fix" : ""}`);
      await sleep(timing.build);
      if (builderFailsFor === ctx.plan.revision) throw new Error("simulated builder outage");
      return { files: fakeFiles(ctx.plan.revision), summary: `I built r${ctx.plan.revision}.`, meta };
    },
    deploy: async (_wsId, files, revision, onProgress) => {
      calls.push(`deploy:r${revision}`);
      onProgress("writing", `writing ${files.length} files`);
      await sleep(timing.deploy);
      onProgress("building", "serving");
      return { previewUrl: `http://sim.local/${revision}/index.html`, sandboxId: null, executor: "local", httpStatus: 200, logs: ["ok"] };
    },
    review: async (ctx) => {
      calls.push(`review:r${ctx.plan.revision}`);
      await sleep(timing.review);
      const checks = runDeterministicChecks(ctx);
      return { review: { verdict: "passed", notes: `I read r${ctx.plan.revision} and the hero covers the brief.`, blocking: [], checks }, meta };
    },
    executorKind: () => "local",
  });

  // ── helpers ──────────────────────────────────────────────────────────────
  function newWorkspace(name: string): Workspace {
    const ws = store.createWorkspace(name, "local");
    store.upsertParticipant(ws.id, { id: "u1", name: "Sim" });
    return ws;
  }
  function addRequirement(wsId: string, text: string): Requirement {
    const { workspace, requirement } = store.addRequirement(wsId, text, { id: "u1", name: "Sim" });
    store.emit(wsId, { type: "requirement.added", actor: { kind: "human", id: "u1", name: "Sim" }, message: text, payload: { requirement }, revision: workspace.revision });
    void orchestrator.onRequirementAdded(wsId, requirement).catch((err) => console.error("onRequirementAdded threw", err));
    return requirement;
  }
  async function waitForTask(wsId: string, title: string, status: Task["status"], timeoutMs = 5000): Promise<Task> {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      const t = store.getTasks(wsId).find((x) => x.title === title && x.status === status);
      if (t) return t;
      await sleep(3);
    }
    throw new Error(`timed out waiting for task "${title}" to be ${status}`);
  }
  async function waitForIdle(wsId: string, timeoutMs = 10_000): Promise<Workspace> {
    const until = Date.now() + timeoutMs;
    let quiet = 0;
    while (Date.now() < until) {
      const ws = store.getWorkspace(wsId)!;
      const tasksSettled = store.getTasks(wsId).every((t) => TERMINAL.has(t.status));
      if (ws.activeRevision === null && ws.pendingRevision === null && tasksSettled) {
        if (++quiet >= 3) return ws;
      } else quiet = 0;
      await sleep(15);
    }
    throw new Error("workspace never went idle");
  }
  function assertConverged(wsId: string, revision: number): void {
    const ws = store.getWorkspace(wsId)!;
    const tasks = store.getTasks(wsId);
    const agents = store.getAgents(wsId);
    const events = store.getEvents(wsId);
    check(`artifact.revision === ${revision}`, ws.artifact?.revision === revision, `got ${ws.artifact?.revision ?? "none"}`);
    check(`plan.revision === ${revision}`, ws.plan?.revision === revision, `got ${ws.plan?.revision ?? "none"}`);
    check("activeRevision cleared", ws.activeRevision === null);
    check("pendingRevision cleared", ws.pendingRevision === null);
    check("buildStatus live", ws.buildStatus === "live", ws.buildStatus);
    check("all tasks terminal", tasks.every((t) => TERMINAL.has(t.status)), tasks.filter((t) => !TERMINAL.has(t.status)).map((t) => `${t.title}=${t.status}`).join(", "));
    check("no agent mid-flight", agents.every((a) => !MID_FLIGHT.has(a.status)), agents.map((a) => `${a.role}=${a.status}`).join(", "));
    check("artifact verification recorded", ws.artifact?.verification === "passed", ws.artifact?.verification ?? "none");
    const seqs = events.map((e) => e.seq);
    check("event seq strictly increasing", seqs.every((s, i) => i === 0 || s > seqs[i - 1]));
    const successes = events.filter((e) => e.type === "build.succeeded").map((e) => e.payload.revision);
    check(`newest build.succeeded is r${revision}`, successes[successes.length - 1] === revision, `build.succeeded revisions: ${successes.join(",") || "none"}`);
  }

  // ── 1. r1 then r2 mid-build ──────────────────────────────────────────────
  console.log("\n[1] r1 -> r2 lands mid-build");
  {
    const ws = newWorkspace("sim-1");
    addRequirement(ws.id, "Build a landing page for verified student housing");
    check("first requirement started a pipeline (no cascade)", store.getEvents(ws.id).every((e) => e.type !== "revision.cascade"));
    await waitForTask(ws.id, "Build site for r1", "running");
    addRequirement(ws.id, "Add roommate matching");
    await waitForIdle(ws.id);
    assertConverged(ws.id, 2);
    const tasks = store.getTasks(ws.id);
    check("r1 build task superseded", tasks.find((t) => t.title === "Build site for r1")?.status === "superseded");
    check("impact assessment for r2 done", tasks.find((t) => t.title === "Assess impact of r2")?.status === "done");
    check("exactly one revision.cascade event", store.getEvents(ws.id).filter((e) => e.type === "revision.cascade").length === 1);
    check("r1 never deployed", !calls.includes("deploy:r1"), calls.join(" "));
    check("r2 built, deployed, reviewed once each", calls.filter((c) => c === "build:r2").length === 1 && calls.filter((c) => c === "deploy:r2").length === 1 && calls.filter((c) => c === "review:r2").length === 1, calls.join(" "));
    check("plan.revised emitted for r2 with delta", store.getEvents(ws.id).some((e) => e.type === "plan.revised" && (e.payload.plan as Plan).delta?.toRevision === 2) || store.getEvents(ws.id).some((e) => e.type === "plan.created" && (e.payload.plan as Plan).revision === 2));
  }

  // ── 2. two rapid changes while the impact assessment runs ────────────────
  console.log("\n[2] r1, then r2 and r3 within 10ms (cascade during impact assessment)");
  calls.length = 0;
  {
    const ws = newWorkspace("sim-2");
    addRequirement(ws.id, "Build a landing page for verified student housing");
    await waitForTask(ws.id, "Plan r1", "running");
    addRequirement(ws.id, "Add roommate matching");
    await sleep(10);
    addRequirement(ws.id, "Make the hero about graduating seniors");
    await waitForIdle(ws.id);
    assertConverged(ws.id, 3);
    const tasks = store.getTasks(ws.id);
    check("impact r2 superseded", tasks.find((t) => t.title === "Assess impact of r2")?.status === "superseded", tasks.map((t) => `${t.title}=${t.status}`).join(" | "));
    check("impact r3 done", tasks.find((t) => t.title === "Assess impact of r3")?.status === "done");
    check("plan r1 superseded", tasks.find((t) => t.title === "Plan r1")?.status === "superseded");
    check("only r3 was built", calls.filter((c) => c.startsWith("build:")).join(",") === "build:r3", calls.join(" "));
    check("two cascade events (r1->r2, r2->r3)", store.getEvents(ws.id).filter((e) => e.type === "revision.cascade").length === 2);
  }

  // ── 3. failure leaves a sane state; next requirement starts fresh ────────
  console.log("\n[3] builder throws on r1, then r2 recovers");
  calls.length = 0;
  {
    const ws = newWorkspace("sim-3");
    builderFailsFor = 1;
    addRequirement(ws.id, "Build a landing page for verified student housing");
    await waitForIdle(ws.id);
    const after = store.getWorkspace(ws.id)!;
    const agents = store.getAgents(ws.id);
    check("activeRevision cleared after failure", after.activeRevision === null);
    check("no artifact after failed build", after.artifact === null);
    check("builder in error", agents.find((a) => a.role === "builder")?.status === "error", agents.find((a) => a.role === "builder")?.statusDetail ?? "");
    check("reviewer not stuck waiting", agents.find((a) => a.role === "reviewer")?.status !== "waiting", agents.find((a) => a.role === "reviewer")?.status);
    check("task.failed emitted", store.getEvents(ws.id).some((e) => e.type === "task.failed"));
    builderFailsFor = null;
    addRequirement(ws.id, "Add roommate matching");
    await waitForIdle(ws.id);
    assertConverged(ws.id, 2);
    check("r2 ran a full fresh pipeline", calls.includes("plan:r2") && calls.includes("build:r2") && calls.includes("deploy:r2"), calls.join(" "));
  }

  // ── 4. task timeout ──────────────────────────────────────────────────────
  console.log("\n[4] plan hangs past the task timeout");
  calls.length = 0;
  {
    const ws = newWorkspace("sim-4");
    __setTestDoubles({ taskTimeoutMs: 60 });
    planHangsMs = 400;
    addRequirement(ws.id, "Build a landing page for verified student housing");
    await waitForIdle(ws.id);
    const agents = store.getAgents(ws.id);
    const planTask = store.getTasks(ws.id).find((t) => t.title === "Plan r1");
    check("plan task failed", planTask?.status === "failed", planTask?.status);
    check("failure message names the timeout", /Timed out after/.test(planTask?.error ?? ""), planTask?.error ?? "");
    check("architect status error with the message", agents.find((a) => a.role === "architect")?.status === "error" && /Timed out/.test(agents.find((a) => a.role === "architect")?.statusDetail ?? ""));
    check("pipeline ended cleanly", store.getWorkspace(ws.id)!.activeRevision === null && !calls.includes("build:r1"));
    check("builder/reviewer not mid-flight", agents.filter((a) => a.role !== "architect").every((a) => !MID_FLIGHT.has(a.status)));
    await sleep(450); // let the hung stub resolve; nothing may change afterwards
    check("late plan result did not write workspace.plan", store.getWorkspace(ws.id)!.plan === null);
    planHangsMs = 0;
    __setTestDoubles({ taskTimeoutMs: 120_000 });
  }

  // ── 5. reviewer leniency ─────────────────────────────────────────────────
  console.log("\n[5] reviewer keyword check");
  {
    const req: Requirement = { id: "r", text: "Please make a really nice modern landing page for verified student housing near campus with roommate matching", revision: 1, authorId: "u1", authorName: "Sim", createdAt: 0 };
    const checks = runDeterministicChecks({ plan: fakePlan(1, null), requirements: [req], files: fakeFiles(1), previewUrl: "http://sim.local/1/index.html", httpStatus: 200 });
    const kw = checks.find((c) => c.name === "requirement-r1-keywords");
    check("keyword check passes with partial coverage", kw?.ok === true, kw?.detail);
    check("no hard check false-fails on the stub site", checks.filter((c) => ["index-doctype", "index-title", "local-refs-exist", "preview-200", "no-external-scripts"].includes(c.name)).every((c) => c.ok), checks.filter((c) => !c.ok).map((c) => c.name).join(","));
  }

  await store.flush();
  const persisted = JSON.parse(fs.readFileSync(path.join(process.env.RELAY_DATA_DIR!, "relay.json"), "utf8"));
  check("\npersisted file has all 4 workspaces", Array.isArray(persisted.workspaces) && persisted.workspaces.length === 4);

  console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}`);
  return failures === 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
