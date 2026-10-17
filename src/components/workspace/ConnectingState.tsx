"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ConnectionPhase } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/Button";
import { IconRefresh, IconSpinner } from "@/components/ui/icons";
import { StatusDot } from "./StatusDot";
import { EASE_OUT } from "./motion";

export interface ConnectingStateProps {
  phase: ConnectionPhase;
  error: string | null;
  onRetry: () => void;
}

function label(phase: ConnectionPhase): string {
  switch (phase) {
    case "booting":
      return "Loading";
    case "needs-identity":
      return "Waiting for your name";
    case "joining":
      return "Joining workspace";
    case "connecting":
      return "Opening live stream";
    case "reconnecting":
      return "Reconnecting";
    case "error":
      return "Could not reach the server";
    case "live":
      return "Syncing";
    case "not-found":
      return "Workspace not found";
  }
}

function Block({ className }: { className?: string }) {
  return <div className={["shimmer rounded-md", className].filter(Boolean).join(" ")} />;
}

export function ConnectingState({ phase, error, onRetry }: ConnectingStateProps) {
  const reduce = useReducedMotion();
  const isError = phase === "error";
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-bg-0 text-fg-0">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line-0 bg-bg-1 px-3.5">
        <span className="text-[14px] font-semibold tracking-tight">Relay</span>
        <span className="h-4 w-px bg-line-2" />
        <Block className="h-3.5 w-36" />
        <span className="ml-auto inline-flex items-center gap-1.5 text-[11.5px] text-fg-2">
          <StatusDot color={isError ? "var(--err)" : "var(--warn)"} active={!isError} size={6} />
          {label(phase)}
        </span>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-[272px] shrink-0 border-r border-line-0 bg-bg-1 p-3">
          <Block className="mb-3 h-3 w-20" />
          <div className="flex flex-col gap-2">
            <Block className="h-[104px]" />
            <Block className="h-[104px]" />
            <Block className="h-[104px]" />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-center">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: EASE_OUT }}
            className="flex flex-col items-center gap-3 text-center"
            role="status"
            aria-live="polite"
          >
            {isError ? (
              <>
                <p className="text-[13px] text-fg-1">{label(phase)}</p>
                {error ? <p className="max-w-[360px] font-mono text-[11.5px] text-fg-3">{error}</p> : null}
                <Button size="sm" onClick={onRetry} leading={<IconRefresh size={14} />}>
                  Retry now
                </Button>
              </>
            ) : (
              <>
                <IconSpinner size={16} className="text-accent" />
                <p className="text-[13px] text-fg-2">{label(phase)}&hellip;</p>
              </>
            )}
          </motion.div>
        </div>
        <div className="w-[42%] min-w-[440px] shrink-0 border-l border-line-0 bg-bg-1 p-3">
          <Block className="mb-3 h-6 w-48" />
          <Block className="h-[calc(100%-36px)]" />
        </div>
      </div>
    </div>
  );
}
