// ─────────────────────────────────────────────────────────────────────────────
// Relay — in-memory store with debounced JSON persistence and SSE pub/sub.
//
// One process, one store. The state object lives on globalThis so Next dev
// HMR (which re-evaluates this module per route bundle) never forks it.
// Workspaces, participants, agents, tasks and events are persisted to
// data/relay.json (requirements live inside each workspace). Subscribers,
// timers and presence bookkeeping stay in memory only.
// ─────────────────────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";
import { describeProvider } from "@/lib/llm";
import { agentId, colorForJoinIndex, newId, newWorkspaceId } from "@/lib/ids";
import {
  AGENT_NAMES,
  PRESENCE_TTL_MS,
  type Agent,
  type AgentRole,
  type ExecutorKind,
  type Participant,
  type RelayEvent,
  type Requirement,
  type SseFrame,
  type Task,
  type Workspace,
  type WorkspaceSnapshot,
} from "@/lib/types";

// ── Public types ─────────────────────────────────────────────────────────────

export type NewTask = Omit<
  Task,
  "id" | "createdAt" | "startedAt" | "finishedAt" | "status" | "output" | "error"
> &
  Partial<Task>;

export type NewEvent = Omit<RelayEvent, "id" | "seq" | "createdAt" | "workspaceId" | "revision"> & {
  revision?: number;
};

export type ParticipantsFrame = Extract<SseFrame, { kind: "participants" }>;

export interface RelayStore {
  // workspaces
  createWorkspace(name: string, executor: ExecutorKind): Workspace;
  getWorkspace(id: string): Workspace | null;
  updateWorkspace(id: string, patch: Partial<Workspace>): Workspace;
  listWorkspaces(): Workspace[];
  // participants
  upsertParticipant(wsId: string, p: { id: string; name: string }): Participant;
  heartbeat(wsId: string, participantId: string): void;
  getParticipants(wsId: string): Participant[];
  // agents
  getAgents(wsId: string): Agent[];
  getAgent(wsId: string, role: AgentRole): Agent;
  setAgent(wsId: string, role: AgentRole, patch: Partial<Agent>): Agent;
  // tasks
  createTask(t: NewTask): Task;
  updateTask(id: string, patch: Partial<Task>): Task;
  getTasks(wsId: string): Task[];
  getTask(id: string): Task | null;
  // requirements
  addRequirement(
    wsId: string,
    text: string,
    author: { id: string; name: string },
  ): { workspace: Workspace; requirement: Requirement };
  // events
  emit(wsId: string, e: NewEvent): RelayEvent;
  getEvents(wsId: string, sinceSeq?: number): RelayEvent[];
  snapshot(wsId: string): WorkspaceSnapshot;
  // pub/sub for SSE
  subscribe(wsId: string, fn: (frame: SseFrame) => void): () => void;
  broadcast(wsId: string, frame: SseFrame): void;
  /** Write pending changes to disk now (used on shutdown; safe to call any time). */
  flush(): Promise<void>;
}

/** Presence predicate shared with the client: online if seen within the TTL. */
export const ONLINE = (p: Participant, now: number): boolean => now - p.lastSeen < PRESENCE_TTL_MS;

// ── Constants ────────────────────────────────────────────────────────────────

// RELAY_DATA_DIR lets a second server (smoke tests, a persistent volume) keep its
// own state instead of sharing ./data with whatever else runs from this checkout.
const DATA_DIR = process.env.RELAY_DATA_DIR ? path.resolve(process.env.RELAY_DATA_DIR) : path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "relay.json");
const PERSIST_DEBOUNCE_MS = 250;
const PARTICIPANTS_BROADCAST_MIN_MS = 5_000;
const PRESENCE_SWEEP_MS = 5_000;
const ROLES: AgentRole[] = ["architect", "builder", "reviewer"];
const LOG = "[relay:store]";

// ── Persisted shape ──────────────────────────────────────────────────────────

interface PersistedState {
  version: 1;
  savedAt: number;
  workspaces: Workspace[];
  participants: Participant[];
  agents: Agent[];
  tasks: Task[];
  events: RelayEvent[];
}

// ── Internal state ───────────────────────────────────────────────────────────

type Subscriber = (frame: SseFrame) => void;

interface State {
  workspaces: Map<string, Workspace>;
  /** wsId → participantId → Participant (insertion order == join order). */
  participants: Map<string, Map<string, Participant>>;
  /** wsId → role → Agent */
  agents: Map<string, Map<AgentRole, Agent>>;
  /** taskId → Task (insertion order == creation order). */
  tasks: Map<string, Task>;
  /** wsId → ordered event log */
  events: Map<string, RelayEvent[]>;
  /** wsId → last assigned seq */
  seq: Map<string, number>;
  // memory-only
  subscribers: Map<string, Set<Subscriber>>;
  lastParticipantsBroadcastAt: Map<string, number>;
  lastOnlineKey: Map<string, string>;
  persistTimer: ReturnType<typeof setTimeout> | null;
  dirty: boolean;
  writing: Promise<void> | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function hasStringId(v: unknown): v is { id: string } {
  return isRecord(v) && typeof v.id === "string" && v.id.length > 0;
}

function hasWorkspaceRef(v: unknown): v is { id: string; workspaceId: string } {
  return hasStringId(v) && typeof (v as Record<string, unknown>).workspaceId === "string";
}

/** Read data/relay.json. A missing, unreadable or malformed file yields an empty state. */
function loadPersisted(): PersistedState | null {
  let raw: string;
  try {
    if (!fs.existsSync(DATA_FILE)) return null;
    raw = fs.readFileSync(DATA_FILE, "utf8");
  } catch (err) {
    console.warn(`${LOG} could not read ${DATA_FILE}:`, err instanceof Error ? err.message : err);
    return null;
  }
  if (!raw.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn(`${LOG} ${DATA_FILE} is not valid JSON, starting empty:`, err instanceof Error ? err.message : err);
    return null;
  }
  if (!isRecord(parsed)) {
    console.warn(`${LOG} ${DATA_FILE} has an unexpected shape, starting empty`);
    return null;
  }
  const arr = (key: string): unknown[] => (Array.isArray(parsed[key]) ? (parsed[key] as unknown[]) : []);
  return {
    version: 1,
    savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
    workspaces: arr("workspaces").filter(hasStringId) as Workspace[],
    participants: arr("participants").filter(hasWorkspaceRef) as Participant[],
    agents: arr("agents").filter(hasWorkspaceRef) as Agent[],
    tasks: arr("tasks").filter(hasWorkspaceRef) as Task[],
    events: arr("events").filter(hasWorkspaceRef) as RelayEvent[],
  };
}

function freshWorkspaceDefaults(): Omit<Workspace, "id" | "name" | "createdAt" | "executor"> {
  return {
    revision: 0,
    requirements: [],
    plan: null,
    artifact: null,
    buildStatus: "idle",
    buildError: null,
    sandboxId: null,
    activeRevision: null,
    pendingRevision: null,
  };
}

function buildAgents(wsId: string, now: number): Map<AgentRole, Agent> {
  const { provider, model } = describeProvider();
  const map = new Map<AgentRole, Agent>();
  for (const role of ROLES) {
    map.set(role, {
      id: agentId(wsId, role),
      workspaceId: wsId,
      role,
      name: AGENT_NAMES[role],
      provider,
      model,
      status: "idle",
      statusDetail: null,
      currentTaskId: null,
      updatedAt: now,
    });
  }
  return map;
}

function createState(): State {
  const state: State = {
    workspaces: new Map(),
    participants: new Map(),
    agents: new Map(),
    tasks: new Map(),
    events: new Map(),
    seq: new Map(),
    subscribers: new Map(),
    lastParticipantsBroadcastAt: new Map(),
    lastOnlineKey: new Map(),
    persistTimer: null,
    dirty: false,
    writing: null,
  };

  const persisted = loadPersisted();
  if (!persisted) return state;

  for (const ws of persisted.workspaces) {
    state.workspaces.set(ws.id, { ...freshWorkspaceDefaults(), ...ws, requirements: Array.isArray(ws.requirements) ? ws.requirements : [] });
    state.participants.set(ws.id, new Map());
    state.agents.set(ws.id, new Map());
    state.events.set(ws.id, []);
    state.seq.set(ws.id, 0);
  }
  for (const p of persisted.participants) {
    state.participants.get(p.workspaceId)?.set(p.id, p);
  }
  for (const a of persisted.agents) {
    if (ROLES.includes(a.role)) state.agents.get(a.workspaceId)?.set(a.role, a);
  }
  // Every workspace must have all three agents; backfill if the file predates one.
  for (const ws of state.workspaces.values()) {
    const agents = state.agents.get(ws.id)!;
    if (agents.size !== ROLES.length) {
      const defaults = buildAgents(ws.id, Date.now());
      for (const role of ROLES) if (!agents.has(role)) agents.set(role, defaults.get(role)!);
    }
  }
  for (const t of persisted.tasks) {
    if (state.workspaces.has(t.workspaceId)) state.tasks.set(t.id, t);
  }
  const sortedEvents = [...persisted.events].sort((a, b) => a.seq - b.seq);
  for (const e of sortedEvents) {
    const log = state.events.get(e.workspaceId);
    if (!log) continue;
    log.push(e);
    if (typeof e.seq === "number" && e.seq > (state.seq.get(e.workspaceId) ?? 0)) state.seq.set(e.workspaceId, e.seq);
  }
  console.log(
    `${LOG} pid ${process.pid}: loaded ${state.workspaces.size} workspace(s), ${persisted.events.length} event(s) from ${path.relative(process.cwd(), DATA_FILE)}`,
  );
  return state;
}

// ── Store factory ────────────────────────────────────────────────────────────

function createStore(): RelayStore {
  const state = createState();

  // ── persistence ──────────────────────────────────────────────────────────

  function serialize(): PersistedState {
    const participants: Participant[] = [];
    for (const m of state.participants.values()) participants.push(...m.values());
    const agents: Agent[] = [];
    for (const m of state.agents.values()) agents.push(...m.values());
    const events: RelayEvent[] = [];
    for (const log of state.events.values()) events.push(...log);
    return {
      version: 1,
      savedAt: Date.now(),
      workspaces: [...state.workspaces.values()],
      participants,
      agents,
      tasks: [...state.tasks.values()],
      events,
    };
  }

  async function writeNow(): Promise<void> {
    if (state.writing) {
      // A write is in flight; it will notice `dirty` and run again when done.
      return state.writing;
    }
    state.dirty = false;
    const json = JSON.stringify(serialize());
    const tmp = `${DATA_FILE}.${process.pid}.tmp`;
    state.writing = (async () => {
      try {
        await fs.promises.mkdir(DATA_DIR, { recursive: true });
        await fs.promises.writeFile(tmp, json, "utf8");
        await fs.promises.rename(tmp, DATA_FILE);
      } catch (err) {
        state.dirty = true;
        console.warn(`${LOG} persist failed:`, err instanceof Error ? err.message : err);
      } finally {
        state.writing = null;
      }
    })();
    await state.writing;
    if (state.dirty) schedulePersist();
  }

  function schedulePersist(): void {
    state.dirty = true;
    if (state.persistTimer) return;
    state.persistTimer = setTimeout(() => {
      state.persistTimer = null;
      void writeNow();
    }, PERSIST_DEBOUNCE_MS);
    state.persistTimer.unref?.();
  }

  function flushSync(): void {
    if (state.persistTimer) {
      clearTimeout(state.persistTimer);
      state.persistTimer = null;
    }
    if (!state.dirty && !state.writing) return;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(serialize()), "utf8");
      state.dirty = false;
    } catch (err) {
      console.warn(`${LOG} final persist failed:`, err instanceof Error ? err.message : err);
    }
  }

  process.on("exit", flushSync);

  // ── helpers ──────────────────────────────────────────────────────────────

  function mustWorkspace(id: string): Workspace {
    const ws = state.workspaces.get(id);
    if (!ws) throw new Error(`workspace not found: ${id}`);
    return ws;
  }

  function setWorkspace(ws: Workspace): Workspace {
    state.workspaces.set(ws.id, ws);
    schedulePersist();
    broadcast(ws.id, { kind: "workspace", workspace: ws });
    return ws;
  }

  function participantsOf(wsId: string): Participant[] {
    return [...(state.participants.get(wsId)?.values() ?? [])];
  }

  function onlineKey(wsId: string, now: number): string {
    return participantsOf(wsId)
      .filter((p) => ONLINE(p, now))
      .map((p) => p.id)
      .sort()
      .join("|");
  }

  function frameForParticipants(wsId: string): ParticipantsFrame {
    return { kind: "participants", participants: participantsOf(wsId), now: Date.now() };
  }

  function broadcastParticipants(wsId: string, now: number): void {
    state.lastParticipantsBroadcastAt.set(wsId, now);
    state.lastOnlineKey.set(wsId, onlineKey(wsId, now));
    broadcast(wsId, frameForParticipants(wsId));
  }

  /**
   * Presence sweep: people who stop heartbeating never trigger a store call,
   * so every few seconds we check, for workspaces someone is watching, whether
   * the online set silently changed and tell the watchers.
   */
  function sweepPresence(): void {
    const now = Date.now();
    for (const [wsId, subs] of state.subscribers) {
      if (subs.size === 0) continue;
      const key = onlineKey(wsId, now);
      if (key !== state.lastOnlineKey.get(wsId)) broadcastParticipants(wsId, now);
    }
  }
  const sweeper = setInterval(sweepPresence, PRESENCE_SWEEP_MS);
  sweeper.unref?.();

  // ── pub/sub ──────────────────────────────────────────────────────────────

  function subscribe(wsId: string, fn: Subscriber): () => void {
    let set = state.subscribers.get(wsId);
    if (!set) {
      set = new Set();
      state.subscribers.set(wsId, set);
    }
    set.add(fn);
    return () => {
      const current = state.subscribers.get(wsId);
      if (!current) return;
      current.delete(fn);
      if (current.size === 0) state.subscribers.delete(wsId);
    };
  }

  function broadcast(wsId: string, frame: SseFrame): void {
    const set = state.subscribers.get(wsId);
    if (!set || set.size === 0) return;
    for (const fn of [...set]) {
      try {
        fn(frame);
      } catch (err) {
        // A dead subscriber must never take down the writer.
        set.delete(fn);
        console.warn(`${LOG} dropped subscriber for ${wsId}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  // ── workspaces ───────────────────────────────────────────────────────────

  function createWorkspace(name: string, executor: ExecutorKind): Workspace {
    const now = Date.now();
    let id = newWorkspaceId();
    while (state.workspaces.has(id)) id = newWorkspaceId();
    const ws: Workspace = { id, name, createdAt: now, executor, ...freshWorkspaceDefaults() };
    state.workspaces.set(id, ws);
    state.participants.set(id, new Map());
    state.agents.set(id, buildAgents(id, now));
    state.events.set(id, []);
    state.seq.set(id, 0);
    schedulePersist();
    return ws;
  }

  function getWorkspace(id: string): Workspace | null {
    return state.workspaces.get(id) ?? null;
  }

  function updateWorkspace(id: string, patch: Partial<Workspace>): Workspace {
    const ws = mustWorkspace(id);
    return setWorkspace({ ...ws, ...patch, id: ws.id, createdAt: ws.createdAt });
  }

  function listWorkspaces(): Workspace[] {
    return [...state.workspaces.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  // ── participants ─────────────────────────────────────────────────────────

  function upsertParticipant(wsId: string, p: { id: string; name: string }): Participant {
    mustWorkspace(wsId);
    const now = Date.now();
    let map = state.participants.get(wsId);
    if (!map) {
      map = new Map();
      state.participants.set(wsId, map);
    }
    const existing = map.get(p.id);
    let participant: Participant;
    if (existing) {
      participant = { ...existing, name: p.name, lastSeen: now };
    } else {
      participant = {
        id: p.id,
        workspaceId: wsId,
        name: p.name,
        color: colorForJoinIndex(map.size),
        lastSeen: now,
        joinedAt: now,
      };
    }
    map.set(p.id, participant);
    schedulePersist();
    broadcastParticipants(wsId, now);
    return participant;
  }

  function heartbeat(wsId: string, participantId: string): void {
    const map = state.participants.get(wsId);
    const existing = map?.get(participantId);
    if (!map || !existing) return;
    const now = Date.now();
    const before = state.lastOnlineKey.get(wsId) ?? onlineKey(wsId, now);
    map.set(participantId, { ...existing, lastSeen: now });
    schedulePersist();
    const after = onlineKey(wsId, now);
    const last = state.lastParticipantsBroadcastAt.get(wsId) ?? 0;
    if (after !== before || now - last >= PARTICIPANTS_BROADCAST_MIN_MS) broadcastParticipants(wsId, now);
  }

  function getParticipants(wsId: string): Participant[] {
    return participantsOf(wsId);
  }

  // ── agents ───────────────────────────────────────────────────────────────

  function agentsOf(wsId: string): Map<AgentRole, Agent> {
    mustWorkspace(wsId);
    let map = state.agents.get(wsId);
    if (!map || map.size !== ROLES.length) {
      const defaults = buildAgents(wsId, Date.now());
      map = map ?? new Map();
      for (const role of ROLES) if (!map.has(role)) map.set(role, defaults.get(role)!);
      state.agents.set(wsId, map);
      schedulePersist();
    }
    return map;
  }

  function getAgents(wsId: string): Agent[] {
    const map = agentsOf(wsId);
    return ROLES.map((role) => map.get(role)!);
  }

  function getAgent(wsId: string, role: AgentRole): Agent {
    const agent = agentsOf(wsId).get(role);
    if (!agent) throw new Error(`agent not found: ${wsId}/${role}`);
    return agent;
  }

  function setAgent(wsId: string, role: AgentRole, patch: Partial<Agent>): Agent {
    const current = getAgent(wsId, role);
    const next: Agent = {
      ...current,
      ...patch,
      id: current.id,
      workspaceId: current.workspaceId,
      role: current.role,
      updatedAt: patch.updatedAt ?? Date.now(),
    };
    agentsOf(wsId).set(role, next);
    schedulePersist();
    broadcast(wsId, { kind: "agent", agent: next });
    return next;
  }

  // ── tasks ────────────────────────────────────────────────────────────────

  function createTask(t: NewTask): Task {
    mustWorkspace(t.workspaceId);
    const now = Date.now();
    let id = t.id ?? newId();
    while (state.tasks.has(id)) id = newId();
    const task: Task = {
      id,
      workspaceId: t.workspaceId,
      agentRole: t.agentRole,
      title: t.title,
      description: t.description,
      dependsOn: t.dependsOn ?? [],
      baseRevision: t.baseRevision,
      status: t.status ?? "queued",
      output: t.output ?? null,
      error: t.error ?? null,
      createdAt: t.createdAt ?? now,
      startedAt: t.startedAt ?? null,
      finishedAt: t.finishedAt ?? null,
    };
    state.tasks.set(id, task);
    schedulePersist();
    broadcast(task.workspaceId, { kind: "task", task });
    return task;
  }

  function updateTask(id: string, patch: Partial<Task>): Task {
    const current = state.tasks.get(id);
    if (!current) throw new Error(`task not found: ${id}`);
    const next: Task = { ...current, ...patch, id: current.id, workspaceId: current.workspaceId };
    state.tasks.set(id, next);
    schedulePersist();
    broadcast(next.workspaceId, { kind: "task", task: next });
    return next;
  }

  function getTasks(wsId: string): Task[] {
    const out: Task[] = [];
    for (const t of state.tasks.values()) if (t.workspaceId === wsId) out.push(t);
    return out;
  }

  function getTask(id: string): Task | null {
    return state.tasks.get(id) ?? null;
  }

  // ── requirements ─────────────────────────────────────────────────────────

  function addRequirement(
    wsId: string,
    text: string,
    author: { id: string; name: string },
  ): { workspace: Workspace; requirement: Requirement } {
    const ws = mustWorkspace(wsId);
    const revision = ws.revision + 1;
    const requirement: Requirement = {
      id: newId(),
      text,
      revision,
      authorId: author.id,
      authorName: author.name,
      createdAt: Date.now(),
    };
    const workspace = setWorkspace({ ...ws, revision, requirements: [...ws.requirements, requirement] });
    return { workspace, requirement };
  }

  // ── events ───────────────────────────────────────────────────────────────

  function emit(wsId: string, e: NewEvent): RelayEvent {
    const ws = mustWorkspace(wsId);
    const seq = (state.seq.get(wsId) ?? 0) + 1;
    state.seq.set(wsId, seq);
    const event: RelayEvent = {
      id: newId(),
      workspaceId: wsId,
      seq,
      type: e.type,
      actor: e.actor,
      message: e.message,
      payload: e.payload ?? {},
      revision: e.revision ?? ws.revision,
      createdAt: Date.now(),
    };
    let log = state.events.get(wsId);
    if (!log) {
      log = [];
      state.events.set(wsId, log);
    }
    log.push(event);
    schedulePersist();
    broadcast(wsId, { kind: "event", event });
    return event;
  }

  function getEvents(wsId: string, sinceSeq?: number): RelayEvent[] {
    const log = state.events.get(wsId) ?? [];
    if (sinceSeq === undefined || sinceSeq <= 0) return [...log];
    // Log is append-only and seq-ordered; binary search the first seq > sinceSeq.
    let lo = 0;
    let hi = log.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (log[mid].seq <= sinceSeq) lo = mid + 1;
      else hi = mid;
    }
    return log.slice(lo);
  }

  function snapshot(wsId: string): WorkspaceSnapshot {
    const workspace = mustWorkspace(wsId);
    return {
      workspace,
      participants: participantsOf(wsId),
      agents: getAgents(wsId),
      tasks: getTasks(wsId),
      events: getEvents(wsId),
      now: Date.now(),
    };
  }

  async function flush(): Promise<void> {
    if (state.persistTimer) {
      clearTimeout(state.persistTimer);
      state.persistTimer = null;
    }
    if (state.writing) await state.writing;
    if (state.dirty) await writeNow();
  }

  return {
    createWorkspace,
    getWorkspace,
    updateWorkspace,
    listWorkspaces,
    upsertParticipant,
    heartbeat,
    getParticipants,
    getAgents,
    getAgent,
    setAgent,
    createTask,
    updateTask,
    getTasks,
    getTask,
    addRequirement,
    emit,
    getEvents,
    snapshot,
    subscribe,
    broadcast,
    flush,
  };
}

// ── Singleton (survives Next dev HMR and is shared by every route bundle) ────

const g = globalThis as typeof globalThis & { __relayStore?: RelayStore };
g.__relayStore ??= createStore();

export const store: RelayStore = g.__relayStore;

/** Current participants of a workspace plus server time, as an SSE frame. */
export function participantsFrame(wsId: string): ParticipantsFrame {
  return { kind: "participants", participants: store.getParticipants(wsId), now: Date.now() };
}
