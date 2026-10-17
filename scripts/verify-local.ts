// Local executor smoke test: deploys a 3-file site for a fake workspace through
// executor.deploy with FREESTYLE_API_KEY unset, prints the preview URL and the
// deploy logs, then exercises getArtifactFile (happy path + traversal guard).
//
//   NEXT_PUBLIC_APP_URL=http://localhost:3200 npx tsx scripts/verify-local.ts [wsId] [revision]
//
// Run a Next server on NEXT_PUBLIC_APP_URL first if you want the HTTP verify
// step to return 200; without one the script still succeeds and reports
// httpStatus=null.

import { executor } from "../src/lib/executor";
import type { ArtifactFile } from "../src/lib/types";

async function main(): Promise<number> {
  delete process.env.FREESTYLE_API_KEY;

  const wsId = process.argv[2] || "smoke-local";
  const revision = Number(process.argv[3] || 1);
  const marker = `relay-local-smoke-${wsId}-r${revision}`;

  const files: ArtifactFile[] = [
    {
      path: "index.html",
      content: `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relay local smoke r${revision}</title>
<link rel="stylesheet" href="styles.css">
</head>
<body>
<main>
<h1>Relay local executor smoke test</h1>
<p id="marker">${marker}</p>
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
      content: `body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b0b0c; color: #f3f1ec; font: 16px/1.5 system-ui, sans-serif; }
#marker { font-family: ui-monospace, monospace; color: #e8a86b; }
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

  console.log(`executor.kind() = ${executor.kind()}`);
  const t = Date.now();
  const res = await executor.deploy(wsId, files, revision, (status, detail) => console.log(`· ${status}: ${detail}`));
  console.log(`deploy took ${Date.now() - t}ms`);
  console.log(`previewUrl: ${res.previewUrl}`);
  console.log(`executor:   ${res.executor}  sandboxId: ${res.sandboxId}  httpStatus: ${res.httpStatus}`);
  console.log("logs:");
  for (const l of res.logs) console.log(`  ${l}`);

  const css = await executor.getArtifactFile(wsId, "styles.css");
  console.log(`getArtifactFile("styles.css") → ${css ? `${css.contentType}, ${typeof css.content === "string" ? css.content.length : css.content.byteLength} bytes` : "null"}`);
  const root = await executor.getArtifactFile(wsId, "");
  console.log(`getArtifactFile("") → ${root ? root.contentType : "null"}`);
  const traversal = await executor.getArtifactFile(wsId, "../../relay.json");
  console.log(`getArtifactFile("../../relay.json") → ${traversal === null ? "null (blocked)" : "SERVED (bug)"}`);
  const missing = await executor.getArtifactFile(wsId, "nope.txt");
  console.log(`getArtifactFile("nope.txt") → ${missing === null ? "null" : "unexpected"}`);

  const ok = res.executor === "local" && css !== null && root !== null && traversal === null && missing === null;
  return ok ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`verify-local: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
