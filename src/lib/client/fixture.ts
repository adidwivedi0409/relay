// Dev-only in-memory WorkspaceSnapshot used by /dev/preview to exercise every
// timeline row type and panel state without the API. Not imported by /w/[id].

import type {
  Actor,
  Agent,
  Artifact,
  ArtifactFile,
  EventType,
  Participant,
  Plan,
  RelayEvent,
  Requirement,
  Task,
  Workspace,
  WorkspaceSnapshot,
} from "@/lib/types";
import { AGENT_COLORS, AGENT_NAMES, HUMAN_COLORS } from "@/lib/types";

export type FixtureScenario = "building" | "live" | "failed" | "empty";
export const FIXTURE_SCENARIOS: ReadonlyArray<{ value: FixtureScenario; label: string }> = [
  { value: "building", label: "Building r3" },
  { value: "live", label: "Live r3" },
  { value: "failed", label: "Build failed" },
  { value: "empty", label: "Fresh workspace" },
];

export const WS_ID = "ws_demo_northstar";

// ── sample site served by /dev/preview/sample/* ──────────────────────────────

const INDEX_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Northstar - Budgeting for freelancers</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <header class="nav">
    <a class="brand" href="#top">Northstar</a>
    <nav class="links">
      <a href="#features">Features</a>
      <a href="#pricing">Pricing</a>
      <a href="#faq">FAQ</a>
    </nav>
    <button class="theme-toggle" id="theme-toggle" type="button" aria-pressed="false" hidden>Dark</button>
  </header>

  <main id="top">
    <section class="hero">
      <p class="eyebrow">Built for independent work</p>
      <h1>Know what you can spend, every single month.</h1>
      <p class="lede">Northstar smooths irregular income into a steady paycheck, sets aside taxes automatically, and tells you when it is safe to say no to a client.</p>
      <form class="waitlist" id="waitlist" novalidate>
        <label class="sr-only" for="email">Email</label>
        <input id="email" name="email" type="email" placeholder="you@studio.com" autocomplete="email" required />
        <button type="submit">Join the waitlist</button>
        <p class="form-note" id="form-note" role="status"></p>
      </form>
    </section>

    <section class="features" id="features">
      <article class="card">
        <h3>Income smoothing</h3>
        <p>Deposits land in a buffer. You pay yourself a fixed salary on the first of the month.</p>
      </article>
      <article class="card">
        <h3>Tax set-aside</h3>
        <p>Every invoice reserves its estimated tax share so April never surprises you.</p>
      </article>
      <article class="card">
        <h3>Runway at a glance</h3>
        <p>See how many months you can cover before you need the next contract.</p>
      </article>
    </section>

    <section class="pricing" id="pricing">
      <div class="pricing-head">
        <h2>Simple pricing</h2>
        <div class="toggle" role="group" aria-label="Billing period">
          <button type="button" data-period="monthly" aria-pressed="false">Monthly</button>
          <button type="button" data-period="yearly" aria-pressed="true">Yearly <span class="badge">Save 20%</span></button>
        </div>
      </div>
      <div class="plans">
        <article class="plan">
          <h3>Solo</h3>
          <p class="price"><span data-monthly="9" data-yearly="7">7</span><small>/mo</small></p>
          <ul>
            <li>One business account</li>
            <li>Income smoothing</li>
            <li>Tax set-aside</li>
          </ul>
          <button type="button" class="ghost">Start free</button>
        </article>
        <article class="plan featured">
          <h3>Studio</h3>
          <p class="price"><span data-monthly="24" data-yearly="19">19</span><small>/mo</small></p>
          <ul>
            <li>Up to five accounts</li>
            <li>Client runway forecasts</li>
            <li>Accountant export</li>
          </ul>
          <button type="button">Start free</button>
        </article>
      </div>
    </section>

    <section class="faq" id="faq">
      <h2>Questions</h2>
      <details open>
        <summary>Do you connect to my bank?</summary>
        <p>Yes. Read-only connections through your bank's own login. We never see your credentials.</p>
      </details>
      <details>
        <summary>What happens in a slow month?</summary>
        <p>Your salary is paid from the buffer. Northstar warns you two months before it would run dry.</p>
      </details>
      <details>
        <summary>Can my accountant log in?</summary>
        <p>Studio plans include a read-only accountant seat with exports in CSV and QBO.</p>
      </details>
    </section>
  </main>

  <footer class="foot">
    <span>Northstar</span>
    <span>Made for freelancers, by freelancers.</span>
  </footer>
  <script src="app.js"></script>
</body>
</html>
`;

const STYLES_CSS = `:root {
  --bg: #fbfaf7;
  --surface: #ffffff;
  --ink: #15130f;
  --muted: #6b665c;
  --line: rgba(21, 19, 15, 0.1);
  --brand: #1f6f5f;
  --brand-ink: #ffffff;
  --accent: #e4b363;
  --radius: 12px;
}
:root[data-theme="dark"] {
  --bg: #121311;
  --surface: #1a1c19;
  --ink: #f1efe9;
  --muted: #9b978d;
  --line: rgba(255, 255, 255, 0.1);
  --brand: #6cc3ad;
  --brand-ink: #0f1512;
}
* { box-sizing: border-box; }
html, body { margin: 0; }
body {
  font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif;
  background: var(--bg);
  color: var(--ink);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.nav {
  position: sticky; top: 0; z-index: 10;
  display: flex; align-items: center; gap: 24px;
  padding: 14px 28px;
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--line);
}
.brand { font-weight: 700; letter-spacing: -0.02em; color: var(--ink); text-decoration: none; font-size: 18px; }
.links { display: flex; gap: 18px; margin-left: auto; }
.links a { color: var(--muted); text-decoration: none; font-size: 14px; font-weight: 500; }
.links a:hover { color: var(--ink); }
.theme-toggle {
  border: 1px solid var(--line); background: var(--surface); color: var(--ink);
  border-radius: 999px; padding: 6px 12px; font: inherit; font-size: 13px; cursor: pointer;
}
main { max-width: 1040px; margin: 0 auto; padding: 0 28px 80px; }
.hero { padding: 96px 0 64px; max-width: 680px; }
.eyebrow { color: var(--brand); font-weight: 600; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 14px; }
h1 { font-size: clamp(36px, 5vw, 56px); line-height: 1.05; letter-spacing: -0.03em; margin: 0 0 18px; }
.lede { font-size: 18px; color: var(--muted); margin: 0 0 28px; }
.waitlist { display: grid; grid-template-columns: 1fr auto; gap: 10px; max-width: 460px; }
.waitlist input {
  height: 46px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--line);
  background: var(--surface); color: var(--ink); font: inherit; font-size: 15px;
}
.waitlist input:focus { outline: 2px solid var(--brand); outline-offset: 1px; }
.waitlist button, .plan button {
  height: 46px; padding: 0 18px; border-radius: 10px; border: 0;
  background: var(--brand); color: var(--brand-ink); font: inherit; font-weight: 600; cursor: pointer;
}
.waitlist button:hover, .plan button:hover { filter: brightness(1.05); }
.form-note { grid-column: 1 / -1; margin: 0; font-size: 13px; min-height: 18px; color: var(--muted); }
.form-note.ok { color: var(--brand); }
.form-note.err { color: #b4472f; }
.features { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 24px; }
.card {
  background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 22px;
}
.card h3 { margin: 0 0 8px; font-size: 17px; letter-spacing: -0.01em; }
.card p { margin: 0; color: var(--muted); font-size: 15px; }
.pricing { margin-top: 88px; }
.pricing-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
h2 { font-size: 30px; letter-spacing: -0.02em; margin: 0; }
.toggle { display: inline-flex; border: 1px solid var(--line); border-radius: 999px; padding: 3px; background: var(--surface); }
.toggle button {
  border: 0; background: transparent; color: var(--muted); font: inherit; font-weight: 600; font-size: 14px;
  padding: 7px 14px; border-radius: 999px; cursor: pointer; display: inline-flex; gap: 8px; align-items: center;
}
.toggle button[aria-pressed="true"] { background: var(--ink); color: var(--bg); }
.badge { background: var(--accent); color: #1a1407; font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 999px; }
.plans { display: grid; grid-template-columns: repeat(2, minmax(0, 360px)); gap: 16px; margin-top: 28px; }
.plan { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 26px; display: flex; flex-direction: column; gap: 14px; }
.plan.featured { border-color: var(--brand); box-shadow: 0 12px 40px -24px rgba(31, 111, 95, 0.6); }
.plan h3 { margin: 0; font-size: 18px; }
.price { margin: 0; font-size: 44px; font-weight: 700; letter-spacing: -0.03em; line-height: 1; }
.price span::before { content: "$"; font-size: 24px; vertical-align: top; margin-right: 2px; }
.price small { font-size: 15px; font-weight: 500; color: var(--muted); margin-left: 4px; }
.plan ul { margin: 0; padding-left: 18px; color: var(--muted); font-size: 15px; display: grid; gap: 6px; }
.plan button.ghost { background: transparent; color: var(--ink); border: 1px solid var(--line); }
.faq { margin-top: 88px; max-width: 680px; }
.faq details { border-top: 1px solid var(--line); padding: 14px 0; }
.faq details:last-child { border-bottom: 1px solid var(--line); }
.faq summary { cursor: pointer; font-weight: 600; font-size: 16px; list-style: none; display: flex; justify-content: space-between; }
.faq summary::after { content: "+"; color: var(--muted); }
.faq details[open] summary::after { content: "-"; }
.faq p { margin: 10px 0 0; color: var(--muted); }
.foot { display: flex; justify-content: space-between; padding: 24px 28px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; }
@media (max-width: 760px) {
  .features, .plans { grid-template-columns: 1fr; }
  .waitlist { grid-template-columns: 1fr; }
  .links { display: none; }
}
`;

const APP_JS = `(function () {
  var params = new URLSearchParams(window.location.search);
  var revision = parseInt(params.get("v") || "1", 10) || 1;

  // Pricing toggle. r2+: yearly is the default; r1 defaults to monthly.
  var toggle = document.querySelector(".toggle");
  var prices = Array.prototype.slice.call(document.querySelectorAll(".price span"));
  function setPeriod(period) {
    Array.prototype.forEach.call(toggle.querySelectorAll("button"), function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-period") === period));
    });
    prices.forEach(function (el) {
      el.textContent = el.getAttribute(period === "yearly" ? "data-yearly" : "data-monthly");
    });
  }
  toggle.addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-period]");
    if (btn) setPeriod(btn.getAttribute("data-period"));
  });
  setPeriod(revision >= 2 ? "yearly" : "monthly");
  if (revision < 2) {
    var badge = document.querySelector(".badge");
    if (badge) badge.remove();
  }

  // Theme toggle ships in r3.
  var themeToggle = document.getElementById("theme-toggle");
  if (revision >= 3 && themeToggle) {
    themeToggle.hidden = false;
    var dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    function applyTheme() {
      document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
      themeToggle.setAttribute("aria-pressed", String(dark));
      themeToggle.textContent = dark ? "Light" : "Dark";
    }
    themeToggle.addEventListener("click", function () { dark = !dark; applyTheme(); });
    applyTheme();
  }

  // Waitlist validation.
  var form = document.getElementById("waitlist");
  var note = document.getElementById("form-note");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = form.elements.email.value.trim();
    var valid = /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email);
    note.className = "form-note " + (valid ? "ok" : "err");
    note.textContent = valid ? "You are on the list. We will email " + email + " when invites open." : "Enter a valid email address.";
    if (valid) form.reset();
  });
})();
`;

export const SAMPLE_FILES: ArtifactFile[] = [
  { path: "index.html", content: INDEX_HTML },
  { path: "styles.css", content: STYLES_CSS },
  { path: "app.js", content: APP_JS },
];

// ── fixture builder ──────────────────────────────────────────────────────────

const SYSTEM: Actor = { kind: "system", id: "system", name: "Relay" };
const agentActor = (role: Agent["role"]): Actor => ({ kind: "agent", id: `agent_${role}`, name: AGENT_NAMES[role], role, color: AGENT_COLORS[role] });

export interface FixtureOptions {
  /** Origin used for previewUrl; empty string gives a relative URL. */
  baseUrl?: string;
  /** "now" in epoch ms; defaults to Date.now(). */
  now?: number;
}

export function buildFixture(scenario: FixtureScenario, opts: FixtureOptions = {}): WorkspaceSnapshot {
  const now = opts.now ?? Date.now();
  const base = opts.baseUrl ?? "";
  const previewUrl = (rev: number) => `${base}/dev/preview/sample/index.html?v=${rev}`;

  const maya: Participant = { id: "p_maya", workspaceId: WS_ID, name: "Maya Chen", color: HUMAN_COLORS[0], lastSeen: now - 2_000, joinedAt: now - 9 * 60_000 };
  const aditya: Participant = { id: "p_aditya", workspaceId: WS_ID, name: "Aditya Dwivedi", color: HUMAN_COLORS[1], lastSeen: now - 1_000, joinedAt: now - 8 * 60_000 };
  const sam: Participant = { id: "p_sam", workspaceId: WS_ID, name: "Sam Okafor", color: HUMAN_COLORS[2], lastSeen: now - 4 * 60_000, joinedAt: now - 6 * 60_000 };
  const humans = { maya: { kind: "human", id: maya.id, name: maya.name, color: maya.color } as Actor, aditya: { kind: "human", id: aditya.id, name: aditya.name, color: aditya.color } as Actor };

  let seq = 0;
  let t = now - 7 * 60_000;
  const events: RelayEvent[] = [];
  const ev = (type: EventType, actor: Actor, message: string, payload: Record<string, unknown>, revision: number, dt = 6_000): RelayEvent => {
    t += dt;
    seq += 1;
    const e: RelayEvent = { id: `ev_${String(seq).padStart(3, "0")}`, workspaceId: WS_ID, seq, type, actor, message, payload, revision, createdAt: t };
    events.push(e);
    return e;
  };

  const mkAgent = (role: Agent["role"], patch: Partial<Agent> = {}): Agent => ({
    id: `agent_${role}`,
    workspaceId: WS_ID,
    role,
    name: AGENT_NAMES[role],
    provider: "wally",
    model: "glm-5.3-flash",
    status: "idle",
    statusDetail: null,
    currentTaskId: null,
    updatedAt: now,
    ...patch,
  });

  const tasks: Task[] = [];
  const mkTask = (id: string, role: Agent["role"], title: string, description: string, baseRevision: number, status: Task["status"], extra: Partial<Task> = {}): Task => {
    const task: Task = {
      id,
      workspaceId: WS_ID,
      agentRole: role,
      title,
      description,
      dependsOn: [],
      baseRevision,
      status,
      output: null,
      error: null,
      createdAt: t,
      startedAt: null,
      finishedAt: null,
      ...extra,
    };
    tasks.push(task);
    return task;
  };

  const baseWorkspace: Workspace = {
    id: WS_ID,
    name: "Northstar launch page",
    createdAt: now - 7 * 60_000,
    revision: 0,
    requirements: [],
    plan: null,
    artifact: null,
    buildStatus: "idle",
    buildError: null,
    executor: "local",
    sandboxId: null,
    activeRevision: null,
    pendingRevision: null,
  };

  ev("workspace.created", SYSTEM, "Workspace created · executor: local", { executor: "local" }, 0, 0);
  ev("participant.joined", humans.maya, "Maya Chen joined", { participant: maya }, 0, 2_000);
  ev("participant.joined", humans.aditya, "Aditya Dwivedi joined", { participant: aditya }, 0, 30_000);

  if (scenario === "empty") {
    return {
      workspace: baseWorkspace,
      participants: [maya, aditya],
      agents: [mkAgent("architect"), mkAgent("builder"), mkAgent("reviewer")],
      tasks: [],
      events,
      now,
    };
  }

  // ── r1 ──────────────────────────────────────────────────────────────────
  const req1: Requirement = {
    id: "req_1",
    text: "A landing page for Northstar, a budgeting app for freelancers: hero with a waitlist form, three feature cards, pricing with a monthly/yearly toggle, and a short FAQ.",
    revision: 1,
    authorId: maya.id,
    authorName: maya.name,
    createdAt: t + 20_000,
  };
  ev("requirement.added", humans.maya, req1.text, { requirement: req1, revision: 1, previousRevision: 0 }, 1, 20_000);

  const plan1: Plan = {
    revision: 1,
    summary: "A single-page marketing site with a conversion-focused hero, a three-up feature grid, a two-plan pricing section with a billing toggle, and a compact FAQ.",
    audience: "independent freelancers with irregular income",
    components: [
      { id: "hero", name: "Hero + waitlist", description: "Headline, supporting copy and a validated email capture form.", files: ["index.html", "app.js"] },
      { id: "features", name: "Feature grid", description: "Three cards: income smoothing, tax set-aside, runway.", files: ["index.html"] },
      { id: "pricing", name: "Pricing", description: "Solo and Studio plans with a monthly/yearly toggle driven by data attributes.", files: ["index.html", "app.js"] },
      { id: "faq", name: "FAQ", description: "Native details/summary accordion, first item open.", files: ["index.html"] },
      { id: "theme", name: "Design system", description: "Warm paper palette, Inter, 12px radius, single brand green.", files: ["styles.css"] },
    ],
    design: { palette: "warm paper background, near-black ink, brand green #1f6f5f, amber badge accent", typography: "Inter, tight display tracking, 15px body", tone: "calm, precise, slightly dry" },
    delta: null,
    createdAt: t + 14_000,
  };

  const t1 = mkTask("task_r1_plan", "architect", "Draft plan for r1", "Turn the first requirement into a component plan with stable ids.", 1, "done", { startedAt: t + 4_000, finishedAt: t + 14_000, output: "5 components, 3 files." });
  ev("task.created", agentActor("architect"), "Task created: Draft plan for r1", { task: { ...t1, status: "queued" } }, 1, 3_000);
  ev("task.started", agentActor("architect"), "Task started: Draft plan for r1", { task: { ...t1, status: "running" } }, 1, 1_000);
  ev("agent.message", agentActor("architect"), "I am treating this as a single conversion page. Pricing and the hero form are the only interactive parts, so I am keeping app.js small and letting the FAQ be native details elements.", {}, 1, 9_000);
  ev("plan.created", agentActor("architect"), "Plan created for r1 · 5 components", { plan: plan1 }, 1, 1_000);
  ev("task.completed", agentActor("architect"), "Task completed: Draft plan for r1", { task: t1 }, 1, 500);
  ev("agent.handoff", agentActor("architect"), "Architect → Builder: 5 components, 3 files", { from: "architect", to: "builder", summary: "Build the full site from scratch. Keep component ids in data attributes so revisions can target them.", items: ["hero: headline + validated waitlist form", "features: 3 cards in a responsive grid", "pricing: 2 plans, toggle swaps data-monthly/data-yearly", "faq: details/summary, first open", "theme: tokens in :root, Inter from Google Fonts"] }, 1, 1_000);

  const t2 = mkTask("task_r1_build", "builder", "Build site for r1", "Write index.html, styles.css and app.js per the plan and deploy.", 1, "done", { startedAt: t + 2_000, finishedAt: t + 41_000, output: "3 files written, deployed to local executor." });
  ev("task.created", agentActor("builder"), "Task created: Build site for r1", { task: { ...t2, status: "queued" } }, 1, 1_000);
  ev("task.started", agentActor("builder"), "Task started: Build site for r1", { task: { ...t2, status: "running" } }, 1, 1_000);
  ev("agent.message", agentActor("builder"), "Writing the three files now. The pricing toggle reads data-monthly and data-yearly on each price so a revision can change defaults without touching markup.", {}, 1, 24_000);
  ev("build.started", agentActor("builder"), "Deploying r1 to local executor", { revision: 1, executor: "local" }, 1, 2_000);
  const artifact1: Artifact = {
    id: "art_1",
    workspaceId: WS_ID,
    revision: 1,
    files: SAMPLE_FILES,
    previewUrl: previewUrl(1),
    executor: "local",
    sandboxId: null,
    verification: "warnings",
    verificationNotes: "Hero copy does not mention the word 'freelancers' in the headline; it appears in the lede.",
    changedFiles: [],
    builtAt: t + 11_000,
  };
  ev("build.succeeded", agentActor("builder"), "r1 is live", { previewUrl: previewUrl(1), revision: 1, changedFiles: [], executor: "local", sandboxId: null, ms: 11_240 }, 1, 11_000);
  ev("task.completed", agentActor("builder"), "Task completed: Build site for r1", { task: t2 }, 1, 500);
  ev("agent.handoff", agentActor("builder"), "Builder → Reviewer: r1 deployed", { from: "builder", to: "reviewer", summary: "All three files shipped. Please check the waitlist validation and the toggle.", items: ["index.html", "styles.css", "app.js"] }, 1, 1_000);

  const t3 = mkTask("task_r1_review", "reviewer", "Review r1", "Deterministic checks plus a model pass on requirement coverage.", 1, "done", { startedAt: t + 1_000, finishedAt: t + 13_000, output: "Passed with one warning." });
  ev("task.created", agentActor("reviewer"), "Task created: Review r1", { task: { ...t3, status: "queued" } }, 1, 1_000);
  ev("task.started", agentActor("reviewer"), "Task started: Review r1", { task: { ...t3, status: "running" } }, 1, 500);
  ev("review.completed", agentActor("reviewer"), "Review for r1: passed with warnings", {
    verdict: "warnings",
    notes: "Every requirement is represented and the interactive parts work. One soft miss: the headline never says who the product is for.",
    blocking: [],
    checks: [
      { name: "Preview responds 200", ok: true, detail: "GET /index.html?v=1 in 38ms" },
      { name: "Doctype and title present", ok: true, detail: "Northstar - Budgeting for freelancers" },
      { name: "Local script/style references resolve", ok: true, detail: "styles.css, app.js" },
      { name: "Requirement keywords in index.html", ok: false, detail: "'freelancers' missing from h1" },
      { name: "Waitlist form validates email", ok: true, detail: "regex + status message" },
      { name: "Pricing toggle swaps prices", ok: true, detail: "data-monthly / data-yearly" },
    ],
  }, 1, 12_000);
  ev("agent.message", agentActor("reviewer"), "I would not block on the headline, but a future revision should put the audience in the h1. Everything else checks out, including the form and the toggle.", {}, 1, 2_000);
  ev("task.completed", agentActor("reviewer"), "Task completed: Review r1", { task: t3 }, 1, 500);

  // ── r2 ──────────────────────────────────────────────────────────────────
  ev("human.message", humans.aditya, "Can we default pricing to yearly? Most of our beta users picked it anyway.", { text: "Can we default pricing to yearly? Most of our beta users picked it anyway." }, 1, 40_000);
  const req2: Requirement = { id: "req_2", text: "Default the pricing toggle to yearly and show a 'Save 20%' badge on the yearly option.", revision: 2, authorId: aditya.id, authorName: aditya.name, createdAt: t + 15_000 };
  ev("requirement.added", humans.aditya, req2.text, { requirement: req2, revision: 2, previousRevision: 1 }, 2, 15_000);

  const plan2: Plan = {
    ...plan1,
    revision: 2,
    summary: plan1.summary,
    components: plan1.components.map((c) => (c.id === "pricing" ? { ...c, description: "Solo and Studio plans; yearly is the default and carries a Save 20% badge." } : c)),
    delta: { fromRevision: 1, toRevision: 2, affectedComponents: ["pricing"], addedComponents: [], removedComponents: [], rationale: "Only the pricing default and badge change. Hero, features, FAQ and tokens are untouched, so the builder should rewrite pricing markup and the toggle init only." },
    createdAt: t + 9_000,
  };
  const t4 = mkTask("task_r2_plan", "architect", "Revise plan for r2", "Assess impact of the pricing default change.", 2, "done", { startedAt: t + 2_000, finishedAt: t + 9_000, output: "1 component affected." });
  ev("task.created", agentActor("architect"), "Task created: Revise plan for r2", { task: { ...t4, status: "queued" } }, 2, 2_000);
  ev("task.started", agentActor("architect"), "Task started: Revise plan for r2", { task: { ...t4, status: "running" } }, 2, 500);
  ev("plan.revised", agentActor("architect"), "Plan revised for r2 · 1 component affected", { plan: plan2 }, 2, 7_000);
  ev("task.completed", agentActor("architect"), "Task completed: Revise plan for r2", { task: t4 }, 2, 500);
  ev("agent.handoff", agentActor("architect"), "Architect → Builder: pricing only", { from: "architect", to: "builder", summary: "Rewrite the pricing component and the toggle default. Return the full file set with the other files unchanged.", items: ["pricing: aria-pressed=true on yearly by default", "pricing: badge element inside the yearly button"] }, 2, 1_000);

  const t5 = mkTask("task_r2_build", "builder", "Build site for r2", "Apply the pricing delta and redeploy.", 2, "stale", { startedAt: t + 2_000, finishedAt: null });
  ev("task.created", agentActor("builder"), "Task created: Build site for r2", { task: { ...t5, status: "queued" } }, 2, 1_000);
  ev("task.started", agentActor("builder"), "Task started: Build site for r2", { task: { ...t5, status: "running" } }, 2, 1_000);
  ev("build.started", agentActor("builder"), "Deploying r2 to local executor", { revision: 2, executor: "local" }, 2, 9_000);

  // ── r3 arrives mid-build → cascade ──────────────────────────────────────
  const req3: Requirement = { id: "req_3", text: "Add a light/dark theme toggle in the header that remembers the system preference.", revision: 3, authorId: maya.id, authorName: maya.name, createdAt: t + 4_000 };
  ev("requirement.added", humans.maya, req3.text, { requirement: req3, revision: 3, previousRevision: 2 }, 3, 4_000);
  ev("revision.cascade", SYSTEM, "Requirement changed mid-build (r2 → r3). Marking in-flight work stale.", { fromRevision: 2, toRevision: 3, staleTasks: ["Build site for r2"] }, 3, 300);
  ev("task.stale", agentActor("builder"), "Task stale: Build site for r2", { task: t5 }, 3, 200);
  ev("agent.message", agentActor("architect"), "The theme toggle touches the header and the tokens file, and the pricing change from r2 is still pending. I am folding both into one r3 plan so the builder writes once.", {}, 3, 7_000);

  const plan3: Plan = {
    ...plan2,
    revision: 3,
    components: [
      ...plan2.components.map((c) => (c.id === "theme" ? { ...c, description: "Paper and graphite palettes behind data-theme; tokens in :root.", files: ["styles.css"] } : c)),
      { id: "theme-toggle", name: "Theme toggle", description: "Header button that flips data-theme, seeded from prefers-color-scheme.", files: ["index.html", "app.js"] },
    ],
    delta: { fromRevision: 2, toRevision: 3, affectedComponents: ["pricing", "theme"], addedComponents: ["theme-toggle"], removedComponents: [], rationale: "r3 adds a theme toggle on top of the unshipped r2 pricing change. The tokens file gains a dark palette; a new header component owns the toggle." },
    createdAt: t + 2_000,
  };
  const t6 = mkTask("task_r3_plan", "architect", "Re-plan for r3", "Merge the pending r2 delta with the new theme toggle requirement.", 3, "done", { startedAt: t - 6_000, finishedAt: t + 2_000, output: "2 affected, 1 added." });
  ev("task.created", agentActor("architect"), "Task created: Re-plan for r3", { task: { ...t6, status: "queued" } }, 3, 500);
  ev("task.started", agentActor("architect"), "Task started: Re-plan for r3", { task: { ...t6, status: "running" } }, 3, 300);
  ev("plan.revised", agentActor("architect"), "Plan revised for r3 · 2 affected, 1 added", { plan: plan3 }, 3, 2_000);
  ev("task.completed", agentActor("architect"), "Task completed: Re-plan for r3", { task: t6 }, 3, 400);
  ev("agent.handoff", agentActor("architect"), "Architect → Builder: pricing, theme, theme-toggle", { from: "architect", to: "builder", summary: "Write pricing (r2 delta), the dark palette in styles.css, and the new header toggle. Hero, features and FAQ stay byte-identical.", items: ["pricing: yearly default + Save 20% badge", "theme: add :root[data-theme=dark] tokens", "theme-toggle: header button, seeded from prefers-color-scheme"] }, 3, 800);

  const t7 = mkTask("task_r3_build", "builder", "Build site for r3", "Rewrite pricing, tokens and header toggle; redeploy.", 3, "running", { startedAt: t + 1_500 });
  ev("task.created", agentActor("builder"), "Task created: Build site for r3", { task: { ...t7, status: "queued" } }, 3, 1_000);
  ev("task.started", agentActor("builder"), "Task started: Build site for r3", { task: { ...t7, status: "running" } }, 3, 500);
  ev("agent.message", agentActor("builder"), "Starting from the r1 files since r2 never shipped. I am adding the dark tokens under data-theme so nothing else in the stylesheet moves.", {}, 3, 6_000);
  ev("build.started", agentActor("builder"), "Deploying r3 to local executor", { revision: 3, executor: "local" }, 3, 12_000);
  const t8 = mkTask("task_r3_review", "reviewer", "Review r3", "Deterministic checks plus a model pass on requirement coverage.", 3, "queued");

  const requirements = [req1, req2, req3];

  if (scenario === "building") {
    ev("participant.joined", { kind: "human", id: sam.id, name: sam.name, color: sam.color }, "Sam Okafor joined", { participant: sam }, 3, 3_000);
    return {
      workspace: { ...baseWorkspace, revision: 3, requirements, plan: plan3, artifact: artifact1, buildStatus: "writing", buildError: null, activeRevision: 3, pendingRevision: null },
      participants: [maya, aditya, sam],
      agents: [
        mkAgent("architect", { status: "done", statusDetail: "Plan r3 handed to the Builder", currentTaskId: null }),
        mkAgent("builder", { status: "working", statusDetail: "Writing files for r3 (3 of 3)", currentTaskId: t7.id }),
        mkAgent("reviewer", { status: "waiting", statusDetail: "Waiting for the r3 deploy", currentTaskId: t8.id }),
      ],
      tasks,
      events,
      now,
    };
  }

  if (scenario === "failed") {
    const error = "Deploy stage failed: local executor could not write data/artifacts/ws_demo_northstar/3/app.js (EACCES: permission denied).";
    t7.status = "failed";
    t7.error = error;
    t7.finishedAt = t + 9_000;
    ev("build.failed", agentActor("builder"), "Build failed for r3", { revision: 3, executor: "local", error }, 3, 9_000);
    ev("task.failed", agentActor("builder"), "Task failed: Build site for r3", { task: t7 }, 3, 300);
    ev("error", agentActor("builder"), "Builder stopped: the deploy did not complete", { stage: "deploy", error }, 3, 200);
    t8.status = "superseded";
    return {
      workspace: { ...baseWorkspace, revision: 3, requirements, plan: plan3, artifact: artifact1, buildStatus: "failed", buildError: error, activeRevision: null, pendingRevision: null },
      participants: [maya, aditya, sam],
      agents: [
        mkAgent("architect", { status: "idle", statusDetail: "Plan r3 is ready; waiting on a successful build" }),
        mkAgent("builder", { status: "error", statusDetail: error, currentTaskId: t7.id }),
        mkAgent("reviewer", { status: "idle", statusDetail: "Nothing to review until r3 deploys" }),
      ],
      tasks,
      events,
      now,
    };
  }

  // scenario === "live": r3 shipped and reviewed.
  t7.status = "done";
  t7.output = "3 files written; 2 changed vs r1.";
  t7.finishedAt = t + 8_500;
  const artifact3: Artifact = {
    id: "art_3",
    workspaceId: WS_ID,
    revision: 3,
    files: SAMPLE_FILES,
    previewUrl: previewUrl(3),
    executor: "local",
    sandboxId: null,
    verification: "passed",
    verificationNotes: null,
    changedFiles: ["index.html", "app.js"],
    builtAt: t + 8_500,
  };
  ev("build.succeeded", agentActor("builder"), "r3 is live", { previewUrl: previewUrl(3), revision: 3, changedFiles: ["index.html", "app.js"], executor: "local", sandboxId: null, ms: 8_512 }, 3, 8_500);
  ev("task.completed", agentActor("builder"), "Task completed: Build site for r3", { task: t7 }, 3, 300);
  ev("agent.handoff", agentActor("builder"), "Builder → Reviewer: r3 deployed", { from: "builder", to: "reviewer", summary: "Pricing defaults to yearly with the badge, and the header has a theme toggle seeded from the system preference.", items: ["index.html", "app.js"] }, 3, 800);
  t8.status = "done";
  t8.startedAt = t + 500;
  t8.finishedAt = t + 9_000;
  t8.output = "Passed, 6 of 6 checks.";
  ev("task.started", agentActor("reviewer"), "Task started: Review r3", { task: { ...t8, status: "running" } }, 3, 500);
  ev("review.completed", agentActor("reviewer"), "Review for r3: passed", {
    verdict: "passed",
    notes: "Both open requirements landed. Yearly is selected on load with the Save 20% badge, and the theme toggle follows prefers-color-scheme then flips on click.",
    blocking: [],
    checks: [
      { name: "Preview responds 200", ok: true, detail: "GET /index.html?v=3 in 41ms" },
      { name: "Doctype and title present", ok: true, detail: "" },
      { name: "Local script/style references resolve", ok: true, detail: "styles.css, app.js" },
      { name: "Requirement keywords in index.html", ok: true, detail: "yearly, Save 20%, theme" },
      { name: "Yearly selected by default", ok: true, detail: "aria-pressed=true" },
      { name: "Theme toggle present in header", ok: true, detail: "#theme-toggle" },
    ],
  }, 3, 8_500);
  ev("task.completed", agentActor("reviewer"), "Task completed: Review r3", { task: t8 }, 3, 300);
  ev("agent.message", agentActor("reviewer"), "Clean pass. If anyone wants the headline to name freelancers, that is still the one soft note from r1.", {}, 3, 1_500);

  return {
    workspace: { ...baseWorkspace, revision: 3, requirements, plan: plan3, artifact: artifact3, buildStatus: "live", buildError: null, activeRevision: null, pendingRevision: null },
    participants: [maya, aditya, sam],
    agents: [
      mkAgent("architect", { status: "done", statusDetail: "Plan r3 shipped" }),
      mkAgent("builder", { status: "done", statusDetail: "r3 live on the local executor" }),
      mkAgent("reviewer", { status: "done", statusDetail: "r3 passed 6 of 6 checks" }),
    ],
    tasks,
    events,
    now,
  };
}
