// ─────────────────────────────────────────────────────────────────────────────
// Freestyle executor: one Linux VM per workspace, files under /srv/app served
// by a systemd-managed static server on :3000, published on a style.dev name
// through a TLS ingress rule. Every stage names itself in its error message.
//
// Verified facts this module relies on (CONTRACT.md "VERIFIED Freestyle facts"
// + freestyle@0.2.20 types + docs/vms/domains):
//   - vm.exec runs as `ubuntu` (uid 1000) with passwordless sudo; vm.fs.* runs
//     as root. Privileged shell steps are therefore prefixed with sudo.
//   - Ubuntu 24.04 base image ships python3 3.12 and systemd.
//   - TLS ingress is edge-brokered (the platform proxy is "always allowed" in
//     firewall.d.ts). The verified firewall set still includes an inbound :3000
//     tcp rule alongside egress; both are created, as the contract requires.
//   - A fresh style.dev name answers 502 for a few seconds before the first
//     200, so verification polls up to 45s and treats anything but 200 as
//     "not yet". Every public fetch carries an 8s timeout.
//   - The `freestyle` package is ESM-only (exports has no `require`
//     condition). It is loaded lazily through import() so this file works
//     both inside Next (serverExternalPackages) and under tsx scripts.
// ─────────────────────────────────────────────────────────────────────────────

import type { Freestyle, TlsRuleData, Vm, VmData } from "freestyle";
import type { ArtifactFile, BuildStatus } from "@/lib/types";
import { mimeTableForEmbedding } from "./mime";
import { isValidWorkspaceId, sanitizeRelativePath } from "./local";

export interface FreestyleDeployResult {
  previewUrl: string;
  sandboxId: string;
  executor: "freestyle";
  httpStatus: number | null;
  logs: string[];
}

export type StaticServerKind = "python3" | "node" | "busybox";

/** What we remember about a workspace's VM between deploys (survives HMR via globalThis). */
export interface FreestyleVmRecord {
  vmId: string;
  slug: string;
  domain: string | null;
  ruleId: string | null;
  serverReady: boolean;
  serverKind: StaticServerKind | null;
}

/** The shape of the SDK's FreestyleApiError, matched structurally so no runtime import is needed. */
export interface FreestyleApiErrorLike extends Error {
  name: "FreestyleApiError";
  code: string;
  status: number;
  path?: string;
}

type FreestyleModule = typeof import("freestyle");

interface FreestyleGlobalState {
  sdk: Promise<FreestyleModule> | null;
  client: Freestyle | null;
  clientKey: string | null;
  records: Map<string, FreestyleVmRecord>;
  verifyCache: { at: number; result: { ok: boolean; detail: string } } | null;
}

const APP_DIR = "/srv/app";
const SERVE_JS = "/srv/serve.js";
const UNIT_NAME = "relay-app";
const UNIT_PATH = `/etc/systemd/system/${UNIT_NAME}.service`;
const PORT = 3000;
const VERIFY_WINDOW_MS = 45_000;
const VERIFY_INTERVAL_MS = 1_000;
const FETCH_TIMEOUT_MS = 8_000;
const IDLE_TIMEOUT_SECONDS = 3600;

/** Shell prefix: `$S` expands to `sudo` unless we are already root. */
const SUDO_PREAMBLE = `S=$([ "$(id -u)" = 0 ] || echo sudo);`;

const g = globalThis as typeof globalThis & { __relayFreestyle?: FreestyleGlobalState };
function state(): FreestyleGlobalState {
  if (!g.__relayFreestyle) {
    g.__relayFreestyle = { sdk: null, client: null, clientKey: null, records: new Map(), verifyCache: null };
  }
  return g.__relayFreestyle;
}

export function freestyleApiKey(): string | null {
  const key = (process.env.FREESTYLE_API_KEY ?? "").trim();
  return key.length > 0 ? key : null;
}

export function previewDomainSuffix(): string {
  const raw = (process.env.RELAY_PREVIEW_DOMAIN_SUFFIX ?? "").trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  return raw || "style.dev";
}

function loadSdk(): Promise<FreestyleModule> {
  const s = state();
  if (!s.sdk) {
    s.sdk = import("freestyle").catch((err: unknown) => {
      s.sdk = null;
      throw new Error(`Freestyle SDK: could not load the "freestyle" package: ${describeError(err)}`, { cause: err });
    });
  }
  return s.sdk;
}

/** Authenticated SDK client (cached per key). Throws when FREESTYLE_API_KEY is missing. */
export async function getFreestyleClient(): Promise<Freestyle> {
  const key = freestyleApiKey();
  if (!key) throw new Error("Freestyle: FREESTYLE_API_KEY not set");
  const s = state();
  if (!s.client || s.clientKey !== key) {
    const sdk = await loadSdk();
    s.client = new sdk.Freestyle({ apiKey: key });
    s.clientKey = key;
  }
  return s.client;
}

/** The record kept for a workspace, if this process has deployed it. */
export function getFreestyleRecord(wsId: string): FreestyleVmRecord | null {
  return state().records.get(wsId) ?? null;
}

/** Forget a workspace's record (used by the smoke test after deleting its VM). */
export function forgetFreestyleRecord(wsId: string): void {
  state().records.delete(wsId);
}

/**
 * `relay-<wsId>` as a Freestyle slug / style.dev label: lowercase [a-z0-9-],
 * no leading, trailing or repeated hyphens, at most 63 chars. When lowercasing
 * or substitution changed the id, a short hash keeps distinct ids distinct.
 */
export function freestyleSlugFor(wsId: string): string {
  let body = wsId.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (body !== wsId) body = `${body}-${shortHash(wsId)}`.replace(/^-/, "");
  const slug = `relay-${body}`.replace(/-+/g, "-").replace(/-$/, "");
  return slug.length > 63 ? slug.slice(0, 63).replace(/-$/, "") : slug;
}

/** Public domain for a workspace: `relay-<wsId>.<suffix>`, with an optional revision disambiguator. */
export function freestyleDomainFor(wsId: string, revision?: number): string {
  const suffix = previewDomainSuffix();
  const base = freestyleSlugFor(wsId);
  if (revision === undefined) return `${base}.${suffix}`;
  const tail = `-${revision}`;
  const label = base.length + tail.length > 63 ? base.slice(0, 63 - tail.length).replace(/-$/, "") : base;
  return `${label}${tail}.${suffix}`;
}

function shortHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0").slice(0, 6);
}

// ── Deploy ───────────────────────────────────────────────────────────────────

export async function deployFreestyle(
  wsId: string,
  files: ArtifactFile[],
  revision: number,
  onProgress: (status: BuildStatus, detail: string) => void,
  existing?: { sandboxId: string | null },
): Promise<FreestyleDeployResult> {
  const logs: string[] = [];
  const t0 = Date.now();
  const log = (line: string) => {
    logs.push(`[+${Date.now() - t0}ms] ${line}`);
  };

  if (!isValidWorkspaceId(wsId)) throw new Error(`Freestyle deploy: invalid workspace id "${wsId}"`);
  if (!Number.isInteger(revision) || revision < 0) throw new Error(`Freestyle deploy: invalid revision ${revision}`);
  if (files.length === 0) throw new Error("Freestyle deploy: no files to deploy");
  const sanitized: { rel: string; content: string }[] = [];
  for (const f of files) {
    const rel = sanitizeRelativePath(f.path);
    if (!rel) throw new Error(`Freestyle deploy: refusing unsafe file path "${f.path}"`);
    sanitized.push({ rel, content: f.content });
  }
  if (!sanitized.some((f) => f.rel === "index.html")) log("warning: file set has no index.html; the preview root will 404");

  const freestyle = await stage("load SDK", () => getFreestyleClient());

  // 1. Provision (or reuse) the VM.
  onProgress("provisioning", "Provisioning Freestyle VM…");
  const { vm, record, reused } = await stage("provision VM", () =>
    resolveVm(freestyle, wsId, existing?.sandboxId ?? null, log),
  );
  log(`${reused ? "reusing" : "created"} VM ${record.vmId} (slug ${record.slug})`);

  // 2. Write files.
  onProgress("writing", `Writing ${sanitized.length} files to ${APP_DIR}`);
  await stage("write files", () => writeSite(vm, sanitized, log));

  // 3. Static server + public domain.
  const plannedDomain = record.domain ?? freestyleDomainFor(wsId);
  onProgress("building", `Starting static server · exposing https://${plannedDomain}`);
  if (!record.serverReady) {
    await stage("start static server", () => ensureStaticServer(vm, record, log));
  } else {
    log(`static server already configured (${record.serverKind}); skipping setup`);
  }
  await stage("expose domain", () => ensureIngress(freestyle, wsId, record, revision, log));
  if (!record.domain) throw new Error("Freestyle expose domain: no domain recorded after ingress setup");

  // 4. Verify with a real HTTP fetch through the edge.
  const previewUrl = `https://${record.domain}/?v=${revision}`;
  const httpStatus = await verifyPreview(previewUrl, log);
  log(`deploy finished in ${Date.now() - t0}ms · ${previewUrl} · httpStatus=${httpStatus ?? "no response"}`);

  return { previewUrl, sandboxId: record.vmId, executor: "freestyle", httpStatus, logs };
}

/** Run one stage; any failure is rethrown as an Error that names the stage. */
async function stage<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Freestyle ")) throw err;
    throw new Error(`Freestyle ${name}: ${describeError(err)}`, { cause: err });
  }
}

// ── VM resolution ────────────────────────────────────────────────────────────

async function resolveVm(
  freestyle: Freestyle,
  wsId: string,
  knownSandboxId: string | null,
  log: (l: string) => void,
): Promise<{ vm: Vm; record: FreestyleVmRecord; reused: boolean }> {
  const s = state();
  const slug = freestyleSlugFor(wsId);

  // a) This process already deployed the workspace.
  const inMemory = s.records.get(wsId);
  if (inMemory) {
    const data = await getVmData(freestyle, inMemory.vmId);
    if (data) {
      await ensureRunning(freestyle, data, log);
      return { vm: freestyle.vms.ref(data.id), record: inMemory, reused: true };
    }
    log(`VM ${inMemory.vmId} from memory no longer exists; re-provisioning`);
    s.records.delete(wsId);
  }

  // b) The workspace remembers a sandbox id (e.g. after a server restart), or the slug already exists.
  for (const candidate of [knownSandboxId, slug]) {
    if (!candidate) continue;
    const data = await getVmData(freestyle, candidate);
    if (!data) continue;
    await ensureRunning(freestyle, data, log);
    const record = await recoverRecord(freestyle, data, slug, log);
    s.records.set(wsId, record);
    return { vm: freestyle.vms.ref(data.id), record, reused: true };
  }

  // c) Fresh VM.
  let vmId: string;
  try {
    const created = await freestyle.vms.create({
      slug,
      displayName: `Relay workspace ${wsId}`,
      idleTimeoutSeconds: IDLE_TIMEOUT_SECONDS,
      metadata: { app: "relay", workspace: wsId.slice(0, 63) },
      firewall: {
        rules: [
          // Outbound Internet.
          { action: "allow", source: {}, destination: { public: true } },
          // Inbound :3000 (the verified set; TLS ingress itself is edge-brokered).
          { action: "allow", source: { public: true }, destination: { port: PORT, protocol: "tcp" } },
        ],
      },
    });
    vmId = created.vmId;
    log(
      `vms.create ok · state=${created.data.state} · ${created.data.resources.cpu} vCPU / ${created.data.resources.memory} MiB · ${created.firewallRules.length} firewall rule(s)`,
    );
  } catch (err) {
    if (!isConflict(err)) throw err;
    // Slug raced into existence (two deploys at once, or a listing lag): adopt it.
    log(`slug ${slug} already exists (${describeError(err)}); adopting via vms.ref`);
    const data = await freestyle.vms.get(slug);
    await ensureRunning(freestyle, data, log);
    const record = await recoverRecord(freestyle, data, slug, log);
    s.records.set(wsId, record);
    return { vm: freestyle.vms.ref(data.id), record, reused: true };
  }

  const record: FreestyleVmRecord = { vmId, slug, domain: null, ruleId: null, serverReady: false, serverKind: null };
  s.records.set(wsId, record);
  return { vm: freestyle.vms.ref(vmId), record, reused: false };
}

async function getVmData(freestyle: Freestyle, idOrSlug: string): Promise<VmData | null> {
  try {
    return await freestyle.vms.get(idOrSlug);
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

async function ensureRunning(freestyle: Freestyle, data: VmData, log: (l: string) => void): Promise<void> {
  if (data.state === "running" || data.state === "starting") return;
  log(`VM ${data.id} is ${data.state}; starting`);
  try {
    const after = await freestyle.vms.ref(data.id).start();
    log(`VM ${data.id} now ${after.state}`);
  } catch (err) {
    // A VM that woke up between get() and start() answers with a conflict; anything else is real.
    if (!isConflict(err)) throw err;
    log(`start() reported ${describeError(err)}; continuing`);
  }
}

/** Rebuild the in-memory record for a VM this process has not seen: find its ingress rule. */
async function recoverRecord(
  freestyle: Freestyle,
  data: VmData,
  slug: string,
  log: (l: string) => void,
): Promise<FreestyleVmRecord> {
  const rule = await findIngressRule(freestyle, data.id);
  if (rule) log(`recovered ingress rule ${rule.id} → https://${rule.domain}`);
  return {
    vmId: data.id,
    slug: data.slug ?? slug,
    domain: rule?.domain ?? null,
    ruleId: rule?.id ?? null,
    // The unit may already exist; ensureStaticServer is idempotent, so run it once more.
    serverReady: false,
    serverKind: null,
  };
}

async function findIngressRule(freestyle: Freestyle, vmId: string): Promise<TlsRuleData | null> {
  const { rules } = await freestyle.tls.rules.list({ vmId, limit: 50 });
  const suffix = `.${previewDomainSuffix()}`;
  const candidates = rules.filter(
    (r) => r.action === "allow" && r.source.public === true && r.destination.vmId === vmId && r.destination.port === PORT,
  );
  return candidates.find((r) => r.domain.endsWith(suffix)) ?? candidates[0] ?? null;
}

// ── Files ────────────────────────────────────────────────────────────────────

async function writeSite(vm: Vm, files: { rel: string; content: string }[], log: (l: string) => void): Promise<void> {
  const dirs = new Set<string>([APP_DIR]);
  for (const f of files) {
    const parts = f.rel.split("/");
    for (let i = 1; i < parts.length; i++) dirs.add(`${APP_DIR}/${parts.slice(0, i).join("/")}`);
  }
  await execOk(vm, `${SUDO_PREAMBLE} $S mkdir -p ${[...dirs].map(shellQuote).join(" ")}`, 30_000);

  // vm.fs writes run as root and are atomic per file, so a viewer never sees a half-written asset.
  await Promise.all(
    files.map(async (f) => {
      await vm.fs.writeTextFile(`${APP_DIR}/${f.rel}`, f.content, { mode: 0o644 });
      log(`wrote ${f.rel} (${Buffer.byteLength(f.content, "utf8")} bytes)`);
    }),
  );

  // The builder always returns the full file set: drop anything left from an older revision.
  const listing = await execOk(vm, `cd ${APP_DIR} && find . -type f | sed 's|^\\./||'`, 30_000);
  const keep = new Set(files.map((f) => f.rel));
  const stale = listing
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !keep.has(l) && sanitizeRelativePath(l) !== null);
  if (stale.length > 0) {
    await execOk(vm, `${SUDO_PREAMBLE} cd ${APP_DIR} && $S rm -f ${stale.map(shellQuote).join(" ")}`, 30_000);
    log(`removed ${stale.length} stale file(s): ${stale.join(", ")}`);
  }
}

// ── Static server ────────────────────────────────────────────────────────────

async function ensureStaticServer(vm: Vm, record: FreestyleVmRecord, log: (l: string) => void): Promise<void> {
  const probe = await execOk(vm, "command -v python3 || command -v node || command -v busybox || true", 30_000);
  const bin = probe.split("\n").map((l) => l.trim()).find((l) => l.startsWith("/")) ?? "";
  const name = bin.split("/").pop() ?? "";

  let kind: StaticServerKind;
  let execStart: string;
  if (name === "python3") {
    kind = "python3";
    execStart = `${bin} -m http.server ${PORT} --bind 0.0.0.0 --directory ${APP_DIR}`;
  } else if (name === "node") {
    kind = "node";
    await vm.fs.writeTextFile(SERVE_JS, nodeStaticServerSource(), { mode: 0o644 });
    execStart = `${bin} ${SERVE_JS}`;
  } else if (name === "busybox") {
    kind = "busybox";
    execStart = `${bin} httpd -f -p 0.0.0.0:${PORT} -h ${APP_DIR}`;
  } else {
    throw new Error(`no python3, node or busybox found in the VM (probe output: ${JSON.stringify(probe.trim())})`);
  }
  log(`static server: ${kind} (${bin})`);

  const unit = [
    "[Unit]",
    "Description=Relay static preview (/srv/app on :3000)",
    "After=network.target",
    "",
    "[Service]",
    `WorkingDirectory=${APP_DIR}`,
    `ExecStart=${execStart}`,
    "Restart=always",
    "RestartSec=1",
    "",
    "[Install]",
    "WantedBy=multi-user.target",
    "",
  ].join("\n");
  await vm.fs.writeTextFile(UNIT_PATH, unit, { mode: 0o644 });

  await execOk(
    vm,
    `${SUDO_PREAMBLE} $S systemctl daemon-reload && $S systemctl enable --now ${UNIT_NAME} && $S systemctl restart ${UNIT_NAME}`,
    60_000,
  );

  // Give systemd a moment, then insist the unit is actually up; surface the journal if not.
  let active = false;
  for (let i = 0; i < 6 && !active; i++) {
    const res = await vm.exec({ command: `sudo systemctl is-active ${UNIT_NAME}`, timeoutMs: 15_000 });
    active = (res.stdout ?? "").trim() === "active";
    if (!active) await sleep(500);
  }
  if (!active) {
    const diag = await vm.exec({
      command: `${SUDO_PREAMBLE} $S systemctl status ${UNIT_NAME} --no-pager -l 2>&1 | head -n 20; $S journalctl -u ${UNIT_NAME} -n 20 --no-pager 2>&1`,
      timeoutMs: 15_000,
    });
    throw new Error(`${UNIT_NAME}.service did not become active.\n${(diag.stdout ?? "").trim()}`);
  }
  log(`${UNIT_NAME}.service active`);
  record.serverReady = true;
  record.serverKind = kind;
}

/** Minimal dependency-free Node static server for /srv/app when python3 is absent. */
function nodeStaticServerSource(): string {
  const mime = JSON.stringify(mimeTableForEmbedding());
  return [
    `const http = require("http"), fs = require("fs"), path = require("path");`,
    `const ROOT = ${JSON.stringify(APP_DIR)}, PORT = ${PORT}, MIME = ${mime};`,
    `http.createServer((req, res) => {`,
    `  let p = decodeURIComponent((req.url || "/").split("?")[0]);`,
    `  if (p.endsWith("/")) p += "index.html";`,
    `  const abs = path.normalize(path.join(ROOT, p));`,
    `  if (!abs.startsWith(ROOT + path.sep) && abs !== ROOT) { res.writeHead(403); return res.end("forbidden"); }`,
    `  fs.stat(abs, (err, st) => {`,
    `    if (err || !st.isFile()) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("not found"); }`,
    `    const ext = path.extname(abs).slice(1).toLowerCase();`,
    `    const type = MIME[ext] || "application/octet-stream";`,
    `    res.writeHead(200, { "Content-Type": /^(text\\/|application\\/(json|xml|manifest))/.test(type) ? type + "; charset=utf-8" : type, "Content-Length": st.size, "Cache-Control": "no-store" });`,
    `    if (req.method === "HEAD") return res.end();`,
    `    fs.createReadStream(abs).pipe(res);`,
    `  });`,
    `}).listen(PORT, "0.0.0.0", () => console.log("relay static server on :" + PORT));`,
    ``,
  ].join("\n");
}

// ── Ingress ──────────────────────────────────────────────────────────────────

async function ensureIngress(
  freestyle: Freestyle,
  wsId: string,
  record: FreestyleVmRecord,
  revision: number,
  log: (l: string) => void,
): Promise<void> {
  if (record.domain && record.ruleId) return;

  const existing = await findIngressRule(freestyle, record.vmId);
  if (existing) {
    record.domain = existing.domain;
    record.ruleId = existing.id;
    log(`ingress rule ${existing.id} already routes https://${existing.domain}`);
    return;
  }

  const attempts = [freestyleDomainFor(wsId), freestyleDomainFor(wsId, revision)];
  let lastErr: unknown = null;
  for (let i = 0; i < attempts.length; i++) {
    const domain = attempts[i];
    try {
      const rule = await freestyle.tls.rules.create({
        action: "allow",
        domain,
        source: { public: true },
        destination: { vmId: record.vmId, port: PORT },
      });
      record.domain = rule.domain;
      record.ruleId = rule.id;
      log(`tls.rules.create ok · ${rule.id} → https://${rule.domain}`);
      return;
    } catch (err) {
      lastErr = err;
      if (!isConflict(err)) throw err;
      // The domain may already be ours (rule created by a previous process); re-check before retrying.
      const ours = await findIngressRule(freestyle, record.vmId);
      if (ours) {
        record.domain = ours.domain;
        record.ruleId = ours.id;
        log(`domain ${domain} already routed by our rule ${ours.id}`);
        return;
      }
      log(
        `domain ${domain} unavailable (${describeError(err)})${i + 1 < attempts.length ? "; retrying with revision suffix" : ""}`,
      );
    }
  }
  throw new Error(`could not claim a domain (tried ${attempts.join(", ")}): ${describeError(lastErr)}`);
}

// ── Verify ───────────────────────────────────────────────────────────────────

async function verifyPreview(url: string, log: (l: string) => void): Promise<number | null> {
  const deadline = Date.now() + VERIFY_WINDOW_MS;
  let last: number | null = null;
  let lastErr: string | null = null;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    try {
      const res = await fetch(url, { cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      await res.arrayBuffer().catch(() => undefined);
      last = res.status;
      if (res.status === 200) {
        log(`verify: HTTP 200 after ${attempt} attempt(s)`);
        return 200;
      }
      // 502/503 while the edge picks up the new route: not yet.
    } catch (err) {
      lastErr = describeError(err);
    }
    await sleep(VERIFY_INTERVAL_MS);
  }
  log(
    `verify: no HTTP 200 within ${VERIFY_WINDOW_MS / 1000}s (${attempt} attempts; last status ${last ?? "none"}${lastErr ? `; last error ${lastErr}` : ""})`,
  );
  return last;
}

// ── Auth check ───────────────────────────────────────────────────────────────

/** Cheap auth check used by /api/health and the smoke test. Cached for 30s. */
export async function verifyFreestyle(): Promise<{ ok: boolean; detail: string }> {
  if (!freestyleApiKey()) return { ok: false, detail: "FREESTYLE_API_KEY not set" };
  const s = state();
  if (s.verifyCache && Date.now() - s.verifyCache.at < 30_000) return s.verifyCache.result;
  let result: { ok: boolean; detail: string };
  try {
    const client = await getFreestyleClient();
    const res = await client.vms.list({ limit: 1 });
    result = { ok: true, detail: `Freestyle reachable · ${res.totalCount} VM(s), ${res.runningCount} running` };
  } catch (err) {
    result = { ok: false, detail: `Freestyle auth check failed: ${describeError(err)}` };
  }
  s.verifyCache = { at: Date.now(), result };
  return result;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function execOk(vm: Vm, command: string, timeoutMs: number): Promise<string> {
  const res = await vm.exec({ command, timeoutMs });
  if (res.statusCode === null || res.statusCode === undefined) {
    throw new Error(`command timed out after ${timeoutMs}ms: ${command}`);
  }
  if (res.statusCode !== 0) {
    const err = (res.stderr ?? "").trim() || (res.stdout ?? "").trim();
    throw new Error(`command exited ${res.statusCode}: ${command}${err ? `\n${err}` : ""}`);
  }
  return res.stdout ?? "";
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function isFreestyleApiError(err: unknown): err is FreestyleApiErrorLike {
  if (!(err instanceof Error)) return false;
  const e = err as Partial<FreestyleApiErrorLike>;
  return e.name === "FreestyleApiError" && typeof e.code === "string" && typeof e.status === "number";
}

function isNotFound(err: unknown): boolean {
  return isFreestyleApiError(err) && (err.status === 404 || /NOT_FOUND/i.test(err.code));
}

function isConflict(err: unknown): boolean {
  if (!isFreestyleApiError(err)) return false;
  if (err.status === 409) return true;
  if (/CONFLICT|ALREADY|EXISTS|TAKEN|IN_USE|DUPLICATE|UNAVAILABLE/i.test(err.code)) return true;
  return err.status === 400 && /(already|taken|in use|exists)/i.test(err.message);
}

export function describeError(err: unknown): string {
  if (isFreestyleApiError(err)) {
    return `${err.code} (HTTP ${err.status})${err.path ? ` ${err.path}` : ""}: ${err.message}`;
  }
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: unknown }).cause;
    const causeMsg = cause instanceof Error && cause.message !== err.message ? ` · ${cause.message}` : "";
    return `${err.message}${causeMsg}`;
  }
  return String(err);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
