# Relay — demo clip, shot by shot (50 s, screen only)

The in-person skit carries the hook and the problem. This clip starts at the solution: a room that
already has two humans and three agents in it. Style reference is maxleedev's "canvas for LLMs" post
(https://x.com/maxleedev/status/1962938769914658984): one clean window, fast auto-zooms to wherever
the action is, oversized cursor, motion-blurred pans, steady music, no voice. Recorded in one take with
Screen Studio and finished in its editor. Only Freestyle and RunAnywhere Wally are named on screen.

Companion files: `DEMO.md` (stage run-of-show), `scripts/demo-grace.sh` (plays the second human for
rehearsals and as backup).

## The brief the agents build

Ada types (fast, no typos; the zoom follows the caret):

```
how do i vibecode an app to rizz up my highschool crush: pickup lines, a compatibility quiz, a send-a-note form
```

Grace's mid-build change, sent the moment the green `r1 is live` row lands:

```
She said yes. Pivot the app to planning senior prom and add a promposal ideas section.
```

Rehearse this pair once with the script before the real take. If the Builder stumbles on it, fall
back to the Berkeley housing pair in `DEMO.md`, which is the one every number below was measured on.

Real timings from this afternoon's persisted runs (`data/relay.json`, workspaces `9x15ni6h4e` and
`qngc87hdkb`): Architect plan 3.6–4.5 s, Builder r1 about 19 s, first deploy live in 1.9–2.0 s,
impact assessment 4.5 s, rebuild about 17 s, r2 live in 0.3–0.8 s, Reviewer 20–22 checks. The take runs
about 52 s real; the edit brings it to 50 with two labelled time-lapses.

## Screen Studio settings (what makes the reference look the way it does)

| Setting | Value |
| --- | --- |
| Recording | Screen, with Chrome fullscreen (Ctrl+Cmd+F) so no tabs or URL bar are captured |
| Background | macOS Sequoia wallpaper, dark variant (Relay's UI is dark) |
| Padding / corners / shadow | about 4%, 14 px radius, shadow on |
| Cursor | size 2.5×, smoothing on, motion blur on, click highlight off |
| Zoom | automatic, speed "fast", about 3× on typing; hand-placed zooms for rows that land without a keystroke |
| Motion blur | on (this is the "smooth" in the reference: every pan blurs the whole frame) |
| Export | 60 fps, 1080p, original aspect, H.264 mp4 |
| Audio | mic off; one steady instrumental track around -14 dBFS, no fades mid-clip |

## Prep (5 minutes)

- `DEMO.md` checklist: keys loaded, `/api/health` says wally + Freestyle, one warm-up run done.
- Chrome: one window at `http://localhost:3000`, fullscreen, zoom 110%, nothing else open. Fullscreen
  Chrome is its own Space, so the terminal is never in shot.
- Create the workspace off camera (name it `crush app`, you are Ada). Have Grace join before you hit
  record, either a real person on a second laptop opening the share link, or the script:

```bash
scripts/demo-grace.sh
```

  Started before the workspace exists, it adopts the next one you create, joins as Grace at once, and
  sends her change half a second after the Reviewer starts on r1 (that is the window the real runs
  used). `--dry` rehearses everything except the send.
- Park the mouse in the empty timeline, hold still 1 s, start recording with the hotkey.

Honest version of "Human B on camera": if Grace is a real person on a second Mac, have that Mac run
its own Screen Studio recording of the same room at the same time, and cut to it for 3 s while she
types. Two real recordings of one real room, no re-enactment. Single-window fallback: her row and
her avatar are the evidence, and the skit has already introduced her.

## Shot list

Video time is after the edit. Camera notes are Screen Studio zooms; most are automatic.

| # | Video | Real action | Camera | Speed | On screen |
| --- | --- | --- | --- | --- | --- |
| 1 | 0:00–0:03 | Nothing. Mouse still. | Wide. | 1× | Two avatars in the top bar, three idle agent cards with their models, empty timeline, empty Preview. Optional caption for the first 2 s: "Two humans. Three agents. One live workspace." |
| 2 | 0:03–0:09 | Click the composer, type the brief, Enter. | Auto zoom ~3× on the caret. | 2× on the typing | Mode tab reads **Requirement**, send button in the accent colour. |
| 3 | 0:09–0:13 | Wait. | Zoom out, then 1.6× on the Agent team panel. | 1× | Architect flips to **Thinking** with a running timer; `Ada set the brief` and the task rows land; the plan row with the model's own sentence about what it decided. |
| 4 | 0:13–0:18 | Wait. Builder is working (about 19 s real). | Same 1.6× on the cards. | 4×, corner label "4×" | Builder **Working** with its timer counting, Reviewer **Waiting**. |
| 5 | 0:18–0:23 | Wait. Hover **Open** for one beat so the tooltip shows the `relay-<id>.style.dev` URL. | Hand-placed 1.4× on the Preview panel. | 1× | Green row `r1 is live on Freestyle VM in 2.0s`; the site renders in Preview; **Live** pill in the top bar; the public URL in the tooltip. |
| 6 | 0:23–0:28 | Grace sends her change (real person on the green row, or the script). | Hand-placed 1.8× on the timeline the frame her row lands. Optional 3 s cut to Grace's recording. | 1× | `Grace changed the requirements → r2`, then the amber `Requirements changed mid-build (r1 → r2)` row naming the stale task. |
| 7 | 0:28–0:32 | Nothing. | Pan to the Agent team panel at 1.8×, then back to the timeline. | 1× | Reviewer's r1 task struck through with a **Stale** chip; Architect `Assessing impact of r2` with its own timer; then `Plan revised for r2: N affected, 0 added, 0 removed` with the rationale. |
| 8 | 0:32–0:40 | Nothing. Builder rewrites (about 17 s real). | Wide, then hand-placed 1.4× on Preview as the flip happens. | 2× on the rewrite, label "2×"; 1× from the deploy row on | Builder **Working** again; `r2 is live on Freestyle VM in 0.8s`; the preview flips from rizz to prom in one frame. This is the shot. |
| 9 | 0:40–0:46 | Click **Show checks** on the Reviewer row. | 1.8× on the checks list, 2 s. | 1× | `Review of r2: passed (22 checks ok)` and the list, written by a different model than the Builder. Stop recording here. |
| 10 | 0:46–0:50 | End card (added in the edit). | Static. | 1× | Relay wordmark, "Build together. With everyone. Including your agents." Small line under it: "Freestyle + RunAnywhere Wally · built at c0mpiled-14". |

Numbers on rows are whatever the take produces. Do not retake for a different number; retake only if
the cascade row does not appear (Grace was late) or the Builder fails.

## Edit pass

1. Trim the head to the settled wide shot and the tail right after the checks list is readable.
2. Check the automatic zooms: keep the one on typing, delete any on incidental clicks, add the
   hand-placed ones from the table.
3. Two speed ramps only, shots 4 and 8, each with a small corner label ("4×", "2×") so the
   time-lapse is declared. Everything else at 1×.
4. Cursor 2.5×, smoothing on; hide it during shots 4, 7 and 8 if it drifts.
5. Music from frame one, trimmed to length, no ducking. Instrumental.
6. End card 4 s: background `#0b0b0c`, text `#f3f1ec`, the app's wordmark and tagline, sponsor line
   in the small mono style. Export from Figma or Keynote as a PNG and append it.
7. Export 60 fps, 1080p, H.264. The first frame must read on its own: X autoplays muted.

## Live run, step by step (what Ada does, in order)

Rehearsal on Oct 17 at 4:03 PM (workspace `minq26yf00`, crush brief + prom change): plan 3.4 s, r1 live in
2.7 s, Grace's change landed 0.7 s after that during the review, plan revised (5 affected, 1 added, 1 removed),
r2 live in 0.8 s, review passed 18 checks, 55 s end to end. The r2 page opens on "She said yes — now plan the
perfect prom" with a promposal generator, a prom quiz and a note form, so the flip is obvious in one frame.

**T-10 min**
1. `npm run dev` is up; `curl localhost:3000/api/health` shows wally + Freestyle. `.env.local` has
   `RELAY_BUILDER_MODEL=mimo-v2.6-pro` (keeps the Builder near 20 s).
2. Screen Studio open, settings from the table above, hotkey for start/stop known. Music track and the
   end-card PNG already in a folder.
3. Chrome: one window, `http://localhost:3000`, zoom 110%, fullscreen with Ctrl+Cmd+F. Dock hidden.
4. Grace is ready: a real person with the share link on a second laptop (on the same Wi-Fi, LAN URL from
   `/api/health`) watching for the green `r1 is live` row, or the terminal in another Space with
   `scripts/demo-grace.sh` started and waiting.

**T-2 min**
5. Create workspace off camera: name `crush app`, your name `Ada`, **Create workspace**.
6. Confirm Grace's avatar is next to yours in the top bar (she clicked the link, or the script printed
   `Grace joined`). The room now shows two humans, three idle agents, an empty timeline.
7. Mouse into the empty timeline area. Hands off for 2 s.

**Record (about 60 s real time)**
8. Hit the Screen Studio hotkey. Count 2 s without moving.
9. Click the composer. Type, at speed, no corrections:
   `how do i vibecode an app to rizz up my highschool crush: pickup lines, a compatibility quiz, a send-a-note form`
   Press Enter. Leave the mouse where it is.
10. Watch the left panel: Architect **Thinking** with a timer, then the plan row (about 4 s). Do nothing.
11. Builder **Working** (about 20 s). Do nothing. Mouse still. This stretch becomes the 4× time-lapse.
12. Green row `r1 is live on Freestyle VM in N s` and the preview renders. Move the mouse to **Open** in the
    Preview header and hover for one beat so the `relay-<id>.style.dev` tooltip shows. Do not click it.
13. Grace sends her change the instant the green row lands (real Grace: she is watching for it; script: it
    fires 0.5 s into the review). On your screen: `Grace changed the requirements → r2`, then the amber
    `Requirements changed mid-build (r1 → r2)` row. Do nothing; let the camera sit on it.
14. Left panel: Reviewer's `Review r1` struck through with **Stale**, Architect `Assessing impact of r2`
    with a timer; then `Plan revised for r2: N affected, ...` lands (about 4 s). Do nothing.
15. Builder **Working** again (about 17 s). Do nothing. This becomes the 2× time-lapse.
16. `r2 is live on Freestyle VM in N s` and the preview flips to the prom page. Do nothing for 3 s.
17. `Review of r2: passed (N checks ok)`. Click **Show checks**. Hold 3 s. Hit the hotkey to stop.

**If something goes wrong during the take**
- No amber row after Grace's change (she was late and nothing was in flight): stop, create a fresh
  workspace, go again. This is the only reason to retake.
- Builder red `Request timed out`: stop, new workspace, go again. Rehearsal and the two afternoon runs all
  passed, so a third try is unlikely to be needed.
- A different number on a row than the ones quoted here: keep it. Real is the point.

**Edit (15 min)**
18. Trim: head to the settled wide shot, tail after the checks list is readable.
19. Zooms: keep the automatic one on the typing; add hand-placed zooms for shots 3, 5, 6, 7, 8 and 9 from the
    table; delete any zoom Screen Studio put on Esc or the hover.
20. Speed: shot 4 at 4× and shot 8 at 2×, nothing else. Add a small corner label on each ("4×", "2×").
21. Cursor 2.5× with smoothing; hide it in shots 4, 7 and 8 if it drifted.
22. Music from frame one, trimmed, no ducking. Append the 4 s end card: wordmark, tagline, the line
    "Freestyle + RunAnywhere Wally · built at c0mpiled-14".
23. Export 60 fps, 1080p, H.264. Play the first 2 s muted at full size; it has to read without sound.
24. Post the mp4 natively on X; repo and sponsor credits go in the first reply.
