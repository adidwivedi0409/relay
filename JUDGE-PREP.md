# Relay — judge prep: what we do, how we do it, and mock Q&A

## What Relay is

Relay is a live, shared workspace where several humans and several autonomous AI agents build one
software project together. Humans write and change requirements in plain language. Three agents, an
Architect, a Builder and a Reviewer, plan, write and verify real code. The code runs inside an isolated
Linux VM on Freestyle and the running application is published at a public HTTPS URL that everyone in
the room sees at the same time. The agents are independent model calls on open models served by
RunAnywhere Wally. Nothing in the timeline is scripted: every row is a real state transition that
happened on the server.

The signature behaviour is the **revision cascade**. A workspace carries a monotonically increasing
revision number. Every agent task records the revision it was planned against. When a second human
changes the requirements while agents are mid-build, Relay bumps the revision, marks the in-flight
tasks stale so they can never overwrite the artifact, runs an Architect impact assessment concurrently
with whatever stage is finishing, produces a plan delta (which components are affected, added, removed
and why), restarts the Builder on only the affected components with the previous files as context,
redeploys, re-verifies, and only then swaps the preview for the whole room. The previous artifact stays
live until the new one passes a real HTTP check.

## How it works, layer by layer

**Multiplayer state.** One Node server (Next.js 16) holds the authoritative state for each workspace:
requirements, plan, tasks, agents, participants, artifact, and an append-only event log with a
per-workspace sequence number. It is persisted to disk and reloaded on restart. Every browser opens a
Server-Sent Events stream and receives a snapshot followed by delta frames (event, workspace, agent,
task, participants). Presence is a heartbeat every 5 seconds; a person is online if seen in the last 15.
Reconnects resume from the last sequence number, so a dropped Wi-Fi does not lose rows.

**Agents.** Each agent is its own module with its own persona, output contract and model call.
The Architect returns a structured plan (audience, components with stable ids and file ownership,
design tokens, and on revisions a delta with a first-person rationale). The Builder returns the full
site as file blocks (index.html, styles.css, app.js) and on revisions must preserve untouched
components verbatim. The Reviewer first runs deterministic checks in code (doctype and title present,
every local script and stylesheet reference exists, no external scripts, the preview returned HTTP 200,
plan sections present, selectors used by the JS exist in the HTML, requirement keyword coverage, no
placeholder copy, responsive CSS) and then asks a model to judge against the requirements, quoting
evidence. The agents communicate through the shared task state and typed events: plan.created,
agent.handoff, task.started, build.succeeded, review.completed, revision.cascade, task.stale and so on.

**Inference.** The model adapter talks to RunAnywhere Wally's OpenAI-compatible endpoint. The
Architect and Reviewer run on GLM-5.3-flash; the Builder runs on MiMo-v2.6-pro, so the Reviewer
critiques code written by a different model family. We verify the model list at boot, disable the
models' extended reasoning for latency (GLM otherwise thinks for about two minutes before writing
code), cap output with a hard size budget, retry once on truncation, and record on every agent card
which provider and model actually answered. The adapter can fall back to Anthropic or OpenAI if keys
are present; today it runs entirely on Wally.

**Execution.** On the first build of a workspace the executor provisions a Freestyle VM with an
explicit firewall, writes the generated files with the SDK's filesystem API, starts a static server as
a systemd unit, and routes a public `https://relay-<id>.style.dev` hostname to the VM's port with a
TLS rule. It then polls the public URL until it returns 200 and only then publishes the artifact. Later
revisions rewrite the files in place, so a redeploy takes under a second. Failures are surfaced as red
rows with the real error; the previous artifact stays live.

**Orchestration guarantees.** One pipeline per workspace at a time. Pending revision is checked at
every stage boundary. A plan older than the stored one is never written; an artifact older than the
live one is never stored. Each task has a timeout and ends in a terminal state. Agent statuses are
reset at the end of every run so nobody is left "thinking" after a failure. A no-network simulation
script asserts that one mid-build change and two rapid changes both converge on the latest revision.

**Interface.** Top bar with the workspace name, revision pill, live connection dot, presence avatars
and a Share button that shows a QR of the LAN URL. Left: the agent team with status, model, elapsed
timer and tasks. Center: the shared timeline grouped by revision, with human requirements, agent
first-person messages, handoffs, plan cards with deltas, build rows with the preview link, the amber
cascade row, and reviewer checks. Right: Preview (live iframe plus a QR to open it on a phone), Files,
Plan, and a live Map of humans, revisions, agents, components, builds and verdicts.

## Numbers from today's verified runs

| Step | Measured |
| --- | --- |
| Architect plan | 3.6–4.5 s |
| Builder writes 3 files | about 19 s |
| First deploy live at a public URL | 1.9–2.0 s |
| Impact assessment after a change | about 4.5 s |
| Rebuild of affected components | about 17 s |
| Redeploy of r2 | 0.3–0.8 s |
| Reviewer | 15–22 checks, about 10 s |
| Brief to r2 live and reviewed | about 55 s |

## Mock questions and answers

### Product and vision

**Q: In one sentence, what is Relay?**
A: One live workspace where people and AI agents build software together, and when anyone changes the
plan, the agents and the running app follow for everyone at once.

**Q: Why is this "multiplayer AI" and not a chat with three bots?**
A: Four kinds of interaction happen in one shared state: human to human (presence, notes, shared
history), human to agent (requirements that re-task agents), agent to agent (plan handoffs, review
verdicts fed back to the Builder), and agent to artifact (a real app running in a sandbox that everyone
can open). A chat with bots has none of the shared state and no artifact.

**Q: What is the one thing you want us to remember?**
A: The cascade. A teammate changed the requirements while the agents were mid-build, the system marked
the old work stale, re-planned only what changed, rebuilt, re-verified, and the app updated for the
whole room. You watched it happen live.

**Q: Who is this for?**
A: Small product teams that already run several AI coding sessions in parallel and lose context between
them: founders, hackathon teams, design-plus-engineering pairs, student clubs building a site together.

**Q: Why now?**
A: Agents got good enough to produce working software unattended, but every tool still assumes one
person per session. YC's own Fall 2026 request is for exactly this shared, long-running agent session.

### The cascade

**Q: What happens if another human changes the requirements while your agents are working?**
A: Do it live. The revision increments, in-flight tasks are marked stale and cannot write the artifact,
the Architect assesses impact concurrently and produces a delta, the Builder rebuilds only the affected
components with the previous files as context, the app redeploys, the Reviewer re-checks, and the
preview flips for everyone. The old preview stays up until the new one passes a real HTTP check.

**Q: What if two people change it within seconds of each other?**
A: The newest revision wins. A still-running impact assessment is itself superseded by the newer one,
and the loop always targets the latest revision. We have a no-network simulation that asserts both
one mid-build change and two rapid changes converge on the last revision with every task terminal.

**Q: How do you prevent the stale build from overwriting the new one?**
A: Every task carries the revision it was planned against. Before any plan or artifact is stored, the
orchestrator compares revisions; anything older than what is live is refused and recorded as superseded.

**Q: Does the Builder start from scratch on every change?**
A: No. It receives the previous files and the delta and must preserve untouched components verbatim.
That is why a redeploy of r2 is sub-second and why the design stays coherent across revisions.

**Q: Can a human stop or redirect an agent directly?**
A: Redirecting is the requirement change itself; that is the primary control. A hard stop button is not
in this build; the next version adds abort of the in-flight model call on cascade so the restart is
immediate instead of waiting for the stale call to finish.

### Agents and models

**Q: Are these really three agents or one prompt pretending?**
A: Three separate model invocations with separate prompts, output contracts and state. Each agent card
shows the provider and model that answered its last call, and the server log records per-call latency
and tokens. The Architect's plan and the Builder's files are different requests to different models.

**Q: Which models, and why those?**
A: Architect and Reviewer on GLM-5.3-flash, Builder on MiMo-v2.6-pro, all through RunAnywhere Wally.
GLM gives reliable JSON for planning and review; MiMo was the fastest model we measured for long code
output, around 480 tokens per second. Running the Reviewer on a different family from the Builder means
the critique is not the same model grading itself.

**Q: What did you learn about running open models for agents?**
A: Reasoning modes are the hidden latency. GLM thought for about 110 seconds before emitting code until
we disabled extended reasoning per request; after that the same build took 20 seconds. Output budgets
matter too: without a hard size budget the Builder hits the token ceiling and truncates. We measured
throughput per model before choosing.

**Q: How do agents talk to each other?**
A: Through typed events and shared task state, not free text. The Architect emits a plan and a handoff
with the component list; the Builder emits files and a handoff to the Reviewer; the Reviewer emits a
verdict with checks and blocking items, which can trigger one bounded fix pass by the Builder.

**Q: What stops an agent from claiming success?**
A: It cannot. Success events are emitted by the orchestrator after the underlying operation resolves:
build.succeeded only after the public URL returns 200, review.completed only after the checks ran. The
model's text never sets status.

**Q: What if the Builder writes broken code?**
A: The Reviewer's deterministic checks catch missing files, broken selectors and external scripts
before the model even judges it. A failed verdict with blocking items triggers one Builder fix pass. A
model error or timeout shows as a red row with the actual error, and the previous artifact stays live.

### Infrastructure and sponsors

**Q: Why Freestyle? Couldn't you just render HTML in an iframe?**
A: An iframe would be a mockup. With Freestyle each workspace gets a real Linux VM, the agents write
files to a real filesystem, a real server serves them, and the app lives at a public HTTPS URL that a
judge's phone can open. That is also what lets us verify with a real HTTP check before publishing, and
it is the path to agents that install packages and run backends, not just static pages.

**Q: What exactly do you call on Freestyle?**
A: Create a VM with an explicit firewall, write files through the SDK filesystem API, run a systemd
service for the static server, create a TLS rule that routes `relay-<id>.style.dev` to port 3000, and
poll the public URL. First deploy is about two seconds; redeploys rewrite files in under a second.

**Q: What exactly do you call on RunAnywhere?**
A: The OpenAI-compatible chat completions endpoint at inference.runanywhere.ai with a per-agent model
id, extended reasoning disabled, JSON mode for the Architect and Reviewer, and a model-list check at
boot. Every agent call in today's demo went through it.

**Q: Did you use Superset?**
A: We evaluated it and did not integrate it. There is no public SDK on npm today, and for this MVP one
sandbox with controlled file ownership was more reliable than several early-alpha workspaces. The idea
maps cleanly onto our task model as a next step: one worktree per component owner.

**Q: Why no Supabase?**
A: One authoritative server with an event log and SSE was the smallest thing that is genuinely
multiplayer, and it let us ship persistence, resume-from-sequence and crash recovery in an afternoon.
Swapping the store for Postgres plus realtime is a contained change behind the same interface.

**Q: What is mocked or faked?**
A: Nothing in the demo. The only fallback in the codebase is a clearly labelled local static host that
is used when there is no Freestyle key; the UI says "local fallback" when it is active, and it is not
active today.

### Reliability

**Q: What happens if the server restarts mid-demo?**
A: State is persisted to disk and reloaded; in-flight tasks are marked failed with an explanatory
message rather than left hanging, the artifact and timeline are intact, and clients reconnect and
resume from their last sequence number.

**Q: What if Wally is down?**
A: The adapter falls back to Anthropic or OpenAI if a key is configured and tags every result with the
provider that answered. If nothing is configured, the agent shows a red error with the real message and
nothing pretends to succeed.

**Q: What are the timeouts?**
A: Per-task timeouts with terminal states, a longer budget for the Builder's long generations, one retry
on truncation, and a bounded single fix pass after a failed review. No infinite loops: the orchestrator
loop has an iteration cap.

### Business

**Q: How do you make money?**
A: Per-seat workspaces for teams, with compute (sandbox minutes, inference) passed through at a margin.
The room is the product; the agents and sandboxes are the metered part.

**Q: Who are the competitors?**
A: Single-player coding agents (Cursor, Claude Code, Codex) and prompt-to-app builders (Lovable, v0).
They are strong at one person, one session. None of them have a shared room where several humans
re-task several agents and see one artifact update together.

**Q: What would you build next week?**
A: Abort-on-cascade so a stale model call stops instantly, token streaming of agent output into the
timeline, per-component ownership across parallel sandboxes, approval gates where a human must accept a
plan delta before the Builder runs, and a persistent store so rooms survive the laptop.

**Q: Why should you win the Multiplayer AI track?**
A: Because the demo answers the track's hardest question live: what happens when another human changes
the requirements while the agents are already working. Most teams can show agents building; we show a
room of people and agents staying coherent while the plan changes under them.

### Rapid-fire

**Q: How long did this take?** A: Built today, end to end, in about three hours of focused work.

**Q: How many lines of code?** A: Roughly twelve thousand lines of TypeScript across the server, agents,
executor and UI.

**Q: Can I join right now?** A: Yes. Scan the QR on the Share button; you will appear in the top bar and
can send a requirement.

**Q: Is the preview public?** A: Yes, `https://relay-<id>.style.dev`, served from the VM. Scan the
phone icon next to Open.

**Q: What model wrote the site I am looking at?** A: MiMo-v2.6-pro via RunAnywhere; the Builder card
says so.

**Q: Does it work on a phone?** A: The workspace is designed for a laptop; the preview and the invite
work on phones.

**Q: What breaks if ten people join?** A: Presence and the timeline scale fine; builds are serialized
per workspace, so ten simultaneous requirement changes collapse into cascades that converge on the
latest one.
