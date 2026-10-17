import { networkInterfaces } from "node:os";
import { describeProvider } from "@/lib/llm";
import { executor } from "@/lib/executor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * First non-internal IPv4 address on this machine, preferring Wi-Fi / primary
 * interfaces (en0, wlan*) and skipping link-local 169.254.* addresses.
 */
function firstLanIPv4(): string | null {
  let ifaces: ReturnType<typeof networkInterfaces>;
  try {
    ifaces = networkInterfaces();
  } catch {
    return null;
  }
  const names = Object.keys(ifaces);
  const preferred = names.filter((n) => /^(en0|wlan\d*|wl\w*)$/i.test(n));
  const rest = names.filter((n) => !preferred.includes(n));
  for (const name of [...preferred, ...rest]) {
    for (const addr of ifaces[name] ?? []) {
      const isV4 = addr.family === "IPv4" || (addr.family as unknown) === 4;
      if (!isV4 || addr.internal) continue;
      if (addr.address.startsWith("169.254.")) continue;
      return addr.address;
    }
  }
  return null;
}

/** GET /api/health — honest system status for the landing page status strip. */
export async function GET(request: Request) {
  let port = "3000";
  try {
    port = new URL(request.url).port || "3000";
  } catch {
    // keep default
  }
  const ip = firstLanIPv4();
  const lanUrl = ip ? `http://${ip}:${port}` : null;

  return Response.json(
    {
      ok: true,
      provider: describeProvider(),
      executor: executor.kind(),
      freestyle: Boolean(process.env.FREESTYLE_API_KEY),
      wally: Boolean(process.env.RUNANYWHERE_API_KEY),
      lanUrl,
      now: Date.now(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
