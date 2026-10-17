# Relay — demo run-of-show

Total: 90 seconds on stage, plus a 60-second buffer for the first Builder generation. Two humans
(driver = Ada on the laptop, second = Grace on a second laptop or phone). One workspace.

## Pre-demo checklist (10 minutes before)

- [ ] `.env.local` has `RUNANYWHERE_API_KEY` and `FREESTYLE_API_KEY` set (no quotes, no trailing spaces).
- [ ] Dev server running on `http://localhost:3000` (`npm run dev`); do not start a second server on 3000.
- [ ] `curl -s localhost:3000/api/health` returns `"ok":true`, `"provider":{"provider":"wally","model":"glm-5.3-flash","configured":true}`, `"executor":"freestyle"`, `"freestyle":true`, `"wally":true`.
- [ ] Landing page status strip reads `inference  wally / glm-5.3-flash` and `execution  Freestyle VM` (if it says "local fallback", the Freestyle key is not loaded; restart the server).
- [ ] `npm run verify:llm` prints `verify: ok` and a sub-2s completion.
- [ ] `npm run verify:freestyle` ends with `HTTP 200` and `VM deleted` (about 15 s). Skip if you ran it in the last hour and nothing changed.
- [ ] Second device on the same Wi-Fi can open `http://10.43.253.125:3000` (LAN URL of this laptop; re-check with `ipconfig getifaddr en0` if the network changed).
- [ ] Two browser windows side by side on the laptop as a backup for the second device (use a private window so it gets its own `relay:identity`).
- [ ] Browser zoom 110–125% so the timeline is legible from the back of the room; close other tabs.
- [ ] A fresh workspace name ready ("Berkeley housing"), and both requirement strings in a notes app to paste:
  1. `Build a premium marketplace landing page for Berkeley students looking for apartments and roommates.`
  2. `Change the target audience to graduating students and add a roommate matching section.`
- [ ] Optional warm-up 5 minutes before: create a throwaway workspace and send requirement 1 so Wally and Freestyle are warm, then close it.

## Run-of-show

| Clock | Who | Action | What to point at | Say |
| --- | --- | --- | --- | --- |
| 0:00–0:10 | Ada | Landing page already open. Create workspace "Berkeley housing", name "Ada". | Status strip: wally + Freestyle VM. | "AI tools are single-player. Relay is one room for several humans and several agents." |
| 0:10–0:20 | Grace | Click Share on Ada's screen (copies link), open it on the second device, enter "Grace". | Both avatars in the top bar within a second; revision pill `r0`. | "Grace joins from the link. Same timeline, same agents, same preview, for everyone." |
| 0:20–0:35 | Ada | Paste requirement 1, mode = Requirement, press Enter. | Left panel: Architect pulses "thinking". Timeline: `Ada set the brief`, task rows, then the plan card (6 components) and the Architect's first-person message. | "Three separate models on RunAnywhere Wally. The Architect plans and tells the room what it decided, in its own words." |
| 0:35–0:45 | Ada | Wait for `Architect → Builder` handoff; Builder goes "thinking". | Reviewer card: "Waiting for a live preview of r1". | "Builder writes the site now. Reviewer is blocked on a real URL, not on a promise." |
| 0:45–1:05 | **Grace** | **While the Builder is still working**, paste requirement 2 as a Requirement, press Enter. | Amber row: `r1 → r2 · in-flight work marked stale` with the stale task named. Architect flips to "Assessing impact of r2" while Builder is still busy. Revision pill `r2`. | "This is the multiplayer moment. Grace changes the brief mid-build. In-flight work is marked stale, and the Architect assesses the impact in parallel." |
| 1:05–1:20 | Ada | Open the plan card for r2. | Delta: 6 affected, 0 added, 0 removed; rationale explains the roommate section already exists, so it is deepened, not duplicated. `Architect → Builder: rebuild 6 of 6 components for r2`. | "Same component ids, copy retargeted to graduating students. It even caught that the roommate section already shipped." |
| 1:20–1:30 | Ada | Close. | Build rows when they land: `Deploying r2 to Freestyle VM`, `r2 is live on Freestyle VM in N s`, preview flips on both screens, Reviewer checks list. | "Every row is a real state transition. No canned text, no fake success. Relay makes AI a multiplayer teammate." |

If the build finishes during the talk, click **Open** on the preview and show `https://relay-<id>.style.dev`
on the second device too: it is a public URL served from the VM.

## Timing notes (from today's real runs)

- Architect plan: 10–16 s on `glm-5.3-flash`.
- Freestyle: VM create ~0.2 s, first deploy to public HTTPS 200 ~10 s, redeploy ~1 s.
- Builder: the long one. Budget 60–120 s for the first full site; this is the stage being tuned.
  Start talking over it; do not wait in silence.

## If something goes wrong

- **Builder shows red "Request timed out"**: say it plainly ("the Builder's long generation timed out
  on the inference side; notice nothing was marked done and the previous artifact stays live"), then
  send the next requirement; the pipeline re-plans and retries from a fresh task.
- **Status strip says local fallback**: the Freestyle key did not load. Restart `npm run dev` from the
  repo root. If there is no time, continue; the UI labels the fallback honestly and the cascade demo is
  unchanged.
- **Second device cannot connect**: use the second browser window on the laptop. The multiplayer
  evidence is the two avatars and both timelines updating together.
- **Dropped SSE connection**: the client reconnects automatically with `?since=<seq>` and backfills.
  The connection dot in the top bar shows the state.
- **Judge asks "what if a third person changes it again?"**: do it live. A requirement during the r2
  build produces another cascade; a still-running impact assessment is itself superseded by the newer one.

## Backup evidence (if the network is dead)

- `README.md` quotes the real r1 → r2 cascade from workspace `s5vf6qd7om`, event by event, with model
  timings.
- `GET /api/workspaces/s5vf6qd7om` on the laptop still serves that persisted log from `data/relay.json`.
- `/dev/preview` renders every timeline row type and panel state from a fixture without any network.

## Added at 3:50 PM (all additive, pipeline untouched)

- **Invite judges' phones:** the Share button now opens a QR of the LAN URL (`http://10.43.253.125:3000/w/<id>`). Phones must be on the same Wi-Fi.
- **Open the live app on a phone:** the phone icon next to Open in the artifact header shows a QR of the public style.dev preview.
- **Agent timers:** working agents show a live elapsed clock, so a 25-second Builder run reads as progress, not a hang.
- **Model families:** Architect and Reviewer run on GLM-5.3-flash, the Builder on MiMo-v2.6-pro (set via `RELAY_*_MODEL`); each card shows the model that actually answered. Say it out loud: the Reviewer critiques work written by a different model.
- **Map tab (if present):** a live React Flow map of humans, revisions, agents, plan components, builds and verdicts. Open it after the cascade for the "whole room at a glance" shot.
