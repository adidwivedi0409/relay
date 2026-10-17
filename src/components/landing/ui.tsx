import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

/* Small, dependency-free primitives shared by the landing forms. Styles follow
   the Relay tokens: inputs on bg-2 with a line-1 border, 36px tall; primary
   actions in the single ember accent; secondary actions quiet on bg-2. */

export const inputClass =
  "h-9 w-full rounded-[8px] border border-line-1 bg-bg-2 px-3 text-sm text-fg-0 " +
  "placeholder:text-fg-3 shadow-[var(--shadow-1)] transition-[border-color,box-shadow] duration-150 " +
  "hover:border-line-2 focus:border-line-2 focus:outline-none focus:ring-[3px] focus:ring-accent-soft " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const buttonBase =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[8px] px-3.5 text-sm font-medium " +
  "transition-[background-color,color,opacity] duration-150 select-none " +
  "disabled:cursor-not-allowed disabled:opacity-60";

export const primaryButtonClass = `${buttonBase} bg-accent text-bg-0 hover:bg-accent-strong disabled:hover:bg-accent`;

export const secondaryButtonClass = `${buttonBase} border border-line-1 bg-bg-2 text-fg-0 hover:bg-bg-3 disabled:hover:bg-bg-2`;

export function TextInput({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={`${inputClass} ${className}`} />;
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <label htmlFor={htmlFor} className="text-xs font-medium text-fg-2">
          {label}
        </label>
        {hint ? <span className="text-[11px] text-fg-3">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

export function PrimaryButton({ className = "", children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} className={`${primaryButtonClass} ${className}`}>
      {children}
    </button>
  );
}

export function SecondaryButton({ className = "", children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} className={`${secondaryButtonClass} ${className}`}>
      {children}
    </button>
  );
}

export function ArrowRightIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M3 8h10" />
      <path d="M9 4l4 4-4 4" />
    </svg>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={`animate-spin ${className}`}
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Inline error line under a form. Rendered with aria-live so screen readers hear it. */
export function FormError({ message }: { message: string | null }) {
  return (
    <p role="alert" aria-live="polite" className={`min-h-[1rem] text-xs text-err ${message ? "" : "sr-only"}`}>
      {message ?? ""}
    </p>
  );
}
