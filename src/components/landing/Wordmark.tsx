import Link from "next/link";

interface WordmarkProps {
  /** Where the wordmark links. Pass `null` to render a non-interactive wordmark. */
  href?: string | null;
  className?: string;
}

/** Three staggered bars: a baton passing hands. The last bar carries the accent. */
export function RelayMark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect x="2" y="3" width="9" height="3.5" rx="1.75" fill="currentColor" fillOpacity="0.42" />
      <rect x="5" y="8.25" width="9" height="3.5" rx="1.75" fill="currentColor" fillOpacity="0.7" />
      <rect x="8" y="13.5" width="9" height="3.5" rx="1.75" fill="var(--accent)" />
    </svg>
  );
}

/**
 * The "Relay" wordmark. Server-safe (no hooks) so it can sit in both the
 * client landing and the server-rendered not-found page.
 */
export function Wordmark({ href = "/", className = "" }: WordmarkProps) {
  const inner = (
    <>
      <RelayMark className="text-fg-0" />
      <span className="text-[15px] font-semibold tracking-tight text-fg-0">Relay</span>
    </>
  );
  const base = `inline-flex items-center gap-2 rounded-md ${className}`;
  if (href === null) {
    return <span className={base}>{inner}</span>;
  }
  return (
    <Link href={href} aria-label="Relay home" className={`${base} transition-opacity hover:opacity-80`}>
      {inner}
    </Link>
  );
}
