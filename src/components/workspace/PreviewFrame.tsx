"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import type { Artifact, BuildStatus } from "@/lib/types";
import { IconAlert, IconSpinner } from "@/components/ui/icons";
import { buildStatusProgress, isBuildInFlight } from "@/lib/client/format";
import { rowTransition } from "./motion";

export interface PreviewFrameProps {
  artifact: Artifact | null;
  buildStatus: BuildStatus;
  buildError: string | null;
  /** Revision being built (workspace.activeRevision ?? workspace.revision). */
  targetRevision: number;
}

function ProgressBar({ reduce }: { reduce: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[2px] overflow-hidden bg-accent/15" aria-hidden="true">
      {reduce ? (
        <div className="h-full w-1/3 bg-accent" />
      ) : (
        <motion.div
          className="h-full w-2/5 bg-accent"
          initial={{ x: "-100%" }}
          animate={{ x: ["-100%", "260%"] }}
          transition={{ duration: 1.4, ease: "easeInOut", repeat: Infinity }}
        />
      )}
    </div>
  );
}

function EmptyPlaceholder({ revision }: { revision: number }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="flex h-full w-full max-w-[560px] flex-col items-center justify-center rounded-lg border border-dashed border-line-2 px-6 text-center">
        <div className="mb-3 grid grid-cols-3 gap-1 opacity-70" aria-hidden="true">
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={i} className={["block h-1.5 w-1.5 rounded-full", i === 4 ? "bg-accent" : "bg-fg-3/60"].join(" ")} />
          ))}
        </div>
        <p className="text-balance text-[13px] leading-[19px] text-fg-2">
          The live application will appear here once the Builder ships r{revision}
        </p>
      </div>
    </div>
  );
}

export function PreviewFrame({ artifact, buildStatus, buildError, targetRevision }: PreviewFrameProps) {
  const reduce = useReducedMotion() ?? false;
  const inFlight = isBuildInFlight(buildStatus);
  const failed = buildStatus === "failed";
  // Revision of the iframe that has fired onLoad. A new artifact revision mounts
  // a fresh iframe (key), so "loading" is simply "loaded !== current".
  const [loadedRevision, setLoadedRevision] = useState<number | null>(null);
  const frameLoading = artifact !== null && loadedRevision !== artifact.revision;

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-bg-0">
      {inFlight ? <ProgressBar reduce={reduce} /> : null}

      <AnimatePresence initial={false}>
        {failed ? (
          <motion.div
            key="failed-banner"
            initial={reduce ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={rowTransition}
            role="alert"
            className="z-10 flex shrink-0 items-start gap-2.5 border-b border-err/40 bg-err/[0.08] px-3.5 py-2"
          >
            <IconAlert size={16} className="mt-0.5 shrink-0 text-err" />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium text-err">Build failed for r{targetRevision}</p>
              {buildError ? (
                <p className="mt-0.5 break-words font-mono text-[11.5px] leading-[16px] text-fg-1">{buildError}</p>
              ) : null}
              {artifact ? <p className="mt-0.5 text-[11.5px] text-fg-3">Showing the last successful build, r{artifact.revision}.</p> : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="relative min-h-0 flex-1">
        {artifact ? (
          <>
            <iframe
              key={artifact.revision}
              src={artifact.previewUrl}
              title={`Live preview · r${artifact.revision}`}
              referrerPolicy="no-referrer"
              onLoad={() => setLoadedRevision(artifact.revision)}
              className="block h-full w-full border-0 bg-white"
            />
            <AnimatePresence>
              {frameLoading ? (
                <motion.div
                  key={`loading-${artifact.revision}`}
                  initial={false}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="shimmer pointer-events-none absolute inset-0"
                  aria-hidden="true"
                />
              ) : null}
            </AnimatePresence>
          </>
        ) : (
          <EmptyPlaceholder revision={Math.max(1, targetRevision)} />
        )}

        <AnimatePresence>
          {inFlight ? (
            <motion.div
              key="building-card"
              initial={reduce ? false : { opacity: 0, y: 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 }}
              transition={rowTransition}
              className="absolute bottom-3 right-3 z-20 flex items-center gap-2.5 rounded-lg border border-line-2 bg-bg-2/95 px-3 py-2 backdrop-blur-sm"
              style={{ boxShadow: "var(--shadow-pop)" }}
              role="status"
              aria-live="polite"
            >
              <IconSpinner size={14} className="shrink-0 text-accent" />
              <span className="text-[12px] text-fg-0">
                Builder is updating <span className="font-mono tabular-nums text-accent">r{targetRevision}</span>
                <span className="text-fg-3"> · </span>
                <span className="text-fg-1">{buildStatusProgress(buildStatus)}</span>
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
