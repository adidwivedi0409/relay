export interface StatusDotProps {
  /** Any CSS color. */
  color: string;
  /** Pulses (1.6s ring) when true. */
  active?: boolean;
  size?: 6 | 7 | 8;
  className?: string;
  title?: string;
}

export function StatusDot({ color, active = false, size = 7, className, title }: StatusDotProps) {
  return (
    <span
      title={title}
      aria-hidden="true"
      className={["inline-block shrink-0 rounded-full", active ? "pulse" : "", className].filter(Boolean).join(" ")}
      style={{ width: size, height: size, background: color, color }}
    />
  );
}
