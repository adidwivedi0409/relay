import { z } from "zod";
import { store } from "@/lib/store";
import { orchestrator } from "@/lib/orchestrator";
import type { Actor } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MessageBody = z.object({
  participantId: z.string().trim().min(1).max(64),
  text: z.string().trim().min(1).max(4000),
  kind: z.enum(["requirement", "chat"]),
});

function jsonError(status: number, error: string, details?: unknown) {
  return Response.json(details === undefined ? { error } : { error, details }, { status });
}

/**
 * POST /api/workspaces/[id]/messages  body {participantId, text, kind} → {ok:true, event}
 *  - "chat": emits human.message only.
 *  - "requirement": bumps the revision, emits requirement.added, then kicks the
 *    orchestrator without awaiting it (errors surface as "error" events).
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
  const parsed = MessageBody.safeParse(raw);
  if (!parsed.success) {
    return jsonError(400, "Invalid body", parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`));
  }
  const { participantId, text, kind } = parsed.data;

  const participant = store.getParticipants(id).find((p) => p.id === participantId);
  if (!participant) return jsonError(404, "Participant not found; join the workspace first");
  // Any message from a participant is proof of life.
  store.heartbeat(id, participantId);

  const actor: Actor = { kind: "human", id: participant.id, name: participant.name, color: participant.color };

  if (kind === "chat") {
    const event = store.emit(id, {
      type: "human.message",
      actor,
      message: text,
      payload: { text },
    });
    return Response.json({ ok: true, event });
  }

  const { workspace, requirement } = store.addRequirement(id, text, { id: participant.id, name: participant.name });
  const revision = workspace.revision;
  const previousRevision = revision - 1;
  const isFirst = workspace.requirements.length === 1;

  const event = store.emit(id, {
    type: "requirement.added",
    actor,
    message: isFirst
      ? `${participant.name} set the brief`
      : `${participant.name} changed the requirements → r${revision}`,
    payload: { requirement, revision, previousRevision, text },
    revision,
  });

  void orchestrator.onRequirementAdded(id, requirement).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    try {
      store.emit(id, {
        type: "error",
        actor: { kind: "system", id: "system", name: "Relay" },
        message,
        payload: { stage: "orchestrator", revision },
      });
    } catch (emitErr) {
      console.error("[relay:messages] orchestrator failed and the error could not be recorded:", message, emitErr);
    }
  });

  return Response.json({ ok: true, event });
}
