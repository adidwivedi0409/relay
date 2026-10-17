"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "xs" | "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leading?: ReactNode;
  trailing?: ReactNode;
  loading?: boolean;
}

const base =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap select-none rounded-md border font-medium " +
  "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out " +
  "disabled:opacity-50 disabled:cursor-not-allowed active:not-disabled:translate-y-px";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-bg-0 border-transparent hover:not-disabled:bg-accent-strong shadow-[0_1px_0_rgba(255,255,255,0.12)_inset,0_1px_2px_rgba(0,0,0,0.4)]",
  secondary:
    "bg-bg-2 text-fg-0 border-line-1 hover:not-disabled:bg-bg-3 hover:not-disabled:border-line-2 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset,0_1px_2px_rgba(0,0,0,0.3)]",
  ghost: "bg-transparent text-fg-1 border-transparent hover:not-disabled:bg-bg-3 hover:not-disabled:text-fg-0",
  danger: "bg-transparent text-err border-err/30 hover:not-disabled:bg-err/10",
};

const sizes: Record<ButtonSize, string> = {
  xs: "h-6 px-2 text-[12px]",
  sm: "h-7 px-2.5 text-[12px]",
  md: "h-8 px-3 text-[13px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "sm", leading, trailing, loading = false, className, children, disabled, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[base, variants[variant], sizes[size], className].filter(Boolean).join(" ")}
      {...rest}
    >
      {leading ? <span className="-ml-0.5 inline-flex shrink-0 items-center">{leading}</span> : null}
      {children}
      {trailing ? <span className="-mr-0.5 inline-flex shrink-0 items-center">{trailing}</span> : null}
    </button>
  );
});
