// ─────────────────────────────────────────────────────────────────────────────
// Local executor: the clearly-labelled fallback used when FREESTYLE_API_KEY is
// not configured. Files are written to data/artifacts/<wsId>/<revision>/ and
// served by the artifact route (src/app/api/workspaces/[id]/artifact/...),
// which always reads from the highest revision directory.
// ─────────────────────────────────────────────────────────────────────────────

import { promises as fsp } from "node:fs";
import path from "node:path";
import type { ArtifactFile, BuildStatus } from "@/lib/types";
import { contentTypeFor, isTextContentType } from "./mime";

export interface LocalDeployResult {
  previewUrl: string;
  sandboxId: null;
  executor: "local";
  httpStatus: number | null;
  logs: string[];
}

// Same root as the store's data dir (see RELAY_DATA_DIR in src/lib/store.ts).
export const ARTIFACT_ROOT = path.join(
  process.env.RELAY_DATA_DIR ? path.resolve(process.env.RELAY_DATA_DIR) : path.join(process.cwd(), "data"),
  "artifacts",
);

const WS_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const SEGMENT_RE = /^[A-Za-z0-9._@~ ()+,=-]{1,128}$/;

/** Base URL humans can open; the Next server that also hosts the artifact route. */
export function appBaseUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  return (raw || "http://localhost:3000").replace(/\/+$/, "");
}

/** Validate a workspace id before it touches the filesystem. */
export function isValidWorkspaceId(wsId: string): boolean {
  return WS_ID_RE.test(wsId);
}

/**
 * Normalise a relative artifact path. Returns null when the path is absolute,
 * escapes its directory (".."), contains backslashes or control characters,
 * or has an empty / dot-only segment.
 */
export function sanitizeRelativePath(input: string): string | null {
  if (typeof input !== "string" || input.length === 0 || input.length > 512) return null;
  if (input.includes("\0") || input.includes("\\")) return null;
  if (input.startsWith("/")) return null;
  const parts = input.split("/");
  for (const part of parts) {
    if (part === "" || part === "." || part === "..") return null;
    if (!SEGMENT_RE.test(part)) return null;
  }
  return parts.join("/");
}

/** Workspace artifact directory for a revision. */
export function revisionDir(wsId: string, revision: number): string {
  return path.join(ARTIFACT_ROOT, wsId, String(revision));
}

/** Highest numbered revision directory for a workspace, or null when none exists. */
export async function latestRevision(wsId: string): Promise<number | null> {
  if (!isValidWorkspaceId(wsId)) return null;
  let entries: string[];
  try {
    entries = await fsp.readdir(path.join(ARTIFACT_ROOT, wsId));
  } catch {
    return null;
  }
  let best: number | null = null;
  for (const name of entries) {
    if (!/^\d+$/.test(name)) continue;
    const n = Number(name);
    if (!Number.isSafeInteger(n)) continue;
    if (best === null || n > best) best = n;
  }
  return best;
}

export async function deployLocal(
  wsId: string,
  files: ArtifactFile[],
  revision: number,
  onProgress: (status: BuildStatus, detail: string) => void,
): Promise<LocalDeployResult> {
  const logs: string[] = [];
  const log = (line: string) => {
    logs.push(line);
  };

  if (!isValidWorkspaceId(wsId)) throw new Error(`Local executor: invalid workspace id "${wsId}"`);
  if (!Number.isInteger(revision) || revision < 0) throw new Error(`Local executor: invalid revision ${revision}`);
  if (files.length === 0) throw new Error("Local executor: no files to deploy");

  const sanitized: { rel: string; content: string }[] = [];
  for (const f of files) {
    const rel = sanitizeRelativePath(f.path);
    if (!rel) throw new Error(`Local executor: refusing unsafe file path "${f.path}"`);
    sanitized.push({ rel, content: f.content });
  }
  if (!sanitized.some((f) => f.rel === "index.html")) {
    log("warning: file set has no index.html; the preview root will 404");
  }

  const dir = revisionDir(wsId, revision);
  const relDir = path.relative(process.cwd(), dir);

  onProgress("provisioning", `Preparing local artifact directory ${relDir}`);
  const t0 = Date.now();
  await fsp.mkdir(dir, { recursive: true });
  log(`mkdir ${relDir}`);

  onProgress("writing", `Writing ${sanitized.length} files to ${relDir}`);
  for (const f of sanitized) {
    const abs = path.join(dir, f.rel);
    // Belt and braces: the sanitiser already forbids "..", but never write outside dir.
    if (!abs.startsWith(dir + path.sep)) throw new Error(`Local executor: path escapes revision dir: ${f.rel}`);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, f.content, "utf8");
    log(`wrote ${f.rel} (${Buffer.byteLength(f.content, "utf8")} bytes)`);
  }

  const previewUrl = `${appBaseUrl()}/api/workspaces/${encodeURIComponent(wsId)}/artifact/index.html?v=${revision}`;
  onProgress("building", `Publishing revision ${revision} via local static route`);

  const httpStatus = await verifyLocalPreview(previewUrl, log);
  log(`local deploy finished in ${Date.now() - t0}ms · previewUrl=${previewUrl} · httpStatus=${httpStatus ?? "unreachable"}`);

  return { previewUrl, sandboxId: null, executor: "local", httpStatus, logs };
}

/**
 * Best-effort HTTP verification of the local preview. The artifact route lives
 * in the same Next server, so this normally returns 200 within one attempt.
 * When no server is listening (e.g. a CLI script) we stop after the first
 * connection failure instead of waiting out the full window.
 */
async function verifyLocalPreview(previewUrl: string, log: (l: string) => void): Promise<number | null> {
  const deadline = Date.now() + 8_000;
  let last: number | null = null;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    try {
      const res = await fetch(previewUrl, { cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(4_000) });
      last = res.status;
      await res.arrayBuffer().catch(() => undefined);
      if (res.status === 200) {
        log(`verify: HTTP 200 on attempt ${attempt}`);
        return 200;
      }
      log(`verify: HTTP ${res.status} on attempt ${attempt}, retrying`);
    } catch (err) {
      log(`verify: preview not reachable at ${previewUrl} (${errorMessage(err)}); is the Next server running?`);
      return last;
    }
    await sleep(500);
  }
  log(`verify: gave up after ${attempt} attempts; last status ${last ?? "none"}`);
  return last;
}

/**
 * Read a file from the LATEST revision of a workspace's local artifact.
 * Returns null when the workspace has no artifact, the path is unsafe, or the
 * file does not exist. Text types come back as UTF-8 strings, binaries as bytes.
 */
export async function getLocalArtifactFile(
  wsId: string,
  relPath: string,
): Promise<{ content: string | Uint8Array; contentType: string } | null> {
  if (!isValidWorkspaceId(wsId)) return null;
  const rel = sanitizeRelativePath(relPath || "index.html");
  if (!rel) return null;
  const rev = await latestRevision(wsId);
  if (rev === null) return null;

  const dir = revisionDir(wsId, rev);
  const abs = path.resolve(dir, rel);
  if (abs !== dir && !abs.startsWith(dir + path.sep)) return null;

  let stat;
  try {
    stat = await fsp.stat(abs);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;

  const contentType = contentTypeFor(rel);
  if (isTextContentType(contentType)) {
    const content = await fsp.readFile(abs, "utf8");
    return { content, contentType };
  }
  const buf = await fsp.readFile(abs);
  return { content: new Uint8Array(buf), contentType };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: unknown }).cause;
    const causeMsg = cause instanceof Error ? ` · ${cause.message}` : "";
    return `${err.message}${causeMsg}`;
  }
  return String(err);
}
