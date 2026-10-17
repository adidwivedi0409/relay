"use client";

import { memo } from "react";
import type { RelayEvent } from "@/lib/types";
import { BuildRow } from "./rows/BuildRow";
import { CascadeRow } from "./rows/CascadeRow";
import { ErrorRow } from "./rows/ErrorRow";
import { HandoffRow } from "./rows/HandoffRow";
import { AgentMessageRow, HumanMessageRow, RequirementRow, SystemRow } from "./rows/MessageRows";
import { PlanRow } from "./rows/PlanRow";
import { ReviewRow } from "./rows/ReviewRow";
import { TaskRow } from "./rows/TaskRow";

export interface TimelineRowProps {
  event: RelayEvent;
  now: number;
  /** For collapsed task runs: how many events this row represents. */
  collapsed?: number;
}

export function isTaskEvent(type: RelayEvent["type"]): boolean {
  return type.startsWith("task.");
}

export function isRenderable(type: RelayEvent["type"]): boolean {
  // agent.status drives the agent cards, never the timeline.
  return type !== "agent.status";
}

/** Row density: compact rows get less vertical padding. */
export function rowDensity(type: RelayEvent["type"]): "compact" | "normal" {
  switch (type) {
    case "workspace.created":
    case "participant.joined":
    case "participant.left":
    case "task.created":
    case "task.started":
    case "task.stale":
    case "task.completed":
    case "task.failed":
      return "compact";
    default:
      return "normal";
  }
}

function RowSwitch({ event, now, collapsed = 1 }: TimelineRowProps) {
  switch (event.type) {
    case "human.message":
      return <HumanMessageRow event={event} now={now} />;
    case "requirement.added":
      return <RequirementRow event={event} now={now} />;
    case "agent.message":
      return <AgentMessageRow event={event} now={now} />;
    case "agent.handoff":
      return <HandoffRow event={event} now={now} />;
    case "task.created":
    case "task.started":
    case "task.stale":
    case "task.completed":
    case "task.failed":
      return <TaskRow event={event} now={now} collapsed={collapsed} />;
    case "plan.created":
    case "plan.revised":
      return <PlanRow event={event} now={now} />;
    case "build.started":
    case "build.succeeded":
    case "build.failed":
      return <BuildRow event={event} now={now} />;
    case "review.completed":
      return <ReviewRow event={event} now={now} />;
    case "revision.cascade":
      return <CascadeRow event={event} now={now} />;
    case "error":
      return <ErrorRow event={event} now={now} />;
    case "workspace.created":
    case "participant.joined":
    case "participant.left":
    case "agent.status":
      return <SystemRow event={event} now={now} />;
  }
}

export const TimelineRow = memo(function TimelineRow(props: TimelineRowProps) {
  return <RowSwitch {...props} />;
});
