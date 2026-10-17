# Relay — live demo runbook (canonical)

This file is the single source of truth for what happens on stage. `VIDEO.md` is the 50-second
screen clip and uses the **same brief pair, the same Grace timing and the same numbers** as this file.
If the two ever disagree, this file wins for the stage and `VIDEO.md` wins for the clip.

Running order in the room: in-person skit (hook + problem) → this live demo → the 50 s clip only if
the network dies.

## Cast and devices

| Role | Person | Device | Opens |
| --- | --- | --- | --- |
| Ada (driver) | presenter | the laptop on the projector | `http://localhost:3000` in Chrome, 110% zoom, fullscreen |
| Grace (second human) | teammate | second laptop or phone on the venue Wi-Fi | the Share link, or the QR from the Share button |
| Judges (optional) | anyone | their phones | the same QR; they join as themselves and see it live |

Backup Grace: `scripts/demo-grace.sh` plays her from a terminal with the exact timing used in rehearsal.
Prefer the real person; use the script if the second device cannot connect.

## The brief pair (identical in VIDEO.md)

Requirement 1, Ada:

```
how do i vibecode an app to rizz up my highschool crush: pickup lines, a compatibility quiz, a send-a-note form
```

Requirement 2, Grace, sent the moment the green `r1 is live` row appears:

```
She said yes. Pivot the app to planning senior prom and add a promposal ideas section.
```

Fallback pair if the Builder stumbles on the first (this is the pair every number below was first
measured on):

```
Build a premium marketplace landing page for Berkeley students looking for apartments and roommates.
```
```
Change the target audience to graduating students and add a roommate matching section.
```

Keep both pairs in a notes app so they can be pasted, not typed.

## Measured timings (today, persisted in data/relay.json)

| Step | Time |
| --- | --- |
| Architect plan | 3.6–4.5 s |
| Builder writes 3 files | about 19 s |
| First deploy to a public style.dev URL | 1.9–2.0 s |
| Impact assessment after the change | about 4.5 s |
| Rebuild of affected components | about 17 s |
| Redeploy of r2 | 0.3–0.8 s |
| Reviewer | 15–22 checks, about 10 s |
| Brief → r2 live and reviewed | about 55 s |

## T-minus 10 minutes

1. Terminal in the repo: `curl -s localhost:3000/api/health`. It must show `"provider":"wally"`,
   `"executor":"freestyle"`, `"freestyle":true`, `"wally":true` and a `lanUrl`. If the server is not
   running: `npm run dev` from `hackathons/relay`. Never start a second server on port 3000.
2. Landing page status strip reads `inference · wally` and `execution · Freestyle VM`.
3. Warm-up: create a throwaway workspace, paste requirement 1, wait for `r1 is live`, close the tab.
   This warms Wally and proves Freestyle before anyone is watching.
4. Second device opens `http://10.43.253.125:3000` (re-check the IP with `ipconfig getifaddr en0` if
   the Wi-Fi changed). If it cannot, open a Chrome private window on the laptop as Grace instead.
5. Chrome on the projector: one tab, fullscreen (Ctrl+Cmd+F), 110% zoom, no bookmarks bar.
6. If using the script as Grace: in a second terminal run `scripts/demo-grace.sh` now. It waits for
   the next workspace you create, joins as Grace, and sends requirement 2 half a second after the
   Reviewer starts on r1. `scripts/demo-grace.sh --dry` rehearses without sending.

## T-minus 1 minute

- Landing page open, empty composer, mouse parked.
- Grace has the Share link ready but has not joined yet (her joining live is part of the show).
- Presenter has the notes app with the brief pair one Cmd+Tab away.

## The live run, step by step

Say the lines in the right column as written; they are the same lines as the clip's voiceover, so the
room hears one story twice.

| # | Who | Do exactly this | What the room sees | Say |
| --- | --- | --- | --- | --- |
| 1 | Ada | Type workspace name `crush app`, your name `Ada`, click **Create workspace**. | Empty workspace, `r0`, three idle agent cards showing their models. | "This is Relay. One live workspace for people and AI agents." |
| 2 | Ada | Click **Share**. Hold the QR up to the second device (or paste the link). | Invite popover with the QR and the LAN link. | "Grace, join from the link." |
| 3 | Grace | Open the link, type `Grace`, press Enter. | Second avatar appears in the top bar on both screens within a second. | "Two people, three agents, one room. Everything you see now is live for both of us." |
| 4 | Ada | Click the composer, paste requirement 1, confirm the tab says **Requirement**, press Enter. | `Ada set the brief`, Architect card flips to Thinking with a running timer. | "I describe what we want in plain language. The Architect plans it, the Builder writes real code, the Reviewer checks it. Three independent agents on open models through RunAnywhere." |
| 5 | Ada | Wait. Point at the plan card when it lands (about 4 s). | Plan card with 4–5 components and the Architect's own sentence about what it decided. Builder flips to Working, timer counting. | "The Architect just told the room what it decided, in its own words. Now the Builder is writing the site." |
| 6 | Ada | Wait about 20 s. Keep talking. Hover **Open** when the green row lands. | `r1 is live on Freestyle VM in 2.0s`, the site renders in Preview on both screens, `Live` pill, public URL in the tooltip. | "The app runs inside a real Linux VM on Freestyle, and the moment it passes a live check, everyone sees it at a public URL." |
| 7 | **Grace** | **The moment the green row lands**, paste requirement 2 as a Requirement and press Enter. The Reviewer should be running on r1. | `Grace changed the requirements → r2`, then the amber `Requirements changed mid-build (r1 → r2)` row naming the stale task. | "Now the part nobody else does. Grace changes the requirements while the agents are still working." |
| 8 | Ada | Point at the left panel, then the timeline. | Reviewer's r1 task gets a Stale chip. Architect: `Assessing impact of r2` with its timer. Then `Plan revised for r2: N affected` with the rationale. | "Relay marks the old work stale and the Architect re-plans only what changed." |
| 9 | Ada | Wait about 17 s. Click the **Plan** tab if you need to fill time; it shows the delta with affected components highlighted. | Builder Working again, then `r2 is live on Freestyle VM in 0.8s`, and the preview flips from the crush app to the prom planner on both screens at once. | "The Builder rebuilds it, and the app updates for the whole room at once." |
| 10 | Ada | Click **Show checks** on the Reviewer row. | `Review of r2: passed (N checks ok)` with the list. | "The Reviewer verifies it against both requests, on a different model than the Builder wrote it with. Every line in this feed is a real state change." |
| 11 | Ada | Click the **Map** tab. | Live graph: humans → revisions → agents → components → builds → verdicts. | "That is the whole room at a glance." |
| 12 | Ada | Click the phone icon next to **Open** and hold the QR up. | QR of the public style.dev URL. | "And it is a real URL. Scan it. Relay: build together, with everyone, including your agents." |

Total about 90 s with the talking. The agents need about 55 s of it.

## Judge questions you can answer live

- **"What if a third person changes it again?"** Paste another requirement during the r2 build. A
  second cascade fires; a still-running impact assessment is itself superseded by the newer one.
- **"Is the preview real?"** Open it in a new tab, or let them scan the phone QR. It is served from the
  Freestyle VM at `https://relay-<id>.style.dev`.
- **"Which models?"** Point at the agent cards: Architect and Reviewer on GLM-5.3-flash, Builder on
  MiMo-v2.6-pro, all through RunAnywhere Wally. The card shows the model that actually answered.
- **"What is not real?"** Nothing in the timeline is canned. The only fallback in the codebase is a
  clearly labelled local static host used when there is no Freestyle key; it is not in use today.

## If something goes wrong

- **Builder row turns red** (timeout or truncation): say it plainly, point out that nothing was marked
  done and the last good preview is still live, then have Grace send requirement 2 anyway. The
  pipeline re-plans and rebuilds from a fresh task.
- **Status strip says local fallback**: the Freestyle key did not load. Restart `npm run dev`. If there
  is no time, continue; the UI labels the fallback honestly and the cascade is unchanged.
- **Grace's device cannot connect**: use the Chrome private window on the laptop, or start
  `scripts/demo-grace.sh <workspace-id>` in the terminal; it joins and sends her change on cue.
- **Cascade row does not appear**: Grace sent too late (nothing was in flight). Say "no in-flight work,
  so Relay simply builds r2" and continue; r2 still ships.
- **Connection dot turns amber**: the client reconnects with `?since=<seq>` and backfills; keep talking.
- **Network dead**: play the 50 s clip from `VIDEO.md`, then show `/dev/preview` (renders every row
  type from a fixture) and the persisted run at `GET /api/workspaces/qngc87hdkb`.

## After the demo

- Leave the workspace open on the projector; judges can keep sending requirements.
- Do not delete the Freestyle VMs until after judging; they pause themselves after an hour idle.
