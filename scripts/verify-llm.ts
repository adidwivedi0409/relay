// Smoke test for the model adapter. Run with:  npx tsx scripts/verify-llm.ts
// Loads .env.local, prints which provider/model Relay will use, runs the cheap
// provider check (GET /v1/models for Wally), then one ~20-token completion.
// Exits non-zero when no provider is configured or the call fails.

import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(process.cwd(), ".env.local") });
config();

async function main(): Promise<void> {
  const llm = await import("../src/lib/llm");

  const described = llm.describeProvider();
  console.log(`provider:   ${described.provider}`);
  console.log(`model:      ${described.model}`);
  console.log(`configured: ${described.configured}`);
  if (!described.configured) {
    console.error(llm.NO_PROVIDER_MESSAGE);
    process.exit(1);
  }

  const verified = await llm.verifyProvider();
  console.log(`verify:     ${verified.ok ? "ok" : "FAILED"} — ${verified.provider}/${verified.model} — ${verified.detail}`);

  const result = await llm.complete({
    label: "verify-llm",
    messages: [
      { role: "system", content: "You are a terse assistant." },
      { role: "user", content: "Reply with the single word: ready" },
    ],
    maxTokens: 20,
    temperature: 0,
  });
  console.log(`completion: ${result.provider}/${result.model} in ${result.ms}ms` + (result.usage ? ` (in=${result.usage.input ?? "?"} out=${result.usage.output ?? "?"})` : ""));
  console.log(`text:       ${JSON.stringify(result.text)}`);

  const parsedJson = llm.extractJson('```json\n{"a": 1, "b": [1, 2,],}\n```');
  const parsedFiles = llm.parseFiles("<<<FILE: index.html>>>\n<!doctype html>\n<<<END FILE>>>\n<<<FILE app.js>>>\nconsole.log(1)\n");
  console.log(`extractJson self-test: ${JSON.stringify(parsedJson)}`);
  console.log(`parseFiles self-test:  ${parsedFiles.map((f) => f.path).join(", ")}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
