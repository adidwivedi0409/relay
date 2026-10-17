"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { revisionLabel } from "@/lib/client/format";

export interface RevisionPillProps {
  revision: number;
  /** Highlight when the agents are mid-build for this revision. */
  active?: boolean;
  size?: "xs" | "sm";
  className?: string;
  title?: string;
}

export function RevisionPill({ revision, active = false, size = "sm", className, title }: RevisionPillProps) {
  const reduce = useReducedMotion();
  return (
    <span
      title={title ?? `Revision ${revision}`}
      className={[
        "relative inline-flex items-center overflow-hidden rounded-[5px] border font-mono font-medium tabular-nums leading-none",
        size === "xs" ? "h-5 px-1.5 text-[11px]" : "h-6 px-2 text-[12px]",
        active ? "border-accent/30 bg-accent-soft text-accent" : "border-line-1 bg-bg-2 text-fg-1",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={revision}
          initial={reduce ? false : { y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { y: -8, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="inline-block"
        >
          {revisionLabel(revision)}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
