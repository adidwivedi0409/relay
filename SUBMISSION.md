# Relay — submission package

c0mpiled-14, UC Berkeley, October 17, 2026. Track: YC Fall 2026 RFS, *Multiplayer AI*.
Sponsors used: Freestyle, RunAnywhere Wally.

## Project description (150 words)

Relay is a shared, live workspace where several people and three autonomous agents build software
together. Humans write requirements in plain language. An Architect plans, a Builder writes the code,
and a Reviewer verifies it, each as a separate model with its own prompt and tasks, inside a real
Linux VM on Freestyle that serves a public HTTPS preview. Every participant sees the same timeline,
the same agent status and the same running site, streamed from one authoritative server over
server-sent events.

The multiplayer problem Relay solves is change. Every workspace has a revision number and every agent
task remembers the revision it was planned against. When someone changes the brief mid-build, Relay
marks in-flight work stale, runs an Architect impact assessment in parallel, computes a plan delta
with stable component ids, rebuilds only the affected parts, redeploys to the same VM, re-verifies, and
only then swaps the preview for everyone. Nothing is reported done before it actually is.

## 90-second pitch script

**0:00 – 0:10, the claim.**
"AI coding tools are single-player: one person, one chat, one agent. Real teams are not. Relay is one
workspace where several humans and several agents build the same project at the same time."

**0:10 – 0:25, the room.** (Two screens visible.)
"Ada creates 'Berkeley housing'. Grace joins from the link. Same timeline, same agents, same preview.
Ada writes the brief as a requirement: a premium marketplace landing page for Berkeley students."

**0:25 – 0:45, the agents.** (Point at the left panel and the timeline.)
"Three separate models on RunAnywhere Wally. The Architect posts a plan with six components and its
own one-line reasoning, hands off to the Builder, the Builder writes the site, and it deploys to a
Freestyle VM: real Linux, files on disk, a systemd server, a public style.dev URL. The build is not
'live' until that URL returns 200."

**0:45 – 1:15, the multiplayer moment.** (Grace types while the Builder is working.)
"Grace changes the audience to graduating students mid-build. Watch the amber row: r1 to r2, in-flight
work marked stale. The Architect assesses the impact in parallel while the Builder is still busy, and
comes back with a delta: same six component ids, copy retargeted, and it notices the roommate section
already exists so it deepens it instead of duplicating it. The Builder restarts on r2, redeploys to the
same VM, the Reviewer re-checks, and the preview flips on both screens at the same moment."

**1:15 – 1:30, the close.**
"Every row you saw was a real state transition, no canned text and no fake success. Relay turns AI
from a single-player assistant into a multiplayer teammate. We are Relay."

## Judge Q&A

**Show me the multiplayer moment.**
Two browsers on one workspace. One person submits a requirement while agents are mid-build. The
timeline shows `revision.cascade` ("Requirement changed mid-build (r1 → r2). Marking in-flight work
stale."), `task.stale` on the running Builder task, an Architect impact assessment that starts in the
same tick and runs concurrently, `plan.revised` with a delta (affected / added / removed component
ids), the pipeline restarting at r2, and the preview changing on both screens together. All of this is
in the event log of workspace `s5vf6qd7om`, quoted verbatim in `README.md`.

**Why does Freestyle matter here?**
Because the agents have to run something, not just write it. Each workspace gets its own VM
(`vms.create`, 194 ms in today's smoke test), the Builder's files are written to `/srv/app` with
`vm.fs.writeTextFile`, a systemd unit serves them, and `tls.rules.create` gives every room a public
`relay-<id>.style.dev` URL that a judge can open on a phone. Later revisions reuse the VM and rewrite
only files (0.8 s). The Reviewer's `preview-200` check and the "Live" badge are backed by a real fetch
of that URL. Without Freestyle we would be showing an iframe of a local file and calling it a deploy.

**Why Wally?**
It is an OpenAI-compatible endpoint, so one adapter serves all three agents; `GET /v1/models` lets us
verify the model at boot (today: `glm-5.3-flash`, with `deepseek-v4.1-flash`, `mimo-v2.6-pro`,
`muse-spark` also listed); and the plan calls were fast enough to make the cascade feel live
(10.5 s and 16.2 s for the two Architect calls in the real run). The adapter can fall back to
Anthropic or OpenAI, and the agent cards always show which provider actually answered.

**What is real and what is fallback?**
Real: the multi-human SSE workspace with presence and resumable streams, the three independent model
calls with first-person summaries taken from model output, the revision/stale/supersede cascade, the
Freestyle VM deploy with HTTP verification, the deterministic review checks, and the persisted event
log. Fallback, and labelled as such in the UI: a local static host when no Freestyle key is present,
and Anthropic/OpenAI when Wally is unavailable. Not integrated: Superset (evaluated, no public SDK).
Known soft spot: long Builder generations on Wally sometimes exceed the per-request timeout; the task
fails visibly (`task.failed` + `error`), the previous artifact stays live, and no success is faked. We
are tuning the timeout and allow a Builder-specific model via `RELAY_BUILDER_MODEL`.

**How is the Builder's rewrite scoped?**
The Architect's delta names affected component ids; each component owns files. The Builder receives
the previous files and the delta, returns the full file set, and the orchestrator diffs it to produce
`changedFiles` (shown in the Files tab). The Reviewer gets the plan, all requirements, the files, the
preview URL and the executor's HTTP status.

**What happens on failure?**
Deploy failure: `build.failed` with the real error, build status `failed`, previous artifact kept.
Review failure with blocking items: one bounded Reviewer → Builder fix pass, then re-deploy and
re-review. Model failure: `task.failed` + `error` event with the provider's message; agent card turns
red. Every task has a 300 s hard timeout.

## Team and credits

| Role | Name | Contact |
| --- | --- | --- |
| Founder / build | Aditya Dwivedi | adityadwivedi0409@gmail.com |
| Teammate | _name_ | _contact_ |
| Teammate | _name_ | _contact_ |

Built with Next.js 16, React 19, Tailwind v4 and `motion`. Thanks to Freestyle (VM sandboxes and
style.dev routing) and RunAnywhere (Wally inference) for the sponsor credits, and to the c0mpiled-14
organizers at Berkeley.

## Links

- Repository: _add URL_
- Demo video: _add URL_
- Live instance: _add URL_ (self-hosted; one Next.js process with `FREESTYLE_API_KEY` and `RUNANYWHERE_API_KEY`)
