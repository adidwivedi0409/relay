import { z } from "zod";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HeartbeatBody = z.object({ participantId: z.string().trim().min(1).max(64) });

function jsonError(status: number, error: string, details?: unknown) {
  return Response.json(details === undefined ? { error } : { error, details }, { status });
}

/** POST /api/workspaces/[id]/heartbeat  body {participantId} → {ok:true} */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!store.getWorkspace(id)) return jsonError(404, "Workspace not found");

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError(400, "Body must be JSON");
  }
  const parsed = HeartbeatBody.safeParse(raw);
  if (!parsed.success) {
    return jsonError(400, "Invalid body", parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`));
  }

  const { participantId } = parsed.data;
  if (!store.getParticipants(id).some((p) => p.id === participantId)) {
    return jsonError(404, "Participant not found; join the workspace first");
  }
  store.heartbeat(id, participantId);
  return Response.json({ ok: true, now: Date.now() });
}
