"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export type ChipTone =
  | "neutral"
  | "accent"
  | "ok"
  | "warn"
  | "err"
  | "info"
  | "architect"
  | "builder"
  | "reviewer";

export interface ChipProps {
  tone?: ChipTone;
  children: ReactNode;
  /** Leading dot colored with the tone; `pulse` animates it. */
  dot?: boolean;
  pulse?: boolean;
  mono?: boolean;
  size?: "xs" | "sm";
  className?: string;
  title?: string;
  /** Enables a layout animation when the chip's size/position changes. */
  layout?: boolean;
  leading?: ReactNode;
}

const tones: Record<ChipTone, { text: string; bg: string; border: string; dot: string }> = {
  neutral: { text: "text-fg-1", bg: "bg-bg-2", border: "border-line-1", dot: "bg-fg-2" },
  accent: { text: "text-accent", bg: "bg-accent-soft", border: "border-accent/25", dot: "bg-accent" },
  ok: { text: "text-ok", bg: "bg-ok/10", border: "border-ok/25", dot: "bg-ok" },
  warn: { text: "text-warn", bg: "bg-warn/10", border: "border-warn/25", dot: "bg-warn" },
  err: { text: "text-err", bg: "bg-err/10", border: "border-err/25", dot: "bg-err" },
  info: { text: "text-info", bg: "bg-info/10", border: "border-info/25", dot: "bg-info" },
  architect: { text: "text-architect", bg: "bg-architect/10", border: "border-architect/25", dot: "bg-architect" },
  builder: { text: "text-builder", bg: "bg-builder/10", border: "border-builder/25", dot: "bg-builder" },
  reviewer: { text: "text-reviewer", bg: "bg-reviewer/10", border: "border-reviewer/25", dot: "bg-reviewer" },
};

export function Chip({
  tone = "neutral",
  children,
  dot = false,
  pulse = false,
  mono = false,
  size = "xs",
  className,
  title,
  layout = false,
  leading,
}: ChipProps) {
  const reduce = useReducedMotion();
  const t = tones[tone];
  const cls = [
    "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[5px] border font-medium leading-none",
    size === "xs" ? "h-5 px-1.5 text-[11px]" : "h-6 px-2 text-[12px]",
    mono ? "font-mono tabular-nums" : "",
    t.text,
    t.bg,
    t.border,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const inner = (
    <>
      {leading ? <span className="inline-flex shrink-0 items-center">{leading}</span> : null}
      {dot ? (
        <span
          className={["inline-block h-1.5 w-1.5 rounded-full", t.dot, pulse ? "pulse" : ""].join(" ")}
          style={{ color: "currentColor" }}
        />
      ) : null}
      <span className="truncate">{children}</span>
    </>
  );

  if (layout && !reduce) {
    return (
      <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 40 }} className={cls} title={title}>
        {inner}
      </motion.span>
    );
  }
  return (
    <span className={cls} title={title}>
      {inner}
    </span>
  );
}
