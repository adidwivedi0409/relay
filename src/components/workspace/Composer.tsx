"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { MessageKind, SendResult } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/Button";
import { Kbd } from "@/components/ui/Kbd";
import { Tabs } from "@/components/ui/Tabs";
import { IconSend } from "@/components/ui/icons";
import { HumanAvatar } from "./Avatar";
import { rowTransition } from "./motion";

export interface ComposerHandle {
  focus: () => void;
  fill: (text: string) => void;
}

export interface ComposerProps {
  onSend: (text: string, kind: MessageKind) => Promise<SendResult>;
  sending: boolean;
  /** workspace.activeRevision: when non-null, show the cascade hint. */
  activeRevision: number | null;
  disabled?: boolean;
  self: { name: string; color: string } | null;
}

const LINE_PX = 20;
const PAD_Y_PX = 16; // 8 + 8
const MIN_ROWS = 1;
const MAX_ROWS = 6;

type Mode = "requirement" | "note";

const MODE_ITEMS = [
  { value: "requirement" as const, label: "Requirement" },
  { value: "note" as const, label: "Note" },
];

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { onSend, sending, activeRevision, disabled = false, self },
  ref,
) {
  const reduce = useReducedMotion();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");
  const [mode, setMode] = useState<Mode>("requirement");
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => taRef.current?.focus(),
      fill: (text: string) => {
        setValue(text);
        setMode("requirement");
        window.requestAnimationFrame(() => {
          const el = taRef.current;
          if (!el) return;
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        });
      },
    }),
    [],
  );

  // Autosize 1–6 rows.
  useLayoutEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "0px";
    const min = MIN_ROWS * LINE_PX + PAD_Y_PX;
    const max = MAX_ROWS * LINE_PX + PAD_Y_PX;
    const next = Math.min(max, Math.max(min, el.scrollHeight));
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [value]);

  const onChangeValue = (next: string) => {
    setValue(next);
    if (error && next.trim()) setError(null);
  };

  const canSend = !sending && !disabled && value.trim().length > 0;

  const submit = useCallback(async () => {
    if (!canSend) return;
    const text = value;
    const kind: MessageKind = mode === "requirement" ? "requirement" : "chat";
    const result = await onSend(text, kind);
    if (result.ok) {
      setValue("");
      setError(null);
      window.requestAnimationFrame(() => taRef.current?.focus());
    } else {
      setError(result.error);
    }
  }, [canSend, value, mode, onSend]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  };

  const isRequirement = mode === "requirement";

  return (
    <div className="shrink-0 border-t border-line-0 bg-bg-1 px-4 pb-3 pt-2.5">
      <div className="mx-auto max-w-[840px]">
        <AnimatePresence initial={false}>
          {activeRevision !== null && isRequirement ? (
            <motion.p
              key="cascade-hint"
              initial={reduce ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={rowTransition}
              className="overflow-hidden"
            >
              <span className="mb-2 inline-flex items-center gap-1.5 text-[12px] text-warn/90">
                <span className="block h-1.5 w-1.5 rounded-full bg-warn pulse" style={{ color: "var(--warn)" }} />
                Agents are working on r{activeRevision} — a new requirement will cascade
              </span>
            </motion.p>
          ) : null}
        </AnimatePresence>

        <div
          className={[
            "rounded-lg border bg-bg-2 p-2 transition-[border-color,box-shadow] duration-150",
            "focus-within:border-line-2 focus-within:shadow-[0_0_0_3px_rgba(232,168,107,0.10)]",
            error ? "border-err/40" : "border-line-1",
          ].join(" ")}
          style={{ boxShadow: "var(--shadow-1)" }}
        >
          <div className="flex items-start gap-2.5">
            <div className="pt-1 pl-0.5">
              {self ? (
                <HumanAvatar name={self.name} color={self.color} size={24} />
              ) : (
                <span className="block h-6 w-6 rounded-full border border-dashed border-line-2" />
              )}
            </div>
            <textarea
              ref={taRef}
              value={value}
              onChange={(e) => onChangeValue(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={disabled || sending}
              rows={1}
              spellCheck
              aria-label={isRequirement ? "New requirement" : "New note"}
              placeholder={
                isRequirement
                  ? activeRevision !== null
                    ? "Change the spec — the team will re-plan around it"
                    : "Describe a requirement for the team"
                  : "Leave a note for everyone in the room"
              }
              className="min-h-[36px] flex-1 resize-none bg-transparent px-1 py-2 text-[14px] leading-[20px] text-fg-0 placeholder:text-fg-3 focus:outline-none disabled:opacity-60"
            />
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 pl-9">
            <Tabs<Mode> value={mode} onChange={setMode} items={MODE_ITEMS} size="xs" aria-label="Message mode" />
            <Button
              variant={isRequirement ? "primary" : "secondary"}
              size="sm"
              onClick={() => void submit()}
              disabled={!canSend}
              loading={sending}
              aria-label={isRequirement ? "Send requirement" : "Send note"}
              trailing={<IconSend size={13} />}
            >
              {sending ? "Sending" : "Send"}
            </Button>
          </div>
        </div>

        <div className="mt-1.5 flex items-center gap-3 px-0.5 text-[11.5px] leading-[16px] text-fg-3">
          {error ? (
            <span className="text-err">{error}</span>
          ) : (
            <span className="min-w-0 truncate">
              Requirements change the spec and re-task the agents. Notes are chat only.
            </span>
          )}
          <span className="ml-auto hidden shrink-0 items-center gap-1 sm:inline-flex">
            <Kbd>Enter</Kbd>
            <span>send</span>
            <span className="mx-1 text-fg-3/60">·</span>
            <Kbd>Shift</Kbd>
            <Kbd>Enter</Kbd>
            <span>newline</span>
          </span>
        </div>
      </div>
    </div>
  );
});
