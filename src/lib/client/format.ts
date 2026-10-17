import type { AgentRole, AgentStatus, BuildStatus, ExecutorKind, TaskStatus } from "@/lib/types";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatClock(ts: number): string {
  const d = new Date(ts);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

/** "just now" / "12s ago" / "4m ago" / "14:32" (older than an hour). */
export function formatRelative(ts: number, now: number): string {
  const diff = Math.max(0, now - ts);
  if (diff < 5_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return formatClock(ts);
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function shortId(id: string | null | undefined, length = 8): string {
  if (!id) return "";
  return id.length <= length ? id : id.slice(0, length);
}

export function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

export function excerpt(text: string, max = 72): string {
  return truncate(text.replace(/\s+/g, " "), max);
}

export function revisionLabel(revision: number): string {
  return `r${revision}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function isBuildInFlight(status: BuildStatus): boolean {
  return status === "provisioning" || status === "writing" || status === "building";
}

export function buildStatusLabel(status: BuildStatus): string {
  switch (status) {
    case "idle":
      return "Idle";
    case "provisioning":
      return "Provisioning";
    case "writing":
      return "Writing files";
    case "building":
      return "Building";
    case "live":
      return "Live";
    case "failed":
      return "Failed";
  }
}

export function buildStatusProgress(status: BuildStatus): string {
  switch (status) {
    case "provisioning":
      return "Provisioning sandbox…";
    case "writing":
      return "Writing files…";
    case "building":
      return "Building…";
    default:
      return "";
  }
}

export function executorLabel(kind: ExecutorKind): string {
  return kind === "freestyle" ? "Freestyle VM" : "Local fallback";
}

export function agentStatusLabel(status: AgentStatus): string {
  switch (status) {
    case "idle":
      return "Idle";
    case "thinking":
      return "Thinking";
    case "working":
      return "Working";
    case "waiting":
      return "Waiting";
    case "done":
      return "Done";
    case "error":
      return "Error";
  }
}

export function taskStatusLabel(status: TaskStatus): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "stale":
      return "Stale";
    case "done":
      return "Done";
    case "failed":
      return "Failed";
    case "superseded":
      return "Superseded";
  }
}

export function roleGlyph(role: AgentRole): string {
  return role === "architect" ? "A" : role === "builder" ? "B" : "R";
}

export function roleLabel(role: AgentRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function isAgentBusy(status: AgentStatus): boolean {
  return status === "thinking" || status === "working";
}
