# Relay

**Build together. With everyone. Including your agents.**

Relay is one shared, live workspace where several humans and three autonomous agents work on the
same evolving software project. Humans write and change requirements in plain language. An
**Architect**, a **Builder** and a **Reviewer** plan, write, deploy and verify a working site inside an
isolated Linux VM. Every connected person sees the same timeline, the same agent state and the same
running preview at the same moment.

Built at **c0mpiled-14, UC Berkeley, October 17, 2026** for YC's Fall 2026 RFS *Multiplayer AI*.

- Sponsor stack: **Freestyle** (sandboxed VMs + public HTTPS previews) and **RunAnywhere Wally** (inference).
- Repo tour: `src/lib/**` is the engine, `src/app/api/**` the wire protocol, `src/app/w/[id]` + `src/components/**` the room.
- See `DEMO.md` for the run-of-show and `SUBMISSION.md` for the pitch and judge Q&A.

## What makes it multiplayer: cascading revisions

Every workspace carries a monotonically increasing **revision** (`r1`, `r2`, ...). Each requirement
records the revision that introduced it, and every agent task records the revision it was planned
against (`baseRevision`). When a second human changes requirements while agents are mid-build,
Relay does not queue the change behind the current build and it does not throw the build away blindly:

1. The requirement is persisted and the revision bumps (`requirement.added`).
2. The orchestrator sets `pendingRevision`, emits `revision.cascade`, and marks every running or
   queued task **stale** (`task.stale`). A stale task may finish, but its result can no longer become
   the live artifact.
3. The Architect starts an **impact assessment** immediately, in parallel with whatever stage is still
   finishing: a re-plan against the previous plan that must keep stable component ids and fill a
   `delta` (affected / added / removed components + rationale).
4. The running pipeline checks `pendingRevision` at every stage boundary. Whatever it was doing is
   **superseded** (task status `superseded`, output discarded), and the loop restarts at the new
   revision using the plan the impact assessment already produced.
5. The Builder rewrites only the affected components (untouched files are passed back in verbatim),
   redeploys to the same VM, the Reviewer re-verifies, and only then the preview flips for everyone.
   The previous artifact stays live until the new build has returned HTTP 200.

Every timeline row is a real state transition. No success event is emitted before the operation it
describes has resolved.

## Architecture

```
  Browser A ─┐                                                  ┌─ Architect  (model call, JSON plan + delta)
  Browser B ─┼─ EventSource ⇄  Next.js 16 server (one process)  ┼─ Builder    (model call, <<<FILE>>> blocks)
  Phone    ─┘   SSE + REST      │                                └─ Reviewer   (deterministic checks + model verdict)
                                │
               ┌────────────────┴──────────────────┐             ┌────────────────────────────────────────────┐
               │ store.ts  (authoritative, in-mem) │             │ executor/freestyle.ts                      │
               │  workspaces · participants        │             │  vms.create → vm.fs.writeTextFile /srv/app │
               │  agents · tasks · event log (seq) │ ──deploy──▶ │  systemd: python3 -m http.server 3000      │
               │  pub/sub per workspace            │             │  tls.rules.create → https://relay-<id>.style.dev
               │  persisted to data/relay.json     │ ◀─HTTP 200──│  verify by fetch (poll ≤45s, 8s timeout)   │
               └───────────────────────────────────┘             └────────────────────────────────────────────┘
                                │                                   (no key: executor/local.ts writes
               orchestrator.ts: one pipeline per workspace,          data/artifacts/<id>/<rev>/ and serves it
               revision cascade, stale/supersede, 300s task          from /api/workspaces/<id>/artifact/…)
               timeout, one bounded fix pass
```

**One process, one truth.** `src/lib/store.ts` is a singleton (kept on `globalThis` so Next dev HMR
cannot fork it) holding workspaces, participants, agents, tasks and an append-only event log with a
per-workspace `seq`. Writes are debounced (250ms) to `data/relay.json`, so a server restart replays
the room. There is no Supabase and no third-party realtime service.

**Realtime is server-sent events.** `GET /api/workspaces/[id]/events` sends a full `snapshot` frame on
connect, then `event`, `workspace`, `agent`, `task`, `participants` and `ping` (15s) frames. A client
that drops reconnects with `?since=<seq>` and receives only the events after that sequence plus fresh
mutable state. Presence is a 5s heartbeat with a 15s TTL; identity lives in `localStorage` as
`relay:identity`.

**Three agents, three brains.** Each agent is its own module with its own system prompt and its own
`complete()` calls; nothing fabricates all three in one shot. The timeline's first-person agent
messages are the model's own output (the plan summary or delta rationale, the build summary, the review
notes), never canned strings. Agent cards show the provider and model that actually answered, including
fallbacks.

| Module | Role |
| --- | --- |
| `src/lib/orchestrator.ts` | Per-workspace run loop: plan → build → deploy → review, cascade handling, `SupersededError`, 300s hard task timeout, max 1 fix pass. |
| `src/lib/agents/architect.ts` | JSON plan with components, design tokens and (on revisions) a delta. Code, not the model, decides which ids were truly added/removed. |
| `src/lib/agents/builder.ts` | Emits the full site as `<<<FILE path>>>...<<<END FILE>>>` blocks (`index.html`, `styles.css`, `app.js`). On truncation, one retry with a tighter brief. Previous files are merged back for untouched components. |
| `src/lib/agents/reviewer.ts` | Deterministic checks first (doctype, title, local refs exist, no external scripts, preview returned 200, requirement keyword coverage per revision), then a model verdict. A hard check failing forces `failed`. |
| `src/lib/llm.ts` | OpenAI-compatible adapter for Wally, with Anthropic and OpenAI as optional fallbacks. `GET /v1/models` liveness check cached 60s, one retry on 429/5xx, per-call timeouts. |
| `src/lib/executor/freestyle.ts` | One VM per workspace (`relay-<id>`), files under `/srv/app`, systemd unit `relay-app`, style.dev TLS rule, HTTP verification. Redeploys reuse the VM and only rewrite files. |
| `src/lib/executor/local.ts` | Clearly labelled fallback when no Freestyle key is set. |
| `src/hooks/useWorkspace.ts` | EventSource client: snapshot/delta application, resume with `?since`, backoff, heartbeat. |

### API

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/workspaces` | Create a workspace and its three agents; seats the creator. |
| `GET` | `/api/workspaces/[id]` | Full `WorkspaceSnapshot` (workspace, participants, agents, tasks, events). |
| `POST` | `/api/workspaces/[id]/join` | Idempotent join; emits `participant.joined` only once per person. |
| `POST` | `/api/workspaces/[id]/heartbeat` | Presence. |
| `POST` | `/api/workspaces/[id]/messages` | `{kind:"chat"}` emits `human.message`; `{kind:"requirement"}` bumps the revision, emits `requirement.added` and kicks the orchestrator without awaiting it. |
| `GET` | `/api/workspaces/[id]/events` | SSE stream, `?since=<seq>` to resume. |
| `GET` | `/api/workspaces/[id]/artifact/[[...path]]` | Serves the local-fallback artifact. |
| `GET` | `/api/health` | `{ok, provider:{provider,model,configured}, executor, freestyle, wally}`; the landing page renders exactly this. |

### Event types

`workspace.created`, `participant.joined`, `participant.left`, `human.message`, `requirement.added`,
`revision.cascade`, `agent.status`, `agent.message`, `agent.handoff`, `task.created`, `task.started`,
`task.stale`, `task.completed`, `task.failed`, `plan.created`, `plan.revised`, `build.started`,
`build.succeeded`, `build.failed`, `review.completed`, `error`.

Task statuses are `queued → running → done | failed`, plus `stale` (requirements moved past the task's
`baseRevision` while it ran) and `superseded` (a finished-but-stale task whose output was discarded;
emitted as a `task.stale` event with `payload.superseded: true`). Workspace build statuses are
`idle | provisioning | writing | building | live | failed`.

## What happens when a human changes requirements mid-build

This is the real event log of workspace `s5vf6qd7om` ("Berkeley housing"), fetched from
`GET /api/workspaces/s5vf6qd7om` during the sprint. Two humans, Ada and Grace. Times are relative to
the first event; messages are quoted verbatim.

```
#4   +1.1s   requirement.added   Ada        Ada set the brief
                                             "Build a premium marketplace landing page for Berkeley students looking for apartments and roommates."
#5   +1.1s   agent.status        Architect  Architect thinking: Planning r1: Build a premium marketplace landing page…
#7   +1.1s   task.started        Architect  Architect started: Plan r1
#8   +14.0s  task.completed      Architect  Architect finished: Plan r1
#9   +14.0s  plan.created        Architect  Plan for r1: 6 components for UC Berkeley undergrad and grad students hunting for
                                             apartments and roommates near campus, most of them first-time renters worried about
                                             scams, broker fees, and ending up with the wrong roommate.
#10  +14.0s  agent.message       Architect  I'm building a premium marketplace landing page for Berkeley students that leads with
                                             verified apartment listings as the centerpiece and pairs them with an interactive
                                             roommate-matching form, all in a Berkeley blue-and-gold palette that signals trust
                                             without feeling corporate.                      (wally / glm-5.3-flash, 10,466 ms)
#12  +14.0s  agent.handoff       Architect  Architect → Builder: build 6 components for r1
#14  +14.0s  agent.status        Reviewer   Reviewer waiting: Waiting for a live preview of r1
#17  +14.0s  task.started        Builder    Builder started: Build site for r1

#18  +26.2s  requirement.added   Grace      Grace changed the requirements → r2
                                             "Change the target audience to graduating students and add a roommate matching section."
#19  +26.2s  revision.cascade    Relay      Requirement changed mid-build (r1 → r2). Marking in-flight work stale.
#20  +26.2s  task.stale          Builder    Build site for r1 is now stale (planned against r1, requirements are at r2)
#21  +26.2s  agent.status        Architect  Architect thinking: Assessing impact of r2
#23  +26.2s  task.started        Architect  Architect started: Assess impact of r2        ← runs while the Builder is still busy
#24  +42.4s  task.completed      Architect  Architect finished: Assess impact of r2
#25  +42.4s  plan.revised        Architect  Plan revised for r2: 6 affected, 0 added, 0 removed
#26  +42.4s  agent.message       Architect  For r2 I'm keeping all six component ids and retargeting their copy and data to
                                             graduating students — a commencement-to-lease hero, 12-month listings with June
                                             move-ins and first-job price bands, a post-grad roommate form, and grad testimonials.
                                             The roommate matching section already shipped in r1, so I'm not adding a duplicate;
                                             I'm deepening the existing one for post-grad matching instead.
                                                                                            (wally / glm-5.3-flash, 16,185 ms)
#32  +114.0s agent.handoff       Architect  Architect → Builder: rebuild 6 of 6 components for r2
#35  +114.0s agent.status        Builder    Builder thinking: Rewriting Hero, Why Grads Trust Us, Verified Listings Grid for r2
#37  +114.0s task.started        Builder    Builder started: Rebuild affected components for r2
```

Read it top to bottom: the r1 Builder task is marked stale the instant Grace's requirement lands, the
Architect's impact assessment starts in the same tick and finishes 16s later with a delta that keeps all
six component ids (and notices that the "new" roommate section already exists, so it deepens it instead
of duplicating it), and the pipeline restarts at r2 with that plan and the new Builder brief.

Honest footnote on that run: both Builder generations (`#30`, `#38`) ended with
`All model providers failed — wally: Request timed out.` The cascade logic did exactly what it should;
the long Builder output on Wally is the stage still being tuned (larger per-request timeout, optional
`RELAY_BUILDER_MODEL`). The deploy path is verified independently below.

## Sponsor technology, exactly as used

| Layer | Technology | What Relay actually does with it | Verified today |
| --- | --- | --- | --- |
| Execution + preview | **Freestyle** (`freestyle` SDK v0.2.20) | `vms.create` with slug `relay-<workspaceId>`, two firewall rules and a 1h idle timeout; `vm.fs.writeTextFile` into `/srv/app`; a systemd unit running `python3 -m http.server 3000` (installed with `sudo` via `vm.exec`, which runs as `ubuntu`); `tls.rules.create` for `relay-<id>.style.dev`; the public URL is polled until it returns 200 before anything is called live. Later revisions reuse the VM and rewrite files only. | `npm run verify:freestyle` at 14:58 PDT: VM created in 194 ms (Ubuntu 24.04, 4 vCPU / 8 GiB), first deploy to public HTTPS 200 in 9.8 s, second revision on the same VM in 0.8 s, `vm.exec echo ok` in 90 ms, VM and TLS rule deleted after. |
| Agent inference | **RunAnywhere Wally** (OpenAI-compatible, `https://inference.runanywhere.ai/v1`) | Architect, Builder and Reviewer each call `chat.completions` with their own prompts. `GET /v1/models` is checked at boot (today it lists `glm-5.3-flash`, `deepseek-v4.1-flash`, `mimo-v2.6-pro`, `muse-spark`); if the configured model is missing the first listed one is used and logged. Anthropic / OpenAI are optional fallbacks and the UI shows which provider answered. Each agent can be pinned to a different Wally model family (RELAY_ARCHITECT_MODEL / RELAY_BUILDER_MODEL / RELAY_REVIEWER_MODEL); the UI shows the model that actually answered. | `npm run verify:llm`: `GET /v1/models lists "glm-5.3-flash"`, 20-token completion in 992 ms. In the live run above the Architect's plan calls took 10.5 s and 16.2 s. |
| Multiplayer sync | Server-side event log + SSE (own code) | One authoritative store, per-workspace sequence numbers, resumable streams, presence heartbeats. | Two-browser demo; `scripts/smoke-api.sh` creates a room, joins a second person and tails the stream. |
| Parallel coding agents | **Superset** | Evaluated, **not integrated**: no public SDK at the time of the sprint, and a single sandbox with explicit file ownership (Builder writes, Reviewer reads) was the reliable choice for a 1-day MVP. | n/a |

## Running it

Requirements: Node 24, npm.

```bash
npm install
cp .env.example .env.local      # add RUNANYWHERE_API_KEY and FREESTYLE_API_KEY
npm run dev                     # http://localhost:3000
```

Open the landing page, create a workspace with your name, copy the link into a second browser (or a
phone on the same network via `http://<lan-ip>:3000`), and type a requirement.

Without `FREESTYLE_API_KEY` the executor switches to a local static host: the artifact panel and the
landing status strip both say "local fallback", and previews are served from
`/api/workspaces/<id>/artifact/…`. It never pretends to be a VM.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js. |
| `npm run typecheck` | `tsc --noEmit` (strict). |
| `npm run verify:llm` | Provider check + one tiny completion, prints provider/model/ms. |
| `npm run verify:freestyle` | Real end-to-end Freestyle deploy of a 3-file site, redeploy, then delete (`-- --keep` to keep the VM). |
| `npm run verify:local` | Same for the local fallback executor. |
| `npm run smoke:api` | Create a room over HTTP, join, heartbeat, chat, snapshot, tail SSE (`-- --requirement` also kicks the agents). |

### Environment variables

| Variable | Required | Meaning |
| --- | --- | --- |
| `RUNANYWHERE_API_KEY` | yes (or a fallback key) | Wally cloud key. |
| `WALLY_BASE_URL` | no | Default `https://inference.runanywhere.ai/v1`. |
| `WALLY_MODEL` | no | Default `glm-5.3-flash`; checked against `/v1/models`. |
| `RELAY_BUILDER_MODEL` | no | Override the model for the Builder only (its outputs are the longest). |
| `RELAY_LLM_PROVIDER` | no | Force `wally`, `anthropic` or `openai` to the front of the order. |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `OPENAI_API_KEY`, `OPENAI_MODEL` | no | Fallback providers. |
| `FREESTYLE_API_KEY` | for real sandboxes | Without it, the local fallback executor is used and labelled. |
| `RELAY_PREVIEW_DOMAIN_SUFFIX` | no | Default `style.dev`. |
| `NEXT_PUBLIC_APP_URL` | no | Public origin of this server; used for local-fallback preview links and metadata. Set it to your LAN URL when a second device must load local previews. |
| `RELAY_DATA_DIR` | no | Where `relay.json` and local artifacts live (default `./data`). |

All secrets stay server-side (`process.env` inside `src/lib/**`); nothing sensitive is `NEXT_PUBLIC_`.

## Known limits

- One Next.js process owns the state. That is the right shape for a hackathon and for a single
  deployment; a multi-instance deployment would need the store behind a shared log.
- The Builder produces a static site (`index.html`, `styles.css`, `app.js`); the sandbox serves it as
  files. The VM is general-purpose, the generator is not yet.
- Long Builder generations on Wally can exceed the per-request timeout; the task then fails loudly
  (`task.failed` + `error`), the previous artifact stays live, and nothing is marked done.

## Stack

Next.js 16 (App Router, `src/`), React 19, TypeScript strict, Tailwind v4, `motion`, `zod`, `nanoid`,
`openai` (for the OpenAI-compatible Wally endpoint), `@anthropic-ai/sdk`, `freestyle`.
