"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Wordmark } from "./Wordmark";
import { CreateWorkspaceForm } from "./CreateWorkspaceForm";
import { JoinForm } from "./JoinForm";
import { SystemStatus } from "./SystemStatus";

/* Motion: 320ms ease-out, 80ms stagger. MotionConfig reducedMotion="user"
   drops the translate for people who prefer reduced motion and keeps a plain
   opacity fade, which also avoids any server/client style mismatch. */
const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const DURATION = 0.32;
const STEP = 0.08;

function Reveal({ index, className, children }: { index: number; className?: string; children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION, ease: EASE_OUT, delay: index * STEP }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

type TabId = "create" | "join";

const TABS: { id: TabId; label: string }[] = [
  { id: "create", label: "Create workspace" },
  { id: "join", label: "Join a workspace" },
];

function WorkspaceCard() {
  const [tab, setTab] = useState<TabId>("create");
  const uid = useId();
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({ create: null, join: null });

  function focusTab(id: TabId) {
    setTab(id);
    tabRefs.current[id]?.focus();
  }

  function onTablistKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((t) => t.id === tab);
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      focusTab(TABS[(index + 1) % TABS.length].id);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      focusTab(TABS[(index - 1 + TABS.length) % TABS.length].id);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusTab(TABS[0].id);
    } else if (event.key === "End") {
      event.preventDefault();
      focusTab(TABS[TABS.length - 1].id);
    }
  }

  return (
    <section
      aria-label="Start or join a workspace"
      className="overflow-hidden rounded-[12px] border border-line-1 bg-bg-1 shadow-[var(--shadow-2)]"
    >
      <div
        role="tablist"
        aria-label="Workspace actions"
        onKeyDown={onTablistKeyDown}
        className="flex items-stretch border-b border-line-0 px-2"
      >
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`${uid}-tab-${t.id}`}
              aria-selected={active}
              aria-controls={`${uid}-panel-${t.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(t.id)}
              className={`relative px-3 py-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-offset-[-4px] ${
                active ? "text-fg-0" : "text-fg-2 hover:text-fg-1"
              }`}
            >
              {t.label}
              {active ? (
                <motion.span
                  layoutId="landing-tab-indicator"
                  transition={{ duration: 0.2, ease: EASE_OUT }}
                  aria-hidden="true"
                  className="absolute inset-x-3 -bottom-px h-px bg-accent"
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="p-5">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            role="tabpanel"
            id={`${uid}-panel-${tab}`}
            aria-labelledby={`${uid}-tab-${tab}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: EASE_OUT }}
          >
            {tab === "create" ? <CreateWorkspaceForm /> : <JoinForm />}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

const STEPS: { title: string; body: string }[] = [
  {
    title: "Humans set the brief",
    body: "Describe what you want in plain language. Every requirement is versioned, so the room always knows which revision it is looking at.",
  },
  {
    title: "Agents plan, code and verify",
    body: "Architect, Builder and Reviewer agents plan, code and verify in a sandbox, narrating their decisions on the shared timeline.",
  },
  {
    title: "Change anything, anytime",
    body: "Anyone changes the requirements. Agents cascade the change and the live preview updates for everyone.",
  },
];

function HowItWorks() {
  return (
    <section aria-labelledby="how-it-works" className="w-full">
      <h2 id="how-it-works" className="sr-only">
        How it works
      </h2>
      <ol className="grid grid-cols-1 gap-6 border-t border-line-0 pt-8 sm:grid-cols-3 sm:gap-6">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex flex-col gap-2">
            <span className="mono tabular text-[11px] tracking-widest text-fg-3">{String(i + 1).padStart(2, "0")}</span>
            <h3 className="text-sm font-medium text-fg-0">{step.title}</h3>
            <p className="text-[13px] leading-relaxed text-fg-2">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Landing() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="relative flex min-h-dvh flex-1 flex-col overflow-x-clip">
        {/* Texture: a faint dot grid that dissolves toward the edges, plus a whisper of ember at the top. */}
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
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[520px]"
          style={{ background: "radial-gradient(55% 55% at 50% 0%, rgba(232,168,107,0.075), transparent 72%)" }}
        />

        <header className="relative z-10 flex items-center justify-between px-5 py-5 sm:px-8">
          <Wordmark />
        </header>

        <main className="relative z-10 flex flex-1 flex-col items-center px-5 pb-20 pt-8 sm:pt-14 md:pt-20">
          <div className="flex w-full max-w-xl flex-col">
            <Reveal index={0}>
              <p className="mono text-[11px] uppercase tracking-widest text-fg-2">Multiplayer AI · c0mpiled-14</p>
              <h1 className="text-balance mt-4 text-[clamp(2.75rem,1.9rem+2.6vw,3.5rem)] font-semibold leading-[1.04] tracking-tight text-fg-0">
                Build together. With everyone. Including your agents.
              </h1>
            </Reveal>

            <Reveal index={1}>
              <p className="mt-6 max-w-[56ch] text-[15px] leading-relaxed text-fg-1 sm:text-base">
                Relay is one shared workspace where people and autonomous agents build software together, live.
                Humans write the brief in plain language; an Architect, a Builder and a Reviewer plan, code and
                verify it in a real sandbox while everyone watches the same timeline and the same running preview.
              </p>
            </Reveal>

            <Reveal index={2} className="mt-10">
              <WorkspaceCard />
            </Reveal>
          </div>

          <Reveal index={3} className="mt-20 w-full max-w-xl">
            <HowItWorks />
          </Reveal>

          <Reveal index={4} className="mt-14 w-full">
            <SystemStatus />
          </Reveal>
        </main>

        <footer className="relative z-10 border-t border-line-0 px-5 py-5 text-center text-xs text-fg-3">
          Built at c0mpiled-14 · Berkeley · Freestyle + RunAnywhere Wally
        </footer>
      </div>
    </MotionConfig>
  );
}
