/**
 * Browser-side identity for Relay. Humans are identified by a stable id kept
 * in localStorage under `relay:identity` so that refreshes, new tabs and the
 * workspace page all agree on who this person is.
 *
 * Client-only: every function here touches `window`; call from effects or
 * event handlers, never during server render.
 */

export const IDENTITY_KEY = "relay:identity";

export interface Identity {
  id: string;
  name: string;
}

/** RFC 4122 v4 UUID. Falls back to getRandomValues on insecure origins (LAN demos over http). */
export function uuid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Returns the stored identity, or null when absent or malformed. */
export function readIdentity(): Identity | null {
  const storage = safeStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as Identity).id === "string" &&
      (parsed as Identity).id.length > 0 &&
      typeof (parsed as Identity).name === "string"
    ) {
      return { id: (parsed as Identity).id, name: (parsed as Identity).name };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Persists a name, keeping the existing id when one is already stored so a
 * rename never changes who the server thinks you are. Returns the identity.
 */
export function saveIdentity(name: string): Identity {
  const trimmed = name.trim();
  const existing = readIdentity();
  const identity: Identity = { id: existing?.id ?? uuid(), name: trimmed };
  const storage = safeStorage();
  if (storage) {
    try {
      storage.setItem(IDENTITY_KEY, JSON.stringify(identity));
    } catch {
      // Storage can be full or blocked (private mode). The in-memory identity
      // is still valid for this navigation; the workspace page re-asks if needed.
    }
  }
  return identity;
}
