import type { ReactNode } from "react";
import type { Actor } from "@/lib/types";
import { AGENT_COLORS } from "@/lib/types";
import { formatClock, formatRelative } from "@/lib/client/format";
import { ActorAvatar } from "../Avatar";

export interface RowFrameProps {
  actor: Actor;
  createdAt: number;
  now: number;
  /** Extra inline items after the name (chips, tags). */
  meta?: ReactNode;
  children?: ReactNode;
  /** Hide the name/time header (compact rows). */
  compact?: boolean;
  className?: string;
  /** Use a smaller 20px gutter avatar. */
  gutter?: ReactNode;
}

export function Timestamp({ createdAt, now, className }: { createdAt: number; now: number; className?: string }) {
  return (
    <time
      dateTime={new Date(createdAt).toISOString()}
      title={new Date(createdAt).toLocaleString()}
      className={["shrink-0 font-mono text-[11px] tabular-nums text-fg-3", className].filter(Boolean).join(" ")}
    >
      {formatRelative(createdAt, now)}
      <span className="sr-only"> ({formatClock(createdAt)})</span>
    </time>
  );
}

export function actorNameClass(actor: Actor): string {
  if (actor.kind === "agent") return "font-semibold";
  if (actor.kind === "human") return "font-semibold text-fg-0";
  return "font-medium text-fg-2";
}

export function actorColor(actor: Actor): string | undefined {
  if (actor.kind === "agent" && actor.role) return AGENT_COLORS[actor.role];
  return undefined;
}

export function RowFrame({ actor, createdAt, now, meta, children, compact = false, className, gutter }: RowFrameProps) {
  return (
    <div className={["flex gap-3", className].filter(Boolean).join(" ")}>
      <div className="w-6 shrink-0 pt-px">{gutter ?? <ActorAvatar actor={actor} size={24} />}</div>
      <div className="min-w-0 flex-1">
        {!compact ? (
          <div className="flex min-h-[18px] items-center gap-2 text-[12px] leading-[18px]">
            <span className={["truncate", actorNameClass(actor)].join(" ")} style={{ color: actorColor(actor) }}>
              {actor.name}
            </span>
            {meta}
            <Timestamp createdAt={createdAt} now={now} className="ml-auto" />
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

/** One-line system row (joined, created). */
export function SystemLine({ children, createdAt, now }: { children: ReactNode; createdAt: number; now: number }) {
  return (
    <div className="flex items-center gap-3 text-[12px] text-fg-3">
      <span className="flex w-6 shrink-0 justify-center">
        <span className="block h-1 w-1 rounded-full bg-fg-3/70" />
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <Timestamp createdAt={createdAt} now={now} />
    </div>
  );
}
