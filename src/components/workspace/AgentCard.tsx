"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Agent, Task } from "@/lib/types";
import { AGENT_COLORS } from "@/lib/types";
import { Chip, type ChipTone } from "@/components/ui/Chip";
import { agentStatusLabel, isAgentBusy, formatRelative } from "@/lib/client/format";
import { AgentGlyph } from "./Avatar";
import { StatusDot } from "./StatusDot";

export interface AgentCardProps {
  agent: Agent;
  /** Tasks for this agent in the current revision. */
  tasks: Task[];
  currentTask: Task | null;
  now: number;
}

function statusTone(agent: Agent): ChipTone {
  switch (agent.status) {
    case "thinking":
    case "working":
      return agent.role;
    case "done":
      return "ok";
    case "error":
      return "err";
    case "waiting":
      return "warn";
    default:
      return "neutral";
  }
}

export function AgentCard({ agent, tasks, currentTask, now }: AgentCardProps) {
  const reduce = useReducedMotion();
  const color = AGENT_COLORS[agent.role];
  const busy = isAgentBusy(agent.status);
  const done = tasks.filter((t) => t.status === "done").length;
  const total = tasks.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const isError = agent.status === "error";

  return (
    <div
      className={[
        "group/card relative rounded-lg border bg-bg-2 p-3 transition-colors duration-200",
        isError ? "border-err/35" : busy ? "border-line-2" : "border-line-0",
      ].join(" ")}
      style={{ boxShadow: "var(--shadow-1)" }}
    >
      <div className="flex items-start gap-2.5">
        <AgentGlyph role={agent.role} size={28} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-semibold text-fg-0">{agent.name}</span>
            <StatusDot color={isError ? "var(--err)" : color} active={busy} size={6} />
            <Chip tone={statusTone(agent)} layout className="ml-auto">
              {agentStatusLabel(agent.status)}
            </Chip>
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-fg-3" title={`${agent.provider} · ${agent.model}`}>
            {agent.provider}
            <span className="mx-1 text-fg-3/60">·</span>
            {agent.model}
          </div>
        </div>
      </div>

      <div className="mt-2.5 min-h-[16px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={`${agent.status}:${agent.statusDetail ?? ""}`}
            initial={reduce ? false : { opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -3 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={["line-clamp-2 text-[12px] leading-[16px]", isError ? "text-err" : "text-fg-1"].join(" ")}
          >
            {agent.statusDetail ??
              (agent.status === "idle"
                ? "Waiting for a requirement."
                : agent.status === "done"
                  ? "Finished this revision."
                  : agentStatusLabel(agent.status))}
          </motion.p>
        </AnimatePresence>
      </div>

      {currentTask ? (
        <div className="mt-2 flex items-center gap-1.5 text-[12px] text-fg-2">
          <span className="shrink-0 text-fg-3">Task</span>
          <span className="truncate text-fg-1" title={currentTask.title}>
            {currentTask.title}
          </span>
          {currentTask.startedAt && currentTask.status === "running" ? (
            <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-fg-3">
              {formatRelative(currentTask.startedAt, now)}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-2.5 flex items-center gap-2">
        <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-bg-4">
          <motion.div
            className="h-full rounded-full"
            style={{ background: isError ? "var(--err)" : color }}
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={reduce ? { duration: 0 } : { duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-fg-3">
          {done}/{total}
        </span>
      </div>
    </div>
  );
}
