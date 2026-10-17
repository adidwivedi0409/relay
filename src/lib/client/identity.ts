// Client-side identity: a small {id, name} pair persisted in localStorage so a
// browser keeps the same participant id across reloads and workspaces.
// Exposed as a tiny external store so React can read it with
// useSyncExternalStore (null during SSR, the stored value after hydration).

export interface Identity {
  id: string;
  name: string;
}

export const IDENTITY_KEY = "relay:identity";
export const MAX_NAME_LENGTH = 32;

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    // nanoid-ish: 21 url-safe chars derived from a UUID.
    return crypto.randomUUID().replace(/-/g, "").slice(0, 21);
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 21);
}

export function normalizeName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
}

function isIdentity(value: unknown): value is Identity {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && v.id.length > 0 && typeof v.name === "string" && v.name.trim().length > 0;
}

function readStorage(): Identity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isIdentity(parsed) ? { id: parsed.id, name: normalizeName(parsed.name) } : null;
  } catch {
    return null;
  }
}

// ── store ────────────────────────────────────────────────────────────────────

let cached: Identity | null | undefined;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

/** Stable snapshot for useSyncExternalStore (same object until it changes). */
export function getIdentitySnapshot(): Identity | null {
  if (cached === undefined) cached = readStorage();
  return cached;
}

export function getIdentityServerSnapshot(): null {
  return null;
}

export function subscribeIdentity(fn: () => void): () => void {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key === IDENTITY_KEY || e.key === null) {
      cached = readStorage();
      fn();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

export function loadIdentity(): Identity | null {
  return getIdentitySnapshot();
}

export function saveIdentity(identity: Identity): void {
  cached = identity;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
    } catch {
      // Storage may be unavailable (private mode, blocked). The in-memory
      // identity still works for this session.
    }
  }
  notify();
}

export function createIdentity(name: string): Identity {
  const identity: Identity = { id: randomId(), name: normalizeName(name) };
  saveIdentity(identity);
  return identity;
}

/** Keep the existing id when the person renames themselves. */
export function renameIdentity(name: string): Identity {
  const existing = getIdentitySnapshot();
  const identity: Identity = { id: existing?.id ?? randomId(), name: normalizeName(name) };
  saveIdentity(identity);
  return identity;
}
