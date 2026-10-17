"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { RelayEvent, Requirement, WorkspaceSnapshot } from "@/lib/types";
import type { MessageKind, SendResult } from "@/hooks/useWorkspace";
import { FIXTURE_SCENARIOS, buildFixture, type FixtureScenario } from "@/lib/client/fixture";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";

const SELF_ID = "p_aditya";
const noopSubscribe = () => () => {};

interface LocalAddition {
  event: RelayEvent;
  requirement: Requirement | null;
}

export function DevPreview() {
  const [scenario, setScenario] = useState<FixtureScenario>("building");
  const [connected, setConnected] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [sending, setSending] = useState(false);
  // Things typed into the composer on this page, layered over the fixture.
  const [additions, setAdditions] = useState<LocalAddition[]>([]);

  // The fixture is relative to Date.now() and needs window.location, so it is
  // only built after hydration (server render shows an empty shell).
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const base = useMemo<WorkspaceSnapshot | null>(
    () => (mounted ? buildFixture(scenario, { baseUrl: window.location.origin }) : null),
    [mounted, scenario],
  );

  const snapshot = useMemo<WorkspaceSnapshot | null>(() => {
    if (!base) return null;
    // Keep the fixture's own participants "online" by bumping lastSeen.
    const participants = base.participants.map((p) => (p.id === "p_sam" ? p : { ...p, lastSeen: now - 1_000 }));
    const requirements = [...base.workspace.requirements, ...additions.flatMap((a) => (a.requirement ? [a.requirement] : []))];
    const revision = requirements.reduce((max, r) => Math.max(max, r.revision), base.workspace.revision);
    return {
      ...base,
      workspace: { ...base.workspace, revision, requirements },
      participants,
      events: [...base.events, ...additions.map((a) => a.event)],
      now,
    };
  }, [base, additions, now]);

  const onSend = useCallback(
    async (text: string, kind: MessageKind): Promise<SendResult> => {
      if (!snapshot) return { ok: false, error: "Fixture not ready." };
      setSending(true);
      await new Promise((r) => window.setTimeout(r, 350));
      const self = snapshot.participants.find((p) => p.id === SELF_ID) ?? snapshot.participants[0];
      const seq = (snapshot.events[snapshot.events.length - 1]?.seq ?? 0) + 1;
      const ts = Date.now();
      const actor = { kind: "human" as const, id: self.id, name: self.name, color: self.color };
      let addition: LocalAddition;
      if (kind === "chat") {
        addition = {
          requirement: null,
          event: {
            id: `ev_local_${seq}`,
            workspaceId: snapshot.workspace.id,
            seq,
            type: "human.message",
            actor,
            message: text,
            payload: { text },
            revision: snapshot.workspace.revision,
            createdAt: ts,
          },
        };
      } else {
        const revision = snapshot.workspace.revision + 1;
        const requirement: Requirement = { id: `req_local_${revision}`, text, revision, authorId: self.id, authorName: self.name, createdAt: ts };
        addition = {
          requirement,
          event: {
            id: `ev_local_${seq}`,
            workspaceId: snapshot.workspace.id,
            seq,
            type: "requirement.added",
            actor,
            message: text,
            payload: { requirement, revision, previousRevision: snapshot.workspace.revision },
            revision,
            createdAt: ts,
          },
        };
      }
      setAdditions((prev) => [...prev, addition]);
      setSending(false);
      return { ok: true, event: addition.event };
    },
    [snapshot],
  );

  const changeScenario = (next: FixtureScenario) => {
    setScenario(next);
    setAdditions([]);
  };

  return (
    <>
      {snapshot ? (
        <WorkspaceShell snapshot={snapshot} connected={connected} now={now} selfId={SELF_ID} onSend={onSend} sending={sending} />
      ) : (
        <div className="h-dvh w-full bg-bg-0" aria-busy="true" />
      )}
      <div
        className="fixed bottom-3 left-3 z-[90] flex items-center gap-2 rounded-lg border border-line-2 bg-bg-3/95 px-2.5 py-1.5 text-[11.5px] text-fg-1 backdrop-blur-sm"
        style={{ boxShadow: "var(--shadow-pop)" }}
      >
        <span className="font-medium uppercase tracking-[0.06em] text-fg-3">Dev fixture</span>
        <label className="inline-flex items-center gap-1.5">
          <span className="text-fg-3">Scenario</span>
          <select
            value={scenario}
            onChange={(e) => changeScenario(e.target.value as FixtureScenario)}
            className="h-6 rounded-[5px] border border-line-1 bg-bg-2 px-1.5 text-[11.5px] text-fg-0 focus:outline-none"
          >
            {FIXTURE_SCENARIOS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={connected} onChange={(e) => setConnected(e.target.checked)} className="accent-[var(--accent)]" />
          <span>Connected</span>
        </label>
      </div>
    </>
  );
}
