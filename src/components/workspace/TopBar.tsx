"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Participant, Workspace } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { QrPopover, copyText } from "@/components/ui/QrCode";
import { Tooltip } from "@/components/ui/Tooltip";
import { IconCheck, IconLink } from "@/components/ui/icons";
import { PresenceStack } from "./PresenceStack";
import { RevisionPill } from "./RevisionPill";
import { StatusDot } from "./StatusDot";

export interface TopBarProps {
  workspace: Workspace;
  participants: Participant[];
  now: number;
  connected: boolean;
  selfId: string | null;
}

export function TopBar({ workspace, participants, now, connected, selfId }: TopBarProps) {
  const reduce = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const shareBtnRef = useRef<HTMLButtonElement | null>(null);
  /** LAN origin from /api/health (e.g. "http://10.0.0.5:3000"); fetched once. */
  const lanUrl = useRef<string | null | undefined>(undefined);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const flashCopied = useCallback(() => {
    setCopied(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1400);
  }, []);

  const resolveShareUrl = useCallback((): string => {
    const lan = lanUrl.current;
    return typeof lan === "string" && lan ? lan.replace(/\/+$/, "") + window.location.pathname : window.location.href;
  }, []);

  const closeShare = useCallback(() => setShareOpen(false), []);

  const onShare = useCallback(async () => {
    if (shareOpen) {
      setShareOpen(false);
      return;
    }
    setShareOpen(true);
    // Keep the one-click copy: copy the best URL we know right now.
    const ok = await copyText(resolveShareUrl());
    if (ok) flashCopied();
    if (lanUrl.current === undefined) {
      setShareUrl(null);
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        const json: unknown = await res.json();
        const lan = json && typeof json === "object" ? (json as { lanUrl?: unknown }).lanUrl : undefined;
        lanUrl.current = typeof lan === "string" && lan ? lan : null;
      } catch {
        lanUrl.current = null;
      }
    }
    setShareUrl(resolveShareUrl());
  }, [shareOpen, resolveShareUrl, flashCopied]);

  const isLive = workspace.buildStatus === "live" && workspace.artifact !== null;
  const activeRev = workspace.activeRevision;

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line-0 bg-bg-1 px-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="select-none text-[14px] font-semibold tracking-tight text-fg-0">Relay</span>
        <span aria-hidden="true" className="h-4 w-px bg-line-2" />
        <h1 className="truncate text-[13px] font-medium text-fg-1" title={workspace.name}>
          {workspace.name}
        </h1>
        <RevisionPill
          revision={workspace.revision}
          active={activeRev !== null}
          title={
            activeRev !== null
              ? `Revision ${workspace.revision} · agents working on r${activeRev}`
              : `Revision ${workspace.revision}`
          }
        />
        <AnimatePresence initial={false}>
          {isLive ? (
            <motion.span
              key="live"
              initial={reduce ? false : { opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="inline-flex h-5 items-center gap-1.5 rounded-[5px] border border-ok/25 bg-ok/10 px-1.5 text-[11px] font-medium leading-none text-ok"
            >
              <StatusDot color="var(--ok)" size={6} />
              Live
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <Tooltip label={connected ? "Connected to live stream" : "Reconnecting to live stream"} side="bottom" align="end">
          <span className="inline-flex h-6 items-center gap-1.5 rounded-[5px] px-1.5 text-[11.5px] text-fg-2">
            <StatusDot color={connected ? "var(--ok)" : "var(--warn)"} active size={6} />
            <span className="hidden sm:inline">{connected ? "Connected" : "Reconnecting"}</span>
          </span>
        </Tooltip>

        <PresenceStack participants={participants} now={now} selfId={selfId} />

        <Button
          ref={shareBtnRef}
          size="sm"
          variant="secondary"
          onClick={onShare}
          aria-live="polite"
          aria-haspopup="dialog"
          aria-expanded={shareOpen}
          leading={copied ? <IconCheck size={14} className="text-ok" /> : <IconLink size={14} className="text-fg-2" />}
          className="min-w-[78px]"
        >
          {copied ? "Copied" : "Share"}
        </Button>
        <QrPopover
          open={shareOpen}
          onClose={closeShare}
          anchorRef={shareBtnRef}
          title="Invite to this workspace"
          url={shareUrl}
          hint="Scan from a phone on the same Wi-Fi"
          copied={copied}
          onCopied={flashCopied}
        />
      </div>
    </header>
  );
}
