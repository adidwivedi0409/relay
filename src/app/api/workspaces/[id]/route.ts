import { store } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/workspaces/[id] → WorkspaceSnapshot (404 if missing). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!store.getWorkspace(id)) {
    return Response.json({ error: "Workspace not found" }, { status: 404 });
  }
  return Response.json(store.snapshot(id), { headers: { "Cache-Control": "no-store" } });
}
