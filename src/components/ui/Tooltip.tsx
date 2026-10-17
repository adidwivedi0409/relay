"use client";

import { useId, type ReactNode } from "react";

export interface TooltipProps {
  label: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  align?: "center" | "start" | "end";
  className?: string;
  /** Render the wrapper as a block instead of inline-flex. */
  block?: boolean;
}

/**
 * Hover/focus tooltip. Pure CSS (group-hover + opacity transition) so it stays
 * cheap when dozens of rows mount at once.
 */
export function Tooltip({ label, children, side = "top", align = "center", className, block = false }: TooltipProps) {
  const id = useId();
  const pos = side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5";
  const alignCls =
    align === "center" ? "left-1/2 -translate-x-1/2" : align === "start" ? "left-0" : "right-0";
  return (
    <span className={[block ? "relative block" : "relative inline-flex", "group/tt", className].filter(Boolean).join(" ")} aria-describedby={id}>
      {children}
      <span
        id={id}
        role="tooltip"
        className={[
          "pointer-events-none absolute z-50 whitespace-nowrap rounded-md border border-line-1 bg-bg-3 px-2 py-1 text-[11.5px] font-medium leading-none text-fg-0",
          "shadow-[0_0_0_1px_rgba(0,0,0,0.4),0_8px_24px_-12px_rgba(0,0,0,0.8)]",
          "opacity-0 translate-y-0.5 transition-[opacity,transform] duration-150 ease-out delay-0",
          "group-hover/tt:opacity-100 group-hover/tt:translate-y-0 group-hover/tt:delay-300",
          "group-focus-within/tt:opacity-100 group-focus-within/tt:translate-y-0",
          pos,
          alignCls,
        ].join(" ")}
      >
        {label}
      </span>
    </span>
  );
}
