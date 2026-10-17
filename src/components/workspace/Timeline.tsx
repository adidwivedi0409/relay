"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RelayEvent, Requirement, Workspace } from "@/lib/types";
import { IconChevronDown } from "@/components/ui/icons";
import { excerpt, formatRelative } from "@/lib/client/format";
import { EmptyState } from "./EmptyState";
import { TimelineRow, isRenderable, isTaskEvent, rowDensity } from "./TimelineRow";
import { rowMotion, rowTransition } from "./motion";
import { taskIdOf } from "./rows/payload";

export interface TimelineProps {
  workspace: Workspace;
  events: RelayEvent[];
  now: number;
  onPickExample: (text: string) => void;
}

export type TimelineItem =
  | { kind: "divider"; key: string; revision: number; requirement: Requirement | null }
  | { kind: "row"; key: string; event: RelayEvent; collapsed: number };

/**
 * Turns the raw event log into renderable items: drops agent.status, inserts a
 * divider the first time a revision appears (r >= 1), and folds every task.*
 * event for the same task into the task's original row so the row updates in
 * place (queued → running → stale/done/failed) instead of repeating.
 *
 * Dividers are monotonic on purpose: a stale r1 task that fails while the
 * workspace is already at r2 is emitted with revision 1, and must not reopen
 * an "r1" section (which also produced duplicate React keys).
 */
export function buildTimeline(events: RelayEvent[], requirements: Requirement[]): TimelineItem[] {
  const byRevision = new Map<number, Requirement>();
  for (const r of requirements) if (!byRevision.has(r.revision)) byRevision.set(r.revision, r);

  const items: TimelineItem[] = [];
  const taskRows = new Map<string, number>();
  let maxRevision = 0;

  for (const event of events) {
    if (!isRenderable(event.type)) continue;

    if (event.revision > maxRevision) {
      maxRevision = event.revision;
      items.push({
        kind: "divider",
        key: `rev:${maxRevision}`,
        revision: maxRevision,
        requirement: byRevision.get(maxRevision) ?? null,
      });
    }

    if (isTaskEvent(event.type)) {
      const taskId = taskIdOf(event.payload);
      if (taskId) {
        const idx = taskRows.get(taskId);
        const existing = idx !== undefined ? items[idx] : undefined;
        if (existing && existing.kind === "row") {
          items[idx as number] = { ...existing, event, collapsed: existing.collapsed + 1 };
          continue;
        }
        taskRows.set(taskId, items.length);
        items.push({ kind: "row", key: `task:${taskId}`, event, collapsed: 1 });
        continue;
      }
    }

    items.push({ kind: "row", key: event.id, event, collapsed: 1 });
  }
  return items;
}

const NEAR_BOTTOM_PX = 96;

function RevisionDivider({ revision, requirement, now }: { revision: number; requirement: Requirement | null; now: number }) {
  return (
    <div className="flex items-center gap-3 py-2" role="separator" aria-label={`Revision ${revision}`}>
      <span className="inline-flex h-6 shrink-0 items-center gap-2 rounded-md border border-line-1 bg-bg-2 px-2 text-[12px] font-medium text-fg-0">
        Revision {revision}
        <span className="font-mono text-[11px] tabular-nums text-fg-3">r{revision}</span>
      </span>
      {requirement ? (
        <span className="min-w-0 truncate text-[12px] text-fg-2" title={requirement.text}>
          {excerpt(requirement.text, 96)}
          <span className="text-fg-3">
            {" "}
            · {requirement.authorName} · {formatRelative(requirement.createdAt, now)}
          </span>
        </span>
      ) : null}
      <span className="h-px min-w-4 flex-1 bg-line-1" />
    </div>
  );
}

export function Timeline({ workspace, events, now, onPickExample }: TimelineProps) {
  const reduce = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const items = useMemo(() => buildTimeline(events, workspace.requirements), [events, workspace.requirements]);
  const lastKey = items.length ? items[items.length - 1].key : null;
  const isEmpty = workspace.requirements.length === 0;

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    nearBottomRef.current = dist < NEAR_BOTTOM_PX;
    if (nearBottomRef.current) setShowJump(false);
  }, []);

  const scrollToBottom = useCallback(
    (smooth: boolean) => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reduce ? "smooth" : "auto" });
      nearBottomRef.current = true;
      setShowJump(false);
    },
    [reduce],
  );

  // Initial mount: jump to the latest row without animation.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // New rows: follow if the reader is near the bottom, otherwise offer a jump.
  useEffect(() => {
    if (!lastKey) return;
    const id = window.requestAnimationFrame(() => {
      if (nearBottomRef.current) scrollToBottom(true);
      else setShowJump(true);
    });
    return () => window.cancelAnimationFrame(id);
  }, [lastKey, items.length, scrollToBottom]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} onScroll={measure} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
        {isEmpty && items.length <= 3 ? (
          <div className="flex h-full min-h-[320px] flex-col">
            <div className="flex flex-col gap-1.5 pb-2">
              {items.map((item) =>
                item.kind === "row" ? <TimelineRow key={item.key} event={item.event} now={now} collapsed={item.collapsed} /> : null,
              )}
            </div>
            <div className="flex flex-1 items-center justify-center">
              <EmptyState onPick={onPickExample} />
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-[840px] flex-col">
            <AnimatePresence initial={false}>
              {items.map((item) =>
                item.kind === "divider" ? (
                  <motion.div
                    key={item.key}
                    {...rowMotion}
                    initial={reduce ? false : rowMotion.initial}
                    transition={rowTransition}
                    className="pt-3"
                  >
                    <RevisionDivider revision={item.revision} requirement={item.requirement} now={now} />
                  </motion.div>
                ) : (
                  <motion.div
                    key={item.key}
                    layout={reduce ? false : "position"}
                    {...rowMotion}
                    initial={reduce ? false : rowMotion.initial}
                    transition={rowTransition}
                    className={rowDensity(item.event.type) === "compact" ? "py-1" : "py-2"}
                  >
                    <TimelineRow event={item.event} now={now} collapsed={item.collapsed} />
                  </motion.div>
                ),
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showJump ? (
          <motion.button
            key="jump"
            type="button"
            onClick={() => scrollToBottom(true)}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={rowTransition}
            className="absolute bottom-3 left-1/2 inline-flex h-7 -translate-x-1/2 items-center gap-1.5 rounded-full border border-line-2 bg-bg-3 px-3 text-[12px] font-medium text-fg-0 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.8)] hover:bg-bg-4"
          >
            New activity
            <IconChevronDown size={13} />
          </motion.button>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
