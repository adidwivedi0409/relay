// ─────────────────────────────────────────────────────────────────────────────
// Relay — id generation + deterministic colour assignment.
// Workspace ids are short, lowercase, URL-safe (they appear in share links and
// in Freestyle slugs/domains, which only accept [a-z0-9-]). Everything else
// uses the default nanoid alphabet.
// ─────────────────────────────────────────────────────────────────────────────
import { customAlphabet, nanoid } from "nanoid";
import { HUMAN_COLORS, type AgentRole } from "@/lib/types";

export const WORKSPACE_ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
export const WORKSPACE_ID_LENGTH = 10;

const workspaceNanoid = customAlphabet(WORKSPACE_ID_ALPHABET, WORKSPACE_ID_LENGTH);

/** 10-char lowercase alphanumeric id, safe for URLs, slugs and DNS labels. */
export function newWorkspaceId(): string {
  return workspaceNanoid();
}

/** True when `value` has the exact shape produced by `newWorkspaceId()`. */
export function isWorkspaceId(value: unknown): value is string {
  return typeof value === "string" && new RegExp(`^[${WORKSPACE_ID_ALPHABET}]{${WORKSPACE_ID_LENGTH}}$`).test(value);
}

/** Default nanoid (21 chars, URL-safe). Used for events, tasks, requirements, artifacts. */
export function newId(size?: number): string {
  return nanoid(size);
}

/** Stable per-workspace agent id so UI keys survive restarts. */
export function agentId(workspaceId: string, role: AgentRole): string {
  return `${workspaceId}:${role}`;
}

/**
 * Colour for the n-th human to join a workspace (0-based join order).
 * Deterministic: the same join order always yields the same colour, and the
 * palette wraps when more people join than there are colours.
 */
export function colorForJoinIndex(index: number): string {
  const n = HUMAN_COLORS.length;
  const i = Number.isFinite(index) && index >= 0 ? Math.floor(index) % n : 0;
  return HUMAN_COLORS[i];
}
