// Freestyle smoke test (CONTRACT.md § scripts). Exercises the real executor
// code path end to end: create VM, exec `echo ok`, write a 3-file site, start
// the systemd static server, expose a style.dev domain, fetch it, redeploy a
// second revision onto the same VM, then delete the VM (unless --keep).
//
//   npx tsx scripts/verify-freestyle.ts [--keep] [--env <file>]
//
// --env defaults to .env.local. Exit code 0 only when every step passed.

import path from "node:path";
import { config as loadEnv } from "dotenv";
import {
  deployFreestyle,
  describeError,
  forgetFreestyleRecord,
  freestyleApiKey,
  getFreestyleClient,
  getFreestyleRecord,
  verifyFreestyle,
} from "../src/lib/executor/freestyle";
import type { ArtifactFile } from "../src/lib/types";

const args = process.argv.slice(2);
const keep = args.includes("--keep");
const envIdx = args.indexOf("--env");
const envFile = envIdx >= 0 && args[envIdx + 1] ? args[envIdx + 1] : ".env.local";
loadEnv({ path: path.resolve(process.cwd(), envFile), quiet: true });
loadEnv({ quiet: true });

interface Step {
  name: string;
  ms: number;
  ok: boolean;
  detail: string;
}

const steps: Step[] = [];

async function step(name: string, fn: () => Promise<string>): Promise<void> {
  const t = Date.now();
  process.stdout.write(`▸ ${name}\n`);
  try {
    const detail = await fn();
    const ms = Date.now() - t;
    steps.push({ name, ms, ok: true, detail });
    console.log(`  ok   ${ms}ms  ${detail}`);
  } catch (err) {
    const ms = Date.now() - t;
    const detail = describeError(err);
    steps.push({ name, ms, ok: false, detail });
    console.error(`  FAIL ${ms}ms  ${detail}`);
    throw err;
  }
}

function site(marker: string, revision: number): ArtifactFile[] {
  return [
    {
      path: "index.html",
      content: `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relay smoke r${revision}</title>
<link rel="stylesheet" href="styles.css">
</head>
<body>
<main>
<h1>Relay Freestyle smoke test</h1>
<p id="marker">${marker}</p>
<p>Revision ${revision}, served from /srv/app by relay-app.service.</p>
<button id="ping" type="button">Ping</button>
<output id="out"></output>
</main>
<script src="app.js"></script>
</body>
</html>
`,
    },
    {
      path: "styles.css",
      content: `:root { color-scheme: dark; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b0b0c; color: #f3f1ec; font: 16px/1.5 system-ui, sans-serif; }
main { padding: 2rem; border: 1px solid rgba(255,255,255,.1); border-radius: 12px; }
h1 { margin: 0 0 .5rem; font-size: 1.25rem; }
#marker { font-family: ui-monospace, monospace; color: #e8a86b; }
button { background: #e8a86b; color: #0b0b0c; border: 0; border-radius: 6px; padding: .5rem 1rem; cursor: pointer; }
`,
    },
    {
      path: "app.js",
      content: `document.getElementById("ping").addEventListener("click", () => {
  document.getElementById("out").textContent = "pong @ " + new Date().toISOString();
});
`,
    },
  ];
}

async function fetchText(url: string): Promise<{ status: number; type: string; text: string }> {
  const res = await fetch(url, { cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(10_000) });
  const text = await res.text();
  return { status: res.status, type: res.headers.get("content-type") ?? "", text };
}

async function main(): Promise<number> {
  const key = freestyleApiKey();
  if (!key) {
    console.error(
      [
        "verify-freestyle: FREESTYLE_API_KEY not set.",
        `  Looked in ${envFile} and the process environment.`,
        "  Create one with: npx freestyle@latest login && npx freestyle@latest tokens create relay",
        "  then add FREESTYLE_API_KEY=... to .env.local and re-run.",
      ].join("\n"),
    );
    return 1;
  }

  const wsId = `smoke-${Date.now().toString(36)}`;
  const marker1 = `relay-smoke-${wsId}-r1`;
  const marker2 = `relay-smoke-${wsId}-r2`;
  const freestyle = await getFreestyleClient();
  const onProgress = (status: string, detail: string) => console.log(`       · ${status}: ${detail}`);

  let sandboxId: string | null = null;
  let previewUrl1 = "";
  let previewUrl2 = "";
  let finalStatus: number | null = null;
  let exitCode = 0;

  try {
    await step("auth: vms.list", async () => {
      const r = await verifyFreestyle();
      if (!r.ok) throw new Error(r.detail);
      return r.detail;
    });

    await step("deploy r1: create VM, write 3 files, start server, expose domain, verify", async () => {
      const res = await deployFreestyle(wsId, site(marker1, 1), 1, onProgress);
      sandboxId = res.sandboxId;
      previewUrl1 = res.previewUrl;
      finalStatus = res.httpStatus;
      for (const l of res.logs) console.log(`       ${l}`);
      if (res.httpStatus !== 200) throw new Error(`preview answered HTTP ${res.httpStatus ?? "nothing"} at ${res.previewUrl}`);
      return `${res.previewUrl} → HTTP ${res.httpStatus} · vm ${res.sandboxId}`;
    });

    await step("exec: echo ok", async () => {
      const r = await freestyle.vms.ref(sandboxId as string).exec({ command: "echo ok", timeoutMs: 15_000 });
      const out = (r.stdout ?? "").trim();
      if (out !== "ok" || r.statusCode !== 0) throw new Error(`unexpected result ${JSON.stringify(r)}`);
      return `stdout="${out}" statusCode=${r.statusCode}`;
    });

    await step("fetch r1: index.html carries the r1 marker", async () => {
      const r = await fetchText(previewUrl1);
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      if (!r.text.includes(marker1)) throw new Error(`marker ${marker1} missing from body (${r.text.length} bytes)`);
      return `HTTP ${r.status} · ${r.type} · ${r.text.length} bytes`;
    });

    await step("fetch r1: styles.css served with a CSS content type", async () => {
      const r = await fetchText(new URL("/styles.css", previewUrl1).toString());
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      if (!r.type.includes("text/css")) throw new Error(`content-type ${r.type || "(none)"}`);
      return `HTTP ${r.status} · ${r.type}`;
    });

    await step("deploy r2: rewrite files on the same VM, no re-provision", async () => {
      const res = await deployFreestyle(wsId, site(marker2, 2), 2, onProgress, { sandboxId });
      for (const l of res.logs) console.log(`       ${l}`);
      if (res.sandboxId !== sandboxId) throw new Error(`VM changed: ${sandboxId} → ${res.sandboxId}`);
      previewUrl2 = res.previewUrl;
      finalStatus = res.httpStatus;
      if (res.httpStatus !== 200) throw new Error(`preview answered HTTP ${res.httpStatus ?? "nothing"} at ${res.previewUrl}`);
      return `${res.previewUrl} → HTTP ${res.httpStatus}`;
    });

    await step("fetch r2: index.html carries the r2 marker and not r1", async () => {
      const r = await fetchText(previewUrl2);
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      if (!r.text.includes(marker2)) throw new Error(`marker ${marker2} missing`);
      if (r.text.includes(marker1)) throw new Error("stale r1 content still served");
      return `HTTP ${r.status} · ${r.text.length} bytes`;
    });
  } catch {
    exitCode = 1;
  } finally {
    if (sandboxId) {
      const record = getFreestyleRecord(wsId);
      if (keep) {
        console.log(`\nkept VM ${sandboxId}${record?.domain ? ` at https://${record.domain}` : ""} (--keep). Delete with: npx freestyle vms delete ${sandboxId}`);
      } else {
        await step("cleanup: delete TLS rule and VM", async () => {
          const parts: string[] = [];
          if (record?.ruleId) {
            await freestyle.tls.rules.delete(record.ruleId);
            parts.push(`rule ${record.ruleId}`);
          }
          await freestyle.vms.delete(sandboxId as string);
          parts.push(`vm ${sandboxId}`);
          forgetFreestyleRecord(wsId);
          return `deleted ${parts.join(", ")}`;
        }).catch(() => {
          exitCode = 1;
        });
      }
    }
  }

  console.log("\nSummary");
  for (const s of steps) {
    console.log(`  ${s.ok ? "ok  " : "FAIL"}  ${String(s.ms).padStart(6)}ms  ${s.name}`);
  }
  const total = steps.reduce((a, s) => a + s.ms, 0);
  console.log(`  total ${total}ms`);
  if (previewUrl2 || previewUrl1) {
    console.log(`\nFinal URL: ${previewUrl2 || previewUrl1}  (HTTP ${finalStatus ?? "no response"})${keep ? "" : "  — VM deleted, URL is now dark"}`);
  }
  return exitCode;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`verify-freestyle: ${describeError(err)}`);
    process.exit(1);
  });
