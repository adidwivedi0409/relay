"use client";

import type { RelayEvent, Task } from "@/lib/types";
import { AGENT_COLORS, AGENT_NAMES } from "@/lib/types";
import { Chip } from "@/components/ui/Chip";
import { formatDuration, taskStatusLabel } from "@/lib/client/format";
import { StatusDot } from "../StatusDot";
import { taskTone } from "../AgentPanel";
import { asTask, str } from "./payload";
import { Timestamp } from "./RowFrame";

export interface TaskRowProps {
  /** Latest task.* event in the collapsed run. */
  event: RelayEvent;
  /** Number of task.* events collapsed into this row. */
  collapsed: number;
  now: number;
}

function taskFromEvent(event: RelayEvent): Task | null {
  return asTask(event.payload.task);
}

function statusFromType(type: RelayEvent["type"]): Task["status"] | null {
  switch (type) {
    case "task.created":
      return "queued";
    case "task.started":
      return "running";
    case "task.stale":
      return "stale";
    case "task.completed":
      return "done";
    case "task.failed":
      return "failed";
    default:
      return null;
  }
}

export function TaskRow({ event, now }: TaskRowProps) {
  const task = taskFromEvent(event);
  const status: Task["status"] = task?.status ?? statusFromType(event.type) ?? "queued";
  const role = task?.agentRole ?? event.actor.role ?? "builder";
  const title = task?.title ?? str(event.payload, "title") ?? event.message;
  const output = status === "done" ? (task?.output ?? str(event.payload, "output")) : null;
  const error = status === "failed" ? (task?.error ?? str(event.payload, "error")) : null;
  const duration = task?.startedAt && task.finishedAt ? task.finishedAt - task.startedAt : null;
  const muted = status === "superseded" || status === "stale";

  return (
    <div className="flex gap-3">
      <div className="flex w-6 shrink-0 items-start justify-center pt-[7px]">
        <StatusDot color={AGENT_COLORS[role]} active={status === "running"} size={6} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[12px] font-medium" style={{ color: AGENT_COLORS[role] }}>
            {AGENT_NAMES[role]}
          </span>
          <span className={["min-w-0 truncate text-[13px]", muted ? "text-fg-3 line-through decoration-fg-3/50" : "text-fg-0"].join(" ")} title={title}>
            {title}
          </span>
          <Chip tone={taskTone(status)} layout dot={status === "running"} pulse={status === "running"}>
            {taskStatusLabel(status)}
          </Chip>
          {duration !== null && status === "done" ? (
            <span className="font-mono text-[11px] tabular-nums text-fg-3">{formatDuration(duration)}</span>
          ) : null}
          <Timestamp createdAt={event.createdAt} now={now} className="ml-auto" />
        </div>
        {output ? <p className="mt-1 text-[13px] leading-[18px] text-fg-2">{output}</p> : null}
        {error ? <p className="mt-1 text-[13px] leading-[18px] text-err">{error}</p> : null}
        {status === "stale" ? (
          <p className="mt-1 text-[12px] leading-[16px] text-warn/90">Requirements moved past r{task?.baseRevision ?? event.revision} while this task was running.</p>
        ) : null}
      </div>
    </div>
  );
}
