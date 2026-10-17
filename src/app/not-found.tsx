import Link from "next/link";
import { Wordmark } from "@/components/landing/Wordmark";

export default function NotFound() {
  return (
    <div className="relative flex min-h-dvh flex-1 flex-col">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          backgroundPosition: "center top",
          maskImage: "radial-gradient(ellipse 80% 70% at 50% 0%, #000 10%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 70% at 50% 0%, #000 10%, transparent 100%)",
        }}
      />

      <header className="relative z-10 flex items-center px-5 py-5 sm:px-8">
        <Wordmark />
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 pb-24">
        <div className="flex w-full max-w-xl flex-col items-start">
          <p className="mono text-[11px] uppercase tracking-widest text-fg-2">404 · Not found</p>
          <h1 className="text-balance mt-4 text-[clamp(2rem,1.5rem+1.8vw,2.75rem)] font-semibold leading-[1.08] tracking-tight text-fg-0">
            This page is not in any workspace.
          </h1>
          <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-fg-1">
            The link may be mistyped, or the workspace it pointed to no longer exists on this server. Head back
            and create a new one, or paste the invite link again.
          </p>
          <Link
            href="/"
            className="mt-8 inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-line-1 bg-bg-2 px-3.5 text-sm font-medium text-fg-0 transition-colors duration-150 hover:bg-bg-3"
          >
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
            >
              <path d="M13 8H3" />
              <path d="M7 4L3 8l4 4" />
            </svg>
            Back to Relay
          </Link>
        </div>
      </main>

      <footer className="relative z-10 border-t border-line-0 px-5 py-5 text-center text-xs text-fg-3">
        Built at c0mpiled-14 · Berkeley · Freestyle + RunAnywhere Wally
      </footer>
    </div>
  );
}
