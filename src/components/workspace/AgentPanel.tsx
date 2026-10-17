"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";
import type { Agent, AgentRole, Task, Workspace } from "@/lib/types";
import { AGENT_COLORS } from "@/lib/types";
import { Chip, type ChipTone } from "@/components/ui/Chip";
import { taskStatusLabel } from "@/lib/client/format";
import { AgentCard } from "./AgentCard";
import { StatusDot } from "./StatusDot";
import { rowMotion, rowTransition } from "./motion";

export interface AgentPanelProps {
  workspace: Workspace;
  agents: Agent[];
  tasks: Task[];
  now: number;
}

const ROLE_ORDER: AgentRole[] = ["architect", "builder", "reviewer"];

export function taskTone(status: Task["status"]): ChipTone {
  switch (status) {
    case "running":
      return "accent";
    case "done":
      return "ok";
    case "failed":
      return "err";
    case "stale":
    case "superseded":
      return "warn";
    default:
      return "neutral";
  }
}

export function AgentPanel({ workspace, agents, tasks, now }: AgentPanelProps) {
  const reduce = useReducedMotion();
  const currentRevision = workspace.activeRevision ?? workspace.revision;

  const ordered = useMemo(
    () => ROLE_ORDER.map((role) => agents.find((a) => a.role === role)).filter((a): a is Agent => Boolean(a)),
    [agents],
  );

  const revisionTasks = useMemo(
    () => tasks.filter((t) => t.baseRevision === currentRevision).sort((a, b) => a.createdAt - b.createdAt),
    [tasks, currentRevision],
  );

  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-line-0 bg-bg-1">
      <div className="flex h-10 shrink-0 items-center justify-between px-3.5">
        <span className="text-[12px] font-medium uppercase tracking-[0.06em] text-fg-2">Agent team</span>
        <span className="font-mono text-[11px] tabular-nums text-fg-3">{ordered.length}</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3">
        <div className="flex flex-col gap-2">
          {ordered.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              now={now}
              tasks={revisionTasks.filter((t) => t.agentRole === agent.role)}
              currentTask={agent.currentTaskId ? (byId.get(agent.currentTaskId) ?? null) : null}
            />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between px-0.5">
          <span className="text-[12px] font-medium uppercase tracking-[0.06em] text-fg-2">Tasks</span>
          <span className="font-mono text-[11px] tabular-nums text-fg-3">r{currentRevision}</span>
        </div>

        <ul className="mt-2 flex flex-col gap-px">
          <AnimatePresence initial={false}>
            {revisionTasks.length === 0 ? (
              <motion.li
                key="empty"
                {...rowMotion}
                initial={reduce ? false : rowMotion.initial}
                transition={rowTransition}
                className="rounded-md border border-dashed border-line-1 px-2.5 py-2 text-[12px] text-fg-3"
              >
                No tasks planned for this revision yet.
              </motion.li>
            ) : (
              revisionTasks.map((task) => (
                <motion.li
                  key={task.id}
                  layout={!reduce}
                  {...rowMotion}
                  initial={reduce ? false : rowMotion.initial}
                  transition={rowTransition}
                  className="group flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-bg-2"
                  title={task.description}
                >
                  <StatusDot color={AGENT_COLORS[task.agentRole]} active={task.status === "running"} size={6} />
                  <span
                    className={[
                      "min-w-0 flex-1 truncate text-[12px]",
                      task.status === "superseded" || task.status === "stale" ? "text-fg-3 line-through decoration-fg-3/50" : "text-fg-1",
                    ].join(" ")}
                  >
                    {task.title}
                  </span>
                  <Chip tone={taskTone(task.status)} layout>
                    {taskStatusLabel(task.status)}
                  </Chip>
                </motion.li>
              ))
            )}
          </AnimatePresence>
        </ul>
      </div>
    </aside>
  );
}
