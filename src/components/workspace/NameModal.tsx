"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Kbd } from "@/components/ui/Kbd";
import { MAX_NAME_LENGTH, normalizeName } from "@/lib/client/identity";
import { HumanAvatar } from "./Avatar";
import { EASE_OUT } from "./motion";

export interface NameModalProps {
  open: boolean;
  workspaceName?: string | null;
  onSubmit: (name: string) => void;
}

export function NameModal({ open, workspaceName, onSubmit }: NameModalProps) {
  const reduce = useReducedMotion();
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const clean = normalizeName(name);

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!clean) return;
    onSubmit(clean);
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="name-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="name-modal-title"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-bg-0/70 p-4 backdrop-blur-[2px]"
        >
          <motion.form
            onSubmit={submit}
            initial={reduce ? false : { opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.24, ease: EASE_OUT }}
            className="w-full max-w-[380px] rounded-xl border border-line-1 bg-bg-1 p-5"
            style={{ boxShadow: "var(--shadow-pop)" }}
          >
            <div className="flex items-center gap-3">
              <HumanAvatar name={clean || "?"} color={clean ? "#E8B4A2" : "#3a3a3f"} size={32} />
              <div className="min-w-0">
                <h2 id="name-modal-title" className="text-[14px] font-semibold tracking-tight text-fg-0">
                  Join {workspaceName ? <span className="text-accent">{workspaceName}</span> : "the workspace"}
                </h2>
                <p className="text-[12px] text-fg-2">Pick the name the room will see.</p>
              </div>
            </div>

            <label className="mt-4 block">
              <span className="sr-only">Your name</span>
              <input
                ref={inputRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={MAX_NAME_LENGTH}
                autoComplete="nickname"
                placeholder="Your name"
                className="h-9 w-full rounded-md border border-line-1 bg-bg-2 px-3 text-[14px] text-fg-0 placeholder:text-fg-3 focus:border-line-2 focus:outline-none focus:ring-[3px] focus:ring-accent/15"
              />
            </label>

            <div className="mt-3 flex items-center justify-between">
              <span className="inline-flex items-center gap-1 text-[11.5px] text-fg-3">
                <Kbd>Enter</Kbd> to continue
              </span>
              <Button type="submit" variant="primary" size="md" disabled={!clean}>
                Continue
              </Button>
            </div>
          </motion.form>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
