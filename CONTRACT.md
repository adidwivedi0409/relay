# Relay — module contract (read before writing code)

Stack: Next.js 16 App Router (src/ dir, `@/*` alias), TypeScript strict, Tailwind v4 (tokens in
src/app/globals.css: colors bg-0..4, line-0..2, fg-0..3, accent, ok/warn/err/info, architect/builder/reviewer),
`motion` (import from "motion/react"). Node 24. No Supabase: realtime is server-side SSE from one Next server.
Shared types: `src/lib/types.ts` — import everything from there. Do NOT redefine types.
Route params in Next 16 are Promises: `const { id } = await params`. Mark client components with "use client".
Keep all secrets server-side (process.env in src/lib/**, never NEXT_PUBLIC_).

## src/lib/store.ts  (owner: agent A)
Singleton in-memory store persisted to `data/relay.json` (debounced write, 250ms). Survive HMR via globalThis.
```ts
export const store: {
  // workspaces
  createWorkspace(name: string, executor: ExecutorKind): Workspace;
  getWorkspace(id: string): Workspace | null;
  updateWorkspace(id: string, patch: Partial<Workspace>): Workspace;   // emits {kind:"workspace"}
  listWorkspaces(): Workspace[];
  // participants
  upsertParticipant(wsId: string, p: {id: string; name: string}): Participant; // assigns color from HUMAN_COLORS deterministically by join order; emits participants frame
  heartbeat(wsId: string, participantId: string): void;               // bumps lastSeen; emits participants frame if changed online set
  getParticipants(wsId: string): Participant[];
  // agents (3 created per workspace on createWorkspace with provider/model from llm.describeProvider())
  getAgents(wsId: string): Agent[];
  getAgent(wsId: string, role: AgentRole): Agent;
  setAgent(wsId: string, role: AgentRole, patch: Partial<Agent>): Agent; // emits {kind:"agent"}
  // tasks
  createTask(t: Omit<Task,"id"|"createdAt"|"startedAt"|"finishedAt"|"status"|"output"|"error"> & Partial<Task>): Task; // emits {kind:"task"}
  updateTask(id: string, patch: Partial<Task>): Task;                 // emits {kind:"task"}
  getTasks(wsId: string): Task[];
  getTask(id: string): Task | null;
  // requirements
  addRequirement(wsId: string, text: string, author: {id: string; name: string}): { workspace: Workspace; requirement: Requirement }; // revision++ ; does NOT emit the requirement.added event (caller does via emit)
  // events
  emit(wsId: string, e: Omit<RelayEvent,"id"|"seq"|"createdAt"|"workspaceId"|"revision"> & {revision?: number}): RelayEvent; // appends, assigns seq, broadcasts {kind:"event"}
  getEvents(wsId: string, sinceSeq?: number): RelayEvent[];
  snapshot(wsId: string): WorkspaceSnapshot;
  // pub/sub for SSE
  subscribe(wsId: string, fn: (frame: SseFrame) => void): () => void;
  broadcast(wsId: string, frame: SseFrame): void;
}
```
Also export `participantsFrame(wsId)` helper and `const ONLINE = (p, now) => now - p.lastSeen < PRESENCE_TTL_MS`.

## API routes (owner: agent A)  — all under src/app/api
- POST /api/workspaces            body {name, participant:{id,name}} → {workspace, participant}. Creates agents, emits workspace.created + participant.joined. Executor = env FREESTYLE_API_KEY ? "freestyle" : "local".
- GET  /api/workspaces/[id]       → WorkspaceSnapshot (404 if missing)
- POST /api/workspaces/[id]/join  body {participant:{id,name}} → {participant}; emits participant.joined only if new.
- POST /api/workspaces/[id]/heartbeat body {participantId} → {ok:true}
- GET  /api/workspaces/[id]/events  SSE. `?since=<seq>` optional. On connect send {kind:"snapshot"}, then frames; ping every 15s. Set headers: text/event-stream, no-cache, keep-alive, X-Accel-Buffering: no. Use `export const dynamic = "force-dynamic"`. Clean up subscription on abort. Each SSE message is `data: <json>\n\n`.
- POST /api/workspaces/[id]/messages body {participantId, text, kind:"requirement"|"chat"} → {ok:true, event}.
    - "chat": emits human.message only.
    - "requirement": calls store.addRequirement (revision++), emits requirement.added {payload:{requirement, revision}} then calls `orchestrator.onRequirementAdded(wsId, requirement)` from src/lib/orchestrator.ts (fire-and-forget, errors caught & emitted as "error" events). Return immediately.
- GET  /api/workspaces/[id]/artifact/[[...path]]  (owner: agent C) serves local-executor artifact files for preview fallback.
- GET  /api/health → {ok, provider: llm.describeProvider(), executor: executor kind, freestyle: boolean}

## src/lib/llm.ts (owner: agent B)
```ts
export type ChatMessage = { role: "system"|"user"|"assistant"; content: string };
export interface LlmResult { text: string; provider: string; model: string; ms: number; usage?: {input?: number; output?: number} }
export async function complete(opts: { messages: ChatMessage[]; temperature?: number; maxTokens?: number; json?: boolean; label?: string; }): Promise<LlmResult>;
export function describeProvider(): { provider: string; model: string; configured: boolean };
export async function verifyProvider(): Promise<{ ok: boolean; provider: string; model: string; detail: string }>; // e.g. GET /v1/models for wally and check model id exists; cache result 60s
```
Providers in order unless RELAY_LLM_PROVIDER forces: wally (OpenAI-compatible via `openai` pkg, baseURL WALLY_BASE_URL default https://inference.runanywhere.ai/v1, apiKey RUNANYWHERE_API_KEY, model WALLY_MODEL default glm-5.3-flash; if the configured model is not in /v1/models pick the first listed and log it) → anthropic (@anthropic-ai/sdk, ANTHROPIC_MODEL default claude-sonnet-5-5) → openai. Retry once on 429/5xx with backoff. 60s timeout. If a provider call throws and another provider is configured, fall back and tag result.provider accordingly. Also export `extractJson(text)` (strips ```json fences, finds first {...} or [...]) and `parseFiles(text)` that parses the file block format below.

## File block format the Builder emits (owner: agent B, consumed by C)
```
<<<FILE index.html>>>
...content...
<<<END FILE>>>
```
Parse into ArtifactFile[]. Paths relative, no leading slash, no "..".

## src/lib/agents/*.ts + src/lib/orchestrator.ts (owner: agent B)
Three independent agents, each its own module with its own system prompt and its own `complete()` calls (never one call that fabricates all three):
- architect.ts: `plan(ctx: {workspace: Workspace; previousPlan: Plan|null; requirements: Requirement[]}) => Promise<Plan>` — JSON. On revision (previousPlan present) must fill `delta` (affected/added/removed component ids + rationale) and keep stable component ids where the component persists.
- builder.ts: `build(ctx: {plan: Plan; requirements: Requirement[]; previousFiles: ArtifactFile[]|null; delta: PlanDelta|null; reviewNotes?: string|null}) => Promise<{files: ArtifactFile[]; summary: string}>` — emits full site as file blocks: a single-page static site: `index.html`, `styles.css`, `app.js` (vanilla, no build step, no external deps except Google Fonts allowed). On revisions, rewrite only affected components but return the FULL file set (previous content for untouched files passed back in). Enforce: premium design, responsive, semantic HTML, working interactive JS (e.g. filters, tabs, form validation). Max output ~ 6000 tokens; if a model truncates, retry once asking for a tighter version.
- reviewer.ts: `review(ctx: {plan: Plan; requirements: Requirement[]; files: ArtifactFile[]; previewUrl: string|null; httpStatus: number|null}) => Promise<{verdict: "passed"|"warnings"|"failed"; notes: string; blocking: string[]; checks: {name: string; ok: boolean; detail: string}[]}>` — JSON. Also run deterministic checks before the model: every requirement keyword mentioned somewhere in index.html?, all `<script src>`/`<link href>` local refs exist in files, index.html contains <!doctype and <title>, preview returned 200.

orchestrator.ts — per-workspace runner, serialized per workspace (one build pipeline at a time), with the revision cascade:
```ts
export const orchestrator: {
  onRequirementAdded(wsId: string, requirement: Requirement): Promise<void>;
}
```
Behaviour:
1. If no pipeline active for wsId → start `runPipeline(wsId, targetRevision = workspace.revision)`.
2. If a pipeline IS active → set workspace.pendingRevision = workspace.revision, emit `revision.cascade` (actor: system, message like "Requirement changed mid-build (r3 → r4). Marking in-flight work stale.") and mark running tasks `stale` (emit task.stale); set architect status "thinking" with detail "Assessing impact of r4"; and immediately run an *impact assessment* architect call in parallel (architect.plan with previousPlan) so the new plan is ready; the active pipeline checks `pendingRevision` at every stage boundary and, if set, abandons its current stage result (does not write files), emits task.superseded... then restarts the pipeline at the new revision with the new plan. Previous live artifact is kept until the new build succeeds.
3. runPipeline stages (each emits task.created/started/completed + agent.status frames, and agent.message with a short first-person summary of what the agent decided — must come from the model output, not canned text):
   a. Architect: plan → store.updateWorkspace({plan}), emit plan.created|plan.revised with payload {plan}. Emit agent.handoff architect→builder with the component list / delta.
   b. Builder: build → emit agent.handoff builder→reviewer; call `executor.deploy(wsId, files, revision)` (src/lib/executor/index.ts) → updates buildStatus provisioning/writing/building/live, emits build.started / build.succeeded {previewUrl, changedFiles} / build.failed {error}. On failure keep previous artifact; builder status error; emit error; stop (no fake success).
   c. Reviewer: review → emit review.completed {verdict, checks, notes}; update artifact.verification. If verdict failed with blocking items AND no revision pending → one bounded fix pass: builder.build(reviewNotes) → deploy → review again (max 1 retry).
   d. All agents → status idle/done, workspace.activeRevision=null. If pendingRevision set → loop.
4. Every model call wrapped: set agent status "thinking" (detail), on error set "error" + emit error with the real message. Tasks have a 120s timeout each (Promise.race) → task.failed.
5. Never emit a success event before the underlying operation resolved.

## src/lib/executor/index.ts (+ freestyle.ts, local.ts) (owner: agent C)
```ts
export interface DeployResult { previewUrl: string; sandboxId: string|null; executor: ExecutorKind; httpStatus: number|null; logs: string[] }
export const executor: {
  kind(): ExecutorKind;                         // "freestyle" if FREESTYLE_API_KEY else "local"
  deploy(wsId: string, files: ArtifactFile[], revision: number, onProgress: (status: BuildStatus, detail: string) => void): Promise<DeployResult>;
  getArtifactFile(wsId: string, path: string): Promise<{content: string|Uint8Array; contentType: string}|null>; // local only
}
```
freestyle.ts (sdk `freestyle` v0.2.x): `import { Freestyle } from "freestyle"`; `const fs = new Freestyle({ apiKey })`.
- First deploy for a workspace: `fs.vms.create({ slug: "relay-"+wsId, displayName, firewall: { rules: [{ action: "allow", source: {}, destination: { public: true } }] }, idleTimeoutSeconds: 3600, metadata: { app: "relay", workspace: wsId } })` → `{ vm, vmId }`. Store vmId in workspace.sandboxId. If a VM with that slug already exists (error) use `fs.vms.ref(slug)`.
- Write files: `vm.fs.mkdir("/srv/app")` then `vm.fs.writeTextFile("/srv/app/"+path, content)` per file.
- Serve: write `/etc/systemd/system/relay-app.service` running `python3 -m http.server 3000 --directory /srv/app` (WorkingDirectory /srv/app, Restart=always) ; `vm.exec({command: "systemctl daemon-reload && systemctl enable --now relay-app", timeoutMs: 60000})`. (Check `python3 --version` via exec; if missing try `busybox httpd -f -p 3000 -h /srv/app` or `node -e` static server written to /srv/serve.js — probe with exec first.)
- Expose: domain `relay-<wsId>.style.dev` (lowercase, [a-z0-9-]) via `fs.tls.rules.create({ action: "allow", domain, source: { public: true }, destination: { vmId, port: 3000 } })`. Only create once per workspace (remember rule id in memory / workspace metadata; tolerate "already exists" errors). previewUrl = `https://${domain}`.
- Verify: poll `fetch(previewUrl, {cache:"no-store"})` up to 20s until 200 → httpStatus. On later revisions, just rewrite files (python http.server serves fresh files) and re-verify by fetching `previewUrl + "/?v=" + revision`.
- Any SDK error → throw Error with a clear message (name the stage). Never fall back to local silently; the caller surfaces the error.
local.ts: writes files to `data/artifacts/<wsId>/<revision>/` and returns previewUrl = `${NEXT_PUBLIC_APP_URL||http://localhost:3000}/api/workspaces/<wsId>/artifact/index.html?v=<revision>`; getArtifactFile reads from the latest revision dir. Route handler: `src/app/api/workspaces/[id]/artifact/[[...path]]/route.ts` serving with correct content types (html/css/js/svg/png/json), `Cache-Control: no-store`.
Also `export async function verifyFreestyle(): Promise<{ok:boolean; detail:string}>` which lists VMs (cheap auth check) — used by /api/health and the scripts/verify-freestyle.ts smoke test.

## Client (owner: agent D)  src/app/w/[id]/page.tsx + src/components/**
- Hook `useWorkspace(id)` in src/hooks/useWorkspace.ts: connects EventSource to /api/workspaces/[id]/events, applies frames into state (snapshot → full; event → append (dedupe by id); workspace/agent/task → replace; participants → set), exposes {snapshot, connected, send(text, kind)}. Reconnect with backoff using ?since=lastSeq. Heartbeat POST every 5s. Identity in localStorage key `relay:identity` = {id, name}; if missing show a small name modal before joining (POST join).
- Layout: top bar (wordmark "Relay" + workspace name + revision pill "r4" + connection dot + stacked human avatars (initials, colored ring, online pulse) + Share button copying URL + "Live" badge). 3-column: left 280px Agent team; center timeline (flex-1); right 44% Live artifact. Bottom composer spanning center column: textarea, Enter to send as requirement, Shift+Enter newline, toggle "Requirement / Note" (requirement = changes the spec and triggers agents; note = chat only), hint text.
- Agent cards: name, role color dot with status pulse when thinking/working, provider·model mono caption, status detail line, current task title, tiny progress of tasks (done/total for this agent in current revision). Error state visible in red with message.
- Timeline: grouped by revision ("Revision 1 · r1" dividers). Row types: human.message / requirement.added (author avatar, text, "changed requirements → r4" tag), agent.message (agent color, first-person text), agent.handoff (compact "Architect → Builder" chip row with summary), task.* (status chips), plan.created/revised (collapsible plan card with components; revised shows delta with affected components highlighted), build.* (status rows with preview link), review.completed (checks list with ✓/✗ rendered as icons not emojis), revision.cascade (prominent amber row: "r3 → r4 · in-flight work marked stale"), error (red). Auto-scroll to bottom when near bottom. Animate insertion with motion (opacity/y 6px, 200ms, respects reduced motion).
- Right panel tabs: Preview (iframe of artifact.previewUrl with key=revision so it reloads; loading/empty/failed states; "Open ↗" button; building overlay shimmer while buildStatus != live/idle, but keep previous iframe visible underneath), Files (list artifact.files; click → code view in mono, highlight changedFiles), Plan (current plan components + delta). Header shows build status chip (idle/provisioning/writing/building/live/failed) with the executor label ("Freestyle VM" or "Local fallback") and sandbox id truncated.
- Empty state (no requirements yet): centered gentle prompt in timeline with 3 example requirement chips that fill the composer.
- Use motion for: initial stagger (panels), presence avatars (layout animations), status transitions, timeline insertion. Keep 150–350ms. prefers-reduced-motion honored.

## Landing (owner: agent E) src/app/page.tsx
Minimal premium landing: wordmark, tagline "Build together. With everyone. Including your agents.", one-line explanation, a "Create workspace" form (workspace name + your name) → POST /api/workspaces → router.push(`/w/${id}`), and a "Join with link" input accepting a URL or id. Show system status strip from /api/health (provider · executor) rendered honestly. No hero illustrations. Staggered fade-in.

## scripts/ (owner: agent C and B)
- scripts/verify-freestyle.ts: create VM, exec `echo ok`, write file, serve, expose, fetch 200, print URL, then delete VM (flag --keep to keep). Run with `npx tsx`.
- scripts/verify-llm.ts: calls llm.verifyProvider() and one tiny completion; prints provider/model/ms.

## VERIFIED Freestyle facts (live smoke test 14:24 PDT — executor MUST follow these)
- `vm.exec` runs as user `ubuntu` (uid 1000) with passwordless sudo. **Every systemctl call must be `sudo systemctl …`**; writing to /etc via `vm.fs.writeTextFile` works as-is. Without sudo, `systemctl enable --now` fails with "Access denied" and the service stays inactive.
- Base image: Ubuntu 24.04, python3 3.12 present, systemd present. `python3 -m http.server 3000 --bind 0.0.0.0 --directory /srv/app` as a systemd unit works and is reachable from the edge.
- Firewall used: `[{ action:"allow", source:{}, destination:{ public:true } }, { action:"allow", source:{ public:true }, destination:{ port:3000, protocol:"tcp" } }]` (both; harmless).
- `tls.rules.create({ action:"allow", domain:"<slug>.style.dev", source:{ public:true }, destination:{ vmId, port:3000 } })` works instantly; **the public URL returns 502 for a few seconds before the first 200** → poll until 200 (up to ~45s), treat 502/000 as "not yet".
- VM create → exec → fs writes → tls rule all complete in well under 2s. Public fetch must use a timeout (AbortSignal.timeout(8000)) or it can hang.
