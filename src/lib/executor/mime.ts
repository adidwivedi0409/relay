// ─────────────────────────────────────────────────────────────────────────────
// MIME lookup for artifact files. Used by the local artifact route and by the
// Node static server we write into a Freestyle VM when python3 is missing.
// ─────────────────────────────────────────────────────────────────────────────

const MIME_BY_EXT: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  cjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  map: "application/json; charset=utf-8",
  webmanifest: "application/manifest+json; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  bmp: "image/bmp",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  eot: "application/vnd.ms-fontobject",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  pdf: "application/pdf",
  wasm: "application/wasm",
  zip: "application/zip",
};

export const DEFAULT_CONTENT_TYPE = "application/octet-stream";

/** File extension (lowercase, without the dot) of a path, or "" when it has none. */
export function extensionOf(path: string): string {
  const base = path.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

/** Content-Type (with charset for text types) for a file path. */
export function contentTypeFor(path: string): string {
  return MIME_BY_EXT[extensionOf(path)] ?? DEFAULT_CONTENT_TYPE;
}

/** Whether a content type is textual, i.e. safe to read and send as a UTF-8 string. */
export function isTextContentType(contentType: string): boolean {
  const base = contentType.split(";")[0].trim().toLowerCase();
  return (
    base.startsWith("text/") ||
    base === "application/json" ||
    base === "application/xml" ||
    base === "application/manifest+json" ||
    base === "image/svg+xml"
  );
}

/**
 * The same table as a JSON literal without charsets, for embedding in the
 * Node static server written into a VM (`/srv/serve.js`).
 */
export function mimeTableForEmbedding(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [ext, type] of Object.entries(MIME_BY_EXT)) out[ext] = type.split(";")[0].trim();
  return out;
}
