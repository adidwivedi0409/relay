import type { ReactNode } from "react";

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={[
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-line-1 bg-bg-2 px-1",
        "font-sans text-[10.5px] font-medium leading-none text-fg-2",
        "shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_1px_0_rgba(0,0,0,0.5)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </kbd>
  );
}
