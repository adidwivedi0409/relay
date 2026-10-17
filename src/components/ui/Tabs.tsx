"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId, type ReactNode } from "react";

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
  disabled?: boolean;
}

export interface TabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  items: ReadonlyArray<TabItem<T>>;
  /** segmented = filled pill moving behind the active item; underline = quiet underline. */
  variant?: "segmented" | "underline";
  size?: "xs" | "sm";
  className?: string;
  "aria-label"?: string;
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  variant = "segmented",
  size = "sm",
  className,
  "aria-label": ariaLabel,
}: TabsProps<T>) {
  const layoutId = useId();
  const reduce = useReducedMotion();
  const h = size === "xs" ? "h-6 text-[12px]" : "h-7 text-[12px]";

  if (variant === "underline") {
    return (
      <div role="tablist" aria-label={ariaLabel} className={["flex items-end gap-1", className].filter(Boolean).join(" ")}>
        {items.map((item) => {
          const active = item.value === value;
          return (
            <button
              key={item.value}
              role="tab"
              type="button"
              aria-selected={active}
              disabled={item.disabled}
              onClick={() => onChange(item.value)}
              className={[
                "relative px-2 pb-2 pt-1 text-[12px] font-medium transition-colors duration-150",
                active ? "text-fg-0" : "text-fg-2 hover:text-fg-1",
                item.disabled ? "opacity-40" : "",
              ].join(" ")}
            >
              <span className="inline-flex items-center gap-1.5">
                {item.label}
                {typeof item.count === "number" ? (
                  <span className="tabular-nums text-[11px] text-fg-3">{item.count}</span>
                ) : null}
              </span>
              {active ? (
                <motion.span
                  layoutId={`${layoutId}-underline`}
                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }}
                  className="absolute inset-x-1 -bottom-px h-px bg-accent"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={["inline-flex items-center gap-0.5 rounded-md border border-line-1 bg-bg-0/60 p-0.5", className]
        .filter(Boolean)
        .join(" ")}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={active}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={[
              "relative rounded-[5px] px-2.5 font-medium transition-colors duration-150",
              h,
              active ? "text-fg-0" : "text-fg-2 hover:text-fg-1",
              item.disabled ? "opacity-40" : "",
            ].join(" ")}
          >
            {active ? (
              <motion.span
                layoutId={`${layoutId}-pill`}
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }}
                className="absolute inset-0 rounded-[5px] bg-bg-3 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_1px_2px_rgba(0,0,0,0.35)]"
              />
            ) : null}
            <span className="relative inline-flex items-center gap-1.5">
              {item.label}
              {typeof item.count === "number" ? (
                <span className="tabular-nums text-[11px] text-fg-3">{item.count}</span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
