"use client";

import { useSyncExternalStore } from "react";
import { IDENTITY_KEY, readIdentity } from "./identity";

function subscribe(onChange: () => void): () => void {
  const handler = (event: StorageEvent) => {
    if (event.key === null || event.key === IDENTITY_KEY) onChange();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

// Returns a primitive so React can compare snapshots by value.
function getSnapshot(): string {
  return readIdentity()?.name ?? "";
}

function getServerSnapshot(): string | null {
  return null;
}

/**
 * The name stored in `relay:identity`, read without a hydration mismatch:
 * `null` during server render and hydration (unknown yet), `""` when no
 * identity is stored, otherwise the stored name. Updates when another tab
 * writes the identity.
 */
export function useStoredIdentityName(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
