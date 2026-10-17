#!/usr/bin/env bash
# Relay demo helper: plays "Grace", the second human, from a terminal, so her
# mid-build change lands at the right moment on a single-window recording.
# Use it for rehearsals and as the backup; a real second person on a second
# device is the honest version for the final take (see VIDEO.md).
#
#   scripts/demo-grace.sh                   # auto: adopts the next workspace you create in the browser
#   scripts/demo-grace.sh <id-or-share-url> # or an existing room
#   scripts/demo-grace.sh --dry             # everything except posting the requirement
#
# Sequence
#   1. Waits for a workspace: the one given, or the newest one created after this script started.
#   2. JOIN_AFTER seconds later joins as Grace (avatar in the top bar) and heartbeats every 5s.
#   3. Waits for the trigger, then AFTER seconds later posts REQUIREMENT_2 as a requirement:
#        TRIGGER=review  (default) a Reviewer task is running, i.e. r1 just went live and is being checked.
#                        This is the window the real runs used: r1 live, then the change, then the cascade.
#        TRIGGER=build   a Builder task is running (the change lands before r1 is ever live).
#        TRIGGER=live    the r1 artifact is live, whatever the agents are doing.
#      If nothing is in flight at fire time it warns: there will be no cascade row in that take.
#   4. Keeps Grace online (heartbeats) until you press Ctrl-C.
#
# Knobs (env): BASE=http://localhost:3000  NAME=Grace  JOIN_AFTER=0  AFTER=0.5  TRIGGER=review
#              REQUIREMENT_2="..."  (the change Grace sends)
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
NAME="${NAME:-Grace}"
JOIN_AFTER="${JOIN_AFTER:-0}"
AFTER="${AFTER:-0.5}"
TRIGGER="${TRIGGER:-review}"
REQUIREMENT_2="${REQUIREMENT_2:-She said yes. Pivot the app to planning senior prom and add a promposal ideas section.}"
DRY=0
WS_ARG=""
for arg in "$@"; do
  case "$arg" in
    --dry) DRY=1 ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    *) WS_ARG="$arg" ;;
  esac
done
case "$TRIGGER" in review|build|live) ;; *) echo "TRIGGER must be review, build or live" >&2; exit 2 ;; esac

START_MS="$(node -e 'process.stdout.write(String(Date.now()))')"
P_ID="demo-grace-$(date +%s)"

log()  { printf '[grace %s] %s\n' "$(date +%H:%M:%S)" "$*"; }
get()  { curl -sS -f "$BASE$1"; }
post() { curl -sS -f -X POST -H 'content-type: application/json' "$BASE$1" -d "$2"; }

# node helpers read JSON on stdin; argv[1] is a parameter.
newest_ws_after() {
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);let a=Array.isArray(o)?o:(o.workspaces||[]);a=a.filter(w=>typeof w.createdAt==="number"&&w.createdAt>Number(process.argv[1])).sort((x,y)=>y.createdAt-x.createdAt);process.stdout.write(a[0]?a[0].id:"")})' "$1"
}
# Prints "fire" when the trigger condition holds, "idle" when no task is in flight, "wait" otherwise.
trigger_state() {
  node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  const o=JSON.parse(s); const tasks=o.tasks||[]; const ws=o.workspace||{};
  const running=r=>tasks.some(t=>t.agentRole===r&&(t.status==="running"||t.status==="queued"));
  const inFlight=tasks.some(t=>t.status==="running"||t.status==="queued");
  const mode=process.argv[1];
  const hit = mode==="review" ? running("reviewer")
            : mode==="build"  ? running("builder")
            : (ws.buildStatus==="live" && ws.artifact && ws.artifact.revision>=1);
  process.stdout.write(hit?"fire":(inFlight?"wait":"idle"));
})' "$1"
}
in_flight() {
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);const t=(o.tasks||[]).filter(t=>t.status==="running"||t.status==="queued").map(t=>t.title);process.stdout.write(t.join(" | "))})'
}

# ── 1. which workspace ──────────────────────────────────────────────────────
WS=""
if [[ -n "$WS_ARG" ]]; then
  if [[ "$WS_ARG" =~ /w/([a-z0-9]{10}) ]]; then WS="${BASH_REMATCH[1]}"; else WS="$WS_ARG"; fi
  get "/api/workspaces/$WS" >/dev/null || { log "workspace $WS not found at $BASE"; exit 1; }
  log "using workspace $WS"
else
  get /api/health >/dev/null || { log "no server at $BASE (start it with npm run dev)"; exit 1; }
  log "armed. Create the workspace in the browser now; I will adopt the first one created from here on."
  while [[ -z "$WS" ]]; do
    WS="$(get /api/workspaces | newest_ws_after "$START_MS" || true)"
    [[ -n "$WS" ]] || sleep 1
  done
  log "adopted workspace $WS"
fi

# ── 2. join as Grace + heartbeat ────────────────────────────────────────────
[[ "$JOIN_AFTER" == "0" ]] || { log "joining as $NAME in ${JOIN_AFTER}s"; sleep "$JOIN_AFTER"; }
post "/api/workspaces/$WS/join" "{\"participant\":{\"id\":\"${P_ID}\",\"name\":\"${NAME}\"}}" >/dev/null
log "$NAME joined (avatar should be in the top bar now)"
(
  while true; do
    curl -sS -o /dev/null -X POST -H 'content-type: application/json' "$BASE/api/workspaces/$WS/heartbeat" -d "{\"participantId\":\"${P_ID}\"}" || true
    sleep 5
  done
) &
HB_PID=$!
trap 'kill "$HB_PID" 2>/dev/null || true' EXIT

# ── 3. wait for the trigger, then send the change ───────────────────────────
log "waiting for trigger '$TRIGGER' (send requirement 1 in the browser now)"
deadline=$(( $(date +%s) + 600 ))
seen_work=0
while :; do
  state="$(get "/api/workspaces/$WS" | trigger_state "$TRIGGER" || echo wait)"
  [[ "$state" == "wait" ]] && seen_work=1
  [[ "$state" == "fire" ]] && break
  (( $(date +%s) < deadline )) || { log "gave up after 10 minutes"; exit 1; }
  sleep 0.5
done
log "trigger hit. Posting ${NAME}'s change in ${AFTER}s"
sleep "$AFTER"
FLIGHT="$(get "/api/workspaces/$WS" | in_flight || true)"
if [[ -z "$FLIGHT" ]]; then
  log "WARNING: nothing is in flight right now, so this change will NOT cascade (no amber row). Consider TRIGGER=build."
else
  log "in flight now: $FLIGHT"
fi
BODY="{\"participantId\":\"${P_ID}\",\"text\":$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$REQUIREMENT_2"),\"kind\":\"requirement\"}"
if [[ "$DRY" == "1" ]]; then
  log "DRY RUN, would POST /api/workspaces/$WS/messages $BODY"
else
  post "/api/workspaces/$WS/messages" "$BODY" >/dev/null
  log "change posted: watch for 'Requirements changed mid-build' on screen"
fi

# ── 4. stay online until Ctrl-C ─────────────────────────────────────────────
log "keeping $NAME online. Ctrl-C when the take is over."
wait "$HB_PID"
