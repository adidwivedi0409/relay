import { z } from "zod";
import { store } from "@/lib/store";
import { executor } from "@/lib/executor";
import type { Actor } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ParticipantInput = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(40),
});

const CreateBody = z.object({
  name: z.string().trim().min(1).max(80),
  participant: ParticipantInput,
});

function jsonError(status: number, error: string, details?: unknown) {
  return Response.json(details === undefined ? { error } : { error, details }, { status });
}

/** GET /api/workspaces — lightweight listing (newest first). */
export async function GET() {
  const workspaces = store.listWorkspaces().map((w) => ({
    id: w.id,
    name: w.name,
    createdAt: w.createdAt,
    revision: w.revision,
    buildStatus: w.buildStatus,
    executor: w.executor,
  }));
  return Response.json({ workspaces }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * POST /api/workspaces  body {name, participant:{id,name}} → {workspace, participant}
 * Creates the workspace (and its three agents), seats the creator, and emits
 * workspace.created + participant.joined.
 */
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError(400, "Body must be JSON");
  }
  const parsed = CreateBody.safeParse(raw);
  if (!parsed.success) {
    return jsonError(400, "Invalid body", parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`));
  }
  const { name, participant: input } = parsed.data;

  const workspace = store.createWorkspace(name, executor.kind());
  const participant = store.upsertParticipant(workspace.id, input);
  const actor: Actor = { kind: "human", id: participant.id, name: participant.name, color: participant.color };

  store.emit(workspace.id, {
    type: "workspace.created",
    actor,
    message: `${participant.name} created the workspace "${workspace.name}"`,
    payload: { name: workspace.name, executor: workspace.executor },
  });
  store.emit(workspace.id, {
    type: "participant.joined",
    actor,
    message: `${participant.name} joined`,
    payload: { participant },
  });

  return Response.json({ workspace: store.getWorkspace(workspace.id), participant }, { status: 201 });
}
