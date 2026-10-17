import { describeProvider } from "@/lib/llm";
import { executor } from "@/lib/executor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/health — honest system status for the landing page status strip. */
export async function GET() {
  return Response.json(
    {
      ok: true,
      provider: describeProvider(),
      executor: executor.kind(),
      freestyle: Boolean(process.env.FREESTYLE_API_KEY),
      wally: Boolean(process.env.RUNANYWHERE_API_KEY),
      now: Date.now(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
