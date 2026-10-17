import type { Transition } from "motion/react";

export const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const PANEL_STAGGER_S = 0.06;
export const PANEL_DURATION_S = 0.24;
export const ROW_DURATION_S = 0.2;

export const rowTransition: Transition = { duration: ROW_DURATION_S, ease: EASE_OUT };
export const panelTransition = (index: number): Transition => ({
  duration: PANEL_DURATION_S,
  ease: EASE_OUT,
  delay: index * PANEL_STAGGER_S,
});

export const rowMotion = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
} as const;

export const panelMotion = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
} as const;
