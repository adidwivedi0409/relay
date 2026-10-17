// GET /api/workspaces/[id]/artifact/[[...path]]
// Serves the local executor's artifact (latest revision) for the preview iframe
// when Relay runs without a Freestyle key. Always uncached; path traversal is
// rejected both here and inside the executor.

import { executor } from "@/lib/executor";

export const dynamic = "force-dynamic";

type Params = { id: string; path?: string[] };

const BASE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "X-Relay-Executor": "local",
};

export async function GET(_req: Request, ctx: { params: Promise<Params> }): Promise<Response> {
  const { id, path } = await ctx.params;
  const segments = path ?? [];

  if (segments.some((s) => s === "" || s === "." || s === ".." || s.includes("\\") || s.includes("\0"))) {
    return json({ error: "invalid path" }, 400);
  }

  const rel = segments.length === 0 ? "index.html" : segments.join("/");
  const file = await executor.getArtifactFile(id, rel);
  if (!file) {
    return json({ error: "not found", workspace: id, path: rel }, 404);
  }

  const body: string | Uint8Array<ArrayBuffer> =
    typeof file.content === "string" ? file.content : new Uint8Array(file.content);

  return new Response(body, {
    status: 200,
    headers: { ...BASE_HEADERS, "Content-Type": file.contentType },
  });
}

function json(payload: Record<string, unknown>, status: number): Response {
  return Response.json(payload, { status, headers: BASE_HEADERS });
}
