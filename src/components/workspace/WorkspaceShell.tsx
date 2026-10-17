"use client";

import { motion, useReducedMotion } from "motion/react";
import { useCallback, useMemo, useRef } from "react";
import type { WorkspaceSnapshot } from "@/lib/types";
import type { MessageKind, SendResult } from "@/hooks/useWorkspace";
import { AgentPanel } from "./AgentPanel";
import { ArtifactPanel } from "./ArtifactPanel";
import { Composer, type ComposerHandle } from "./Composer";
import { Timeline } from "./Timeline";
import { TopBar } from "./TopBar";
import { panelMotion, panelTransition } from "./motion";

export interface WorkspaceShellProps {
  snapshot: WorkspaceSnapshot;
  connected: boolean;
  now: number;
  selfId: string | null;
  onSend: (text: string, kind: MessageKind) => Promise<SendResult>;
  sending: boolean;
}

export function WorkspaceShell({ snapshot, connected, now, selfId, onSend, sending }: WorkspaceShellProps) {
  const reduce = useReducedMotion();
  const composerRef = useRef<ComposerHandle>(null);
  const { workspace, participants, agents, tasks, events } = snapshot;

  const self = useMemo(() => {
    const p = selfId ? participants.find((x) => x.id === selfId) : undefined;
    return p ? { name: p.name, color: p.color } : null;
  }, [participants, selfId]);

  const onPickExample = useCallback((text: string) => {
    composerRef.current?.fill(text);
  }, []);

  const panel = (index: number) => ({
    ...panelMotion,
    initial: reduce ? false : panelMotion.initial,
    transition: panelTransition(index),
  });

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-bg-0 text-fg-0">
      <motion.div {...panel(0)} className="shrink-0">
        <TopBar workspace={workspace} participants={participants} now={now} connected={connected} selfId={selfId} />
      </motion.div>

      <div className="flex min-h-0 flex-1">
        <motion.div {...panel(1)} className="w-[240px] shrink-0 xl:w-[272px]">
          <AgentPanel workspace={workspace} agents={agents} tasks={tasks} now={now} />
        </motion.div>

        <motion.main {...panel(2)} className="flex min-w-0 flex-1 flex-col bg-bg-0">
          <Timeline workspace={workspace} events={events} now={now} onPickExample={onPickExample} />
          <Composer ref={composerRef} onSend={onSend} sending={sending} activeRevision={workspace.activeRevision} self={self} />
        </motion.main>

        <motion.div {...panel(3)} className="w-[40%] min-w-[400px] shrink-0 border-l border-line-0 xl:w-[42%] xl:min-w-[440px]">
          <ArtifactPanel workspace={workspace} participants={participants} agents={agents} tasks={tasks} events={events} now={now} />
        </motion.div>
      </div>
    </div>
  );
}
