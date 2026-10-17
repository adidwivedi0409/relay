import { z } from "zod";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const JoinBody = z.object({
  participant: z.object({
    id: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(40),
  }),
});

function jsonError(status: number, error: string, details?: unknown) {
  return Response.json(details === undefined ? { error } : { error, details }, { status });
}

/**
 * POST /api/workspaces/[id]/join  body {participant:{id,name}} → {participant}
 * Idempotent: re-joining refreshes presence (and name) without a second
 * participant.joined event.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!store.getWorkspace(id)) return jsonError(404, "Workspace not found");

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError(400, "Body must be JSON");
  }
  const parsed = JoinBody.safeParse(raw);
  if (!parsed.success) {
    return jsonError(400, "Invalid body", parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`));
  }

  const input = parsed.data.participant;
  const isNew = !store.getParticipants(id).some((p) => p.id === input.id);
  const participant = store.upsertParticipant(id, input);

  if (isNew) {
    store.emit(id, {
      type: "participant.joined",
      actor: { kind: "human", id: participant.id, name: participant.name, color: participant.color },
      message: `${participant.name} joined`,
      payload: { participant },
    });
  }

  return Response.json({ participant });
}
