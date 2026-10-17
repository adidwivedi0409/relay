"use client";

import { motion, useReducedMotion } from "motion/react";
import { IconArrowRight } from "@/components/ui/icons";
import { EASE_OUT } from "./motion";

export const EXAMPLE_REQUIREMENTS: ReadonlyArray<{ title: string; text: string }> = [
  {
    title: "Product landing page",
    text: "A landing page for Northstar, a budgeting app for freelancers: hero with a waitlist form, three feature cards, pricing with a monthly/yearly toggle, and a short FAQ.",
  },
  {
    title: "Conference schedule",
    text: "A one-day conference schedule site with a filterable talk list by track, speaker cards, and a sticky 'now playing' bar that highlights the current session.",
  },
  {
    title: "Portfolio with case studies",
    text: "A personal portfolio for a product designer: a short intro, a grid of six case studies with tags you can filter, and a contact section with a validated form.",
  },
];

export function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  const reduce = useReducedMotion();
  return (
    <div className="mx-auto w-full max-w-[520px] px-4 text-center">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.12 }}
      >
        <div className="mx-auto mb-4 flex h-9 w-9 items-center justify-center rounded-lg border border-line-1 bg-bg-2 text-accent" style={{ boxShadow: "var(--shadow-1)" }}>
          <span className="block h-2 w-2 rounded-full bg-accent pulse" style={{ color: "var(--accent)" }} />
        </div>
        <h2 className="text-balance text-[16px] font-semibold tracking-tight text-fg-0">Describe what you want to build</h2>
        <p className="mt-1.5 text-balance text-[13px] leading-[19px] text-fg-2">
          Your first requirement becomes r1. The Architect plans it, the Builder ships it to a live preview, and the Reviewer
          checks the result. Everyone in the room sees the same thing.
        </p>
      </motion.div>

      <ul className="mt-5 flex flex-col gap-1.5 text-left">
        {EXAMPLE_REQUIREMENTS.map((ex, i) => (
          <motion.li
            key={ex.title}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: EASE_OUT, delay: 0.2 + i * 0.06 }}
          >
            <button
              type="button"
              onClick={() => onPick(ex.text)}
              className="group flex w-full items-start gap-3 rounded-lg border border-line-1 bg-bg-2 px-3 py-2.5 text-left transition-colors duration-150 hover:border-line-2 hover:bg-bg-3"
              style={{ boxShadow: "var(--shadow-1)" }}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-fg-0">{ex.title}</span>
                <span className="mt-0.5 line-clamp-2 block text-[12px] leading-[17px] text-fg-2">{ex.text}</span>
              </span>
              <IconArrowRight size={14} className="mt-1 shrink-0 text-fg-3 transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-accent" />
            </button>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
