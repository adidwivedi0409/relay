#!/usr/bin/env bash
# Relay API smoke test: create a workspace, join a second person, heartbeat,
# post a chat message, read the snapshot, and peek at the SSE stream.
#
#   scripts/smoke-api.sh                 # against http://localhost:3000
#   BASE=http://localhost:3100 scripts/smoke-api.sh
#   scripts/smoke-api.sh --requirement   # also post a requirement (kicks the orchestrator)
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
WITH_REQUIREMENT=0
for arg in "$@"; do
  case "$arg" in
    --requirement) WITH_REQUIREMENT=1 ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

STAMP="$(date +%s)"
P1_ID="smoke-ada-${STAMP}"
P2_ID="smoke-grace-${STAMP}"

json() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);const v=process.argv[1].split(".").reduce((a,k)=>a==null?a:a[k],o);process.stdout.write(typeof v==="string"?v:JSON.stringify(v))})' "$1"; }
step() { printf '\n== %s\n' "$1"; }
post() { curl -sS -f -X POST -H 'content-type: application/json' "$BASE$1" -d "$2"; }

step "GET /api/health"
curl -sS -f "$BASE/api/health"; echo

step "POST /api/workspaces"
CREATE="$(post /api/workspaces "{\"name\":\"Smoke ${STAMP}\",\"participant\":{\"id\":\"${P1_ID}\",\"name\":\"Ada\"}}")"
echo "$CREATE"
WS_ID="$(printf '%s' "$CREATE" | json workspace.id)"
echo "workspace id: $WS_ID"
[[ "$WS_ID" =~ ^[a-z0-9]{10}$ ]] || { echo "unexpected workspace id format" >&2; exit 1; }

step "POST /api/workspaces/$WS_ID/join (second participant)"
post "/api/workspaces/$WS_ID/join" "{\"participant\":{\"id\":\"${P2_ID}\",\"name\":\"Grace\"}}"; echo

step "POST /api/workspaces/$WS_ID/join (same participant again: no second joined event)"
post "/api/workspaces/$WS_ID/join" "{\"participant\":{\"id\":\"${P2_ID}\",\"name\":\"Grace\"}}"; echo

step "POST /api/workspaces/$WS_ID/heartbeat"
post "/api/workspaces/$WS_ID/heartbeat" "{\"participantId\":\"${P1_ID}\"}"; echo

step "POST /api/workspaces/$WS_ID/messages (chat)"
post "/api/workspaces/$WS_ID/messages" "{\"participantId\":\"${P2_ID}\",\"text\":\"Hello from the smoke test\",\"kind\":\"chat\"}"; echo

if [[ "$WITH_REQUIREMENT" == "1" ]]; then
  step "POST /api/workspaces/$WS_ID/messages (requirement)"
  post "/api/workspaces/$WS_ID/messages" "{\"participantId\":\"${P1_ID}\",\"text\":\"A landing page for a campus bike-share with pricing and a signup form\",\"kind\":\"requirement\"}"; echo
fi

step "Validation: bad body -> 400"
curl -sS -o /dev/stderr -w 'status=%{http_code}\n' -X POST -H 'content-type: application/json' "$BASE/api/workspaces/$WS_ID/messages" -d '{"participantId":"","text":"","kind":"nope"}' 2>&1; echo

step "Validation: unknown workspace -> 404"
curl -sS -o /dev/stderr -w 'status=%{http_code}\n' "$BASE/api/workspaces/doesnotexist" 2>&1; echo

step "GET /api/workspaces/$WS_ID (snapshot)"
SNAP="$(curl -sS -f "$BASE/api/workspaces/$WS_ID")"
echo "$SNAP" | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  const o=JSON.parse(s);
  console.log(JSON.stringify({
    workspace:{id:o.workspace.id,name:o.workspace.name,revision:o.workspace.revision,executor:o.workspace.executor,requirements:o.workspace.requirements.length},
    participants:o.participants.map(p=>({id:p.id,name:p.name,color:p.color,online:o.now-p.lastSeen<15000})),
    agents:o.agents.map(a=>`${a.role}:${a.provider}/${a.model}:${a.status}`),
    tasks:o.tasks.length,
    events:o.events.map(e=>`#${e.seq} ${e.type} r${e.revision} — ${e.message}`),
  },null,2));
})'

step "GET /api/workspaces/$WS_ID/events (SSE, first 2s)"
curl -sS -N --max-time 2 -D - "$BASE/api/workspaces/$WS_ID/events" 2>/dev/null | cut -c1-200 || true
echo

step "GET /api/workspaces/$WS_ID/events?since=1 (resume, first 2s)"
curl -sS -N --max-time 2 "$BASE/api/workspaces/$WS_ID/events?since=1" 2>/dev/null | cut -c1-160 || true
echo

printf '\nSmoke test finished for workspace %s\n' "$WS_ID"
