// Dev-only: serves the fixture's sample site so /dev/preview has a real iframe target.
import { SAMPLE_FILES } from "@/lib/client/fixture";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
};

export async function GET(_req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }
  const { path } = await ctx.params;
  const rel = (path ?? []).join("/") || "index.html";
  const file = SAMPLE_FILES.find((f) => f.path === rel);
  if (!file) return new Response("Not found", { status: 404 });
  const ext = rel.split(".").pop()?.toLowerCase() ?? "";
  return new Response(file.content, {
    status: 200,
    headers: {
      "content-type": TYPES[ext] ?? "application/octet-stream",
      "cache-control": "no-store",
    },
  });
}
