"use client";

import { useCallback, useEffect, useReducer, useRef, useState, useSyncExternalStore } from "react";
import type { Agent, Participant, RelayEvent, SseFrame, Task, WorkspaceSnapshot } from "@/lib/types";
import {
  createIdentity,
  getIdentityServerSnapshot,
  getIdentitySnapshot,
  normalizeName,
  subscribeIdentity,
  type Identity,
} from "@/lib/client/identity";

export type MessageKind = "requirement" | "chat";

export type ConnectionPhase =
  | "booting" // first client render, identity not read yet
  | "needs-identity" // no stored identity: show the name modal
  | "joining" // POST /join in flight
  | "connecting" // EventSource opening, no snapshot yet
  | "live" // stream open
  | "reconnecting" // stream dropped, backoff scheduled
  | "not-found" // workspace 404
  | "error"; // join failed for a non-404 reason (will retry)

export type SendResult = { ok: true; event: RelayEvent | null } | { ok: false; error: string };

export interface UseWorkspaceResult {
  snapshot: WorkspaceSnapshot | null;
  connected: boolean;
  phase: ConnectionPhase;
  identity: Identity | null;
  needsIdentity: boolean;
  /** Called by the name modal; creates + persists the identity and starts the connection. */
  setName: (name: string) => void;
  /** Server-aligned "now" (epoch ms), ticking once per second. */
  now: number;
  send: (text: string, kind?: MessageKind) => Promise<SendResult>;
  sending: boolean;
  lastError: string | null;
  /** Force an immediate reconnect / re-join attempt. */
  retry: () => void;
}

export const HEARTBEAT_MS = 5_000;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 15_000;

// ── frame application ────────────────────────────────────────────────────────

function sortEvents(events: RelayEvent[]): RelayEvent[] {
  return events.slice().sort((a, b) => a.seq - b.seq || a.createdAt - b.createdAt);
}

export function mergeEvents(existing: RelayEvent[], incoming: RelayEvent[]): RelayEvent[] {
  if (incoming.length === 0) return existing;
  const seen = new Set<string>();
  for (const e of existing) seen.add(e.id);
  let out: RelayEvent[] | null = null;
  let needsSort = false;
  const lastSeq = existing.length ? existing[existing.length - 1].seq : -Infinity;
  for (const e of incoming) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    if (!out) out = existing.slice();
    if (e.seq < lastSeq) needsSort = true;
    out.push(e);
  }
  if (!out) return existing;
  return needsSort ? sortEvents(out) : out;
}

function replaceAgent(agents: Agent[], agent: Agent): Agent[] {
  const idx = agents.findIndex((a) => a.id === agent.id || a.role === agent.role);
  if (idx === -1) return [...agents, agent];
  const next = agents.slice();
  next[idx] = agent;
  return next;
}

function replaceTask(tasks: Task[], task: Task): Task[] {
  const idx = tasks.findIndex((t) => t.id === task.id);
  if (idx === -1) return [...tasks, task];
  const next = tasks.slice();
  next[idx] = task;
  return next;
}

export function applyFrame(prev: WorkspaceSnapshot | null, frame: SseFrame): WorkspaceSnapshot | null {
  switch (frame.kind) {
    case "snapshot": {
      const s = frame.snapshot;
      return {
        ...s,
        events:
          prev && prev.workspace.id === s.workspace.id
            ? mergeEvents(sortEvents(s.events), prev.events)
            : sortEvents(s.events),
      };
    }
    case "event":
      if (!prev) return prev;
      return { ...prev, events: mergeEvents(prev.events, [frame.event]) };
    case "workspace":
      if (!prev) return prev;
      return { ...prev, workspace: frame.workspace };
    case "agent":
      if (!prev) return prev;
      return { ...prev, agents: replaceAgent(prev.agents, frame.agent) };
    case "task":
      if (!prev) return prev;
      return { ...prev, tasks: replaceTask(prev.tasks, frame.task) };
    case "participants":
      if (!prev) return prev;
      return { ...prev, participants: frame.participants, now: frame.now };
    case "ping":
      if (!prev) return prev;
      return { ...prev, now: frame.now };
  }
}

interface State {
  /** Workspace id this state belongs to; frames for another id are dropped. */
  forId: string;
  snapshot: WorkspaceSnapshot | null;
}

type Action = { type: "frame"; frame: SseFrame; forId: string } | { type: "reset"; forId: string };

function reducer(state: State, action: Action): State {
  if (action.type === "reset") {
    return state.forId === action.forId && state.snapshot === null ? state : { forId: action.forId, snapshot: null };
  }
  if (action.forId !== state.forId) return { forId: action.forId, snapshot: applyFrame(null, action.frame) };
  const next = applyFrame(state.snapshot, action.frame);
  return next === state.snapshot ? state : { forId: state.forId, snapshot: next };
}

function frameNow(frame: SseFrame): number | null {
  switch (frame.kind) {
    case "snapshot":
      return frame.snapshot.now;
    case "participants":
    case "ping":
      return frame.now;
    default:
      return null;
  }
}

function frameLastSeq(frame: SseFrame): number {
  if (frame.kind === "event") return frame.event.seq;
  if (frame.kind === "snapshot") {
    let max = 0;
    for (const e of frame.snapshot.events) if (e.seq > max) max = e.seq;
    return max;
  }
  return 0;
}

function isParticipantList(v: unknown): v is Participant[] {
  return Array.isArray(v);
}

async function readError(res: Response): Promise<string> {
  try {
    const data: unknown = await res.clone().json();
    if (data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string") {
      return (data as { error: string }).error;
    }
  } catch {
    // fall through to text
  }
  try {
    const text = await res.text();
    if (text) return text.slice(0, 200);
  } catch {
    // ignore
  }
  return `${res.status} ${res.statusText}`.trim();
}

const noopSubscribe = () => () => {};

// ── hook ─────────────────────────────────────────────────────────────────────

export function useWorkspace(id: string): UseWorkspaceResult {
  const [state, dispatch] = useReducer(reducer, { forId: id, snapshot: null });
  const identity = useSyncExternalStore(subscribeIdentity, getIdentitySnapshot, getIdentityServerSnapshot);
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const [phase, setPhase] = useState<ConnectionPhase>("booting");
  const [connected, setConnected] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [tick, setTick] = useState(() => Date.now());
  const [offset, setOffset] = useState(0);

  const lastSeqRef = useRef(0);
  const snapshot = state.forId === id ? state.snapshot : null;

  // One-second ticker for presence + relative timestamps.
  useEffect(() => {
    const t = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const applyIncoming = useCallback(
    (frame: SseFrame) => {
      const serverNow = frameNow(frame);
      if (serverNow !== null) {
        const next = serverNow - Date.now();
        setOffset((prev) => (Math.abs(prev - next) > 250 ? next : prev));
      }
      if (frame.kind === "participants" && !isParticipantList(frame.participants)) return;
      const seq = frameLastSeq(frame);
      if (seq > lastSeqRef.current) lastSeqRef.current = seq;
      dispatch({ type: "frame", frame, forId: id });
    },
    [id],
  );

  // Join + stream lifecycle.
  useEffect(() => {
    if (!identity) return;
    let cancelled = false;
    let es: EventSource | null = null;
    let timer: number | null = null;
    let attempt = 0;
    const base = `/api/workspaces/${encodeURIComponent(id)}`;

    const clearTimer = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const schedule = (fn: () => void) => {
      clearTimer();
      const exp = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempt);
      const jitter = Math.random() * 250;
      attempt += 1;
      timer = window.setTimeout(fn, exp + jitter);
    };

    const openStream = () => {
      if (cancelled) return;
      if (es) {
        es.close();
        es = null;
      }
      const since = lastSeqRef.current;
      const url = `${base}/events${since > 0 ? `?since=${since}` : ""}`;
      setPhase((p) => (p === "live" || p === "reconnecting" ? p : "connecting"));
      const source = new EventSource(url);
      es = source;
      source.onopen = () => {
        if (cancelled || es !== source) return;
        attempt = 0;
        setConnected(true);
        setPhase("live");
        setLastError(null);
      };
      source.onmessage = (ev: MessageEvent<string>) => {
        if (cancelled || es !== source) return;
        let frame: SseFrame | null = null;
        try {
          frame = JSON.parse(ev.data) as SseFrame;
        } catch {
          frame = null;
        }
        if (!frame || typeof frame !== "object" || typeof frame.kind !== "string") return;
        applyIncoming(frame);
      };
      source.onerror = () => {
        if (cancelled || es !== source) return;
        source.close();
        es = null;
        setConnected(false);
        setPhase("reconnecting");
        schedule(openStream);
      };
    };

    const join = async () => {
      if (cancelled) return;
      setPhase("joining");
      try {
        const res = await fetch(`${base}/join`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ participant: { id: identity.id, name: identity.name } }),
          cache: "no-store",
        });
        if (cancelled) return;
        if (res.status === 404) {
          setPhase("not-found");
          setConnected(false);
          return;
        }
        if (!res.ok) {
          setLastError(await readError(res));
          setPhase("error");
          schedule(() => void join());
          return;
        }
        attempt = 0;
        openStream();
      } catch (err) {
        if (cancelled) return;
        setLastError(err instanceof Error ? err.message : "Network error");
        setPhase("error");
        schedule(() => void join());
      }
    };

    const onVisible = () => {
      if (document.visibilityState !== "visible" || cancelled) return;
      if (!es && timer !== null) {
        // Skip the rest of the backoff when the tab comes back.
        clearTimer();
        attempt = 0;
        openStream();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    // Start from a clean slate for this workspace id, then join.
    const start = window.setTimeout(() => {
      lastSeqRef.current = 0;
      dispatch({ type: "reset", forId: id });
      void join();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(start);
      document.removeEventListener("visibilitychange", onVisible);
      clearTimer();
      if (es) es.close();
      es = null;
      setConnected(false);
    };
  }, [id, identity, retryNonce, applyIncoming]);

  // Heartbeat.
  useEffect(() => {
    if (!identity) return;
    if (phase === "not-found" || phase === "needs-identity" || phase === "booting" || phase === "joining") return;
    const base = `/api/workspaces/${encodeURIComponent(id)}`;
    let stopped = false;
    const beat = () => {
      if (stopped) return;
      void fetch(`${base}/heartbeat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ participantId: identity.id }),
        cache: "no-store",
        keepalive: true,
      }).catch(() => undefined);
    };
    beat();
    const t = window.setInterval(beat, HEARTBEAT_MS);
    return () => {
      stopped = true;
      window.clearInterval(t);
    };
  }, [id, identity, phase]);

  const setName = useCallback((name: string) => {
    const clean = normalizeName(name);
    if (!clean) return;
    createIdentity(clean); // notifies the identity store → connection effect runs
    setPhase("joining");
  }, []);

  const send = useCallback(
    async (text: string, kind: MessageKind = "requirement"): Promise<SendResult> => {
      const trimmed = text.trim();
      if (!trimmed) return { ok: false, error: "Nothing to send." };
      if (!identity) return { ok: false, error: "No identity yet." };
      setSending(true);
      try {
        const res = await fetch(`/api/workspaces/${encodeURIComponent(id)}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ participantId: identity.id, text: trimmed, kind }),
          cache: "no-store",
        });
        if (!res.ok) {
          const error = await readError(res);
          setLastError(error);
          return { ok: false, error };
        }
        let event: RelayEvent | null = null;
        try {
          const data = (await res.json()) as { ok?: boolean; event?: RelayEvent };
          if (data && data.event && typeof data.event.id === "string") event = data.event;
        } catch {
          event = null;
        }
        // Optimistically apply the returned event; the SSE copy is deduped by id.
        if (event) applyIncoming({ kind: "event", event });
        return { ok: true, event };
      } catch (err) {
        const error = err instanceof Error ? err.message : "Network error";
        setLastError(error);
        return { ok: false, error };
      } finally {
        setSending(false);
      }
    },
    [id, identity, applyIncoming],
  );

  const retry = useCallback(() => setRetryNonce((n) => n + 1), []);

  const effectivePhase: ConnectionPhase = !hydrated ? "booting" : identity ? phase : "needs-identity";

  return {
    snapshot,
    connected,
    phase: effectivePhase,
    identity,
    needsIdentity: effectivePhase === "needs-identity",
    setName,
    now: tick + offset,
    send,
    sending,
    lastError,
    retry,
  };
}
