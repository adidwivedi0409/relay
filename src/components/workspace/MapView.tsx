"use client";

import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Agent, Participant, RelayEvent, Task, Workspace } from "@/lib/types";
import { AGENT_COLORS, PRESENCE_TTL_MS } from "@/lib/types";
import { agentStatusLabel, initials, isAgentBusy, isBuildInFlight } from "@/lib/client/format";

// ─────────────────────────────────────────────────────────────────────────────
// Read-only Figma-style map of the collaboration. Everything is derived from
// the live snapshot, so the map animates as humans and agents work. Nodes can
// be dragged around locally; positions are never persisted.
// ─────────────────────────────────────────────────────────────────────────────

export interface MapViewProps {
  workspace: Workspace;
  participants: Participant[];
  agents: Agent[];
  tasks: Task[];
  events: RelayEvent[];
  now: number;
}

type HumanData = { name: string; color: string; online: boolean };
type RevisionData = { revision: number; author: string; text: string };
type AgentData = {
  role: Agent["role"];
  name: string;
  model: string;
  status: Agent["status"];
  detail: string | null;
  reduce: boolean;
};
type ComponentData = {
  name: string;
  files: string[];
  changed: boolean;
  added: boolean;
  tag: string | null;
};
type ShipData = { revision: number; host: string; url: string; current: boolean };
type VerdictData = { verdict: "passed" | "warnings" | "failed"; ok: number; total: number; revision: number };
type FailureData = { title: string; detail: string };
type LabelData = { label: string };

type HumanNode = Node<HumanData, "human">;
type RevisionNode = Node<RevisionData, "revision">;
type AgentNode = Node<AgentData, "agent">;
type ComponentNode = Node<ComponentData, "component">;
type ShipNode = Node<ShipData, "ship">;
type VerdictNode = Node<VerdictData, "verdict">;
type FailureNode = Node<FailureData, "failure">;
type LabelNode = Node<LabelData, "label">;

type MapNode = HumanNode | RevisionNode | AgentNode | ComponentNode | ShipNode | VerdictNode | FailureNode | LabelNode;

const COL_X = [0, 300, 600, 900, 1200] as const;
const ROW_H = 120;
const NODE_W = 220;
const EDGE_STROKE = "rgba(255,255,255,0.18)";

const COLUMN_LABELS = ["Humans", "Revisions", "Agents", "Plan", "Ship"] as const;

// ── Node chrome ──────────────────────────────────────────────────────────────

function Ports() {
  return (
    <>
      <Handle type="target" position={Position.Left} isConnectable={false} style={{ opacity: 0, pointerEvents: "none" }} />
      <Handle type="source" position={Position.Right} isConnectable={false} style={{ opacity: 0, pointerEvents: "none" }} />
    </>
  );
}

const CARD = "rounded-[10px] border bg-bg-2 text-[12px] leading-[1.35] text-fg-0 shadow-[0_1px_0_rgba(0,0,0,0.25)]";

function HumanNodeView({ data }: NodeProps<HumanNode>) {
  return (
    <div className={`${CARD} flex items-center gap-2.5 border-line-1 px-3 py-2.5`} style={{ width: NODE_W }}>
      <Ports />
      <span
        className="relative inline-flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-full text-[11px] font-semibold text-bg-0"
        style={{ background: data.color }}
      >
        {initials(data.name)}
        <span
          aria-hidden="true"
          className={`absolute -bottom-px -right-px block h-[9px] w-[9px] rounded-full border-2 border-bg-2 ${data.online ? "bg-ok" : "bg-fg-3"}`}
        />
      </span>
      <div className="min-w-0">
        <div className="truncate font-medium">{data.name}</div>
        <div className="text-[11px] text-fg-2">{data.online ? "online" : "away"}</div>
      </div>
    </div>
  );
}

function RevisionNodeView({ data }: NodeProps<RevisionNode>) {
  return (
    <div className={`${CARD} border-line-1 px-3 py-2.5`} style={{ width: NODE_W }}>
      <Ports />
      <div className="mb-1 flex items-center gap-2">
        <span className="mono rounded-[5px] bg-bg-3 px-1.5 py-px text-[11px] text-fg-1">r{data.revision}</span>
        <span className="truncate text-[11px] text-fg-2">{data.author}</span>
      </div>
      <div className="line-clamp-3 text-fg-1">{data.text}</div>
    </div>
  );
}

function AgentNodeView({ data }: NodeProps<AgentNode>) {
  const color = AGENT_COLORS[data.role];
  const busy = isAgentBusy(data.status);
  const tone = data.status === "error" ? "var(--err)" : data.status === "done" ? "var(--ok)" : busy ? color : "var(--fg-3)";
  return (
    <div className={`${CARD} relative overflow-hidden border-line-1 py-2.5 pl-4 pr-3`} style={{ width: NODE_W }}>
      <Ports />
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color }} />
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{data.name}</span>
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-1.5 py-px text-[10.5px]"
          style={{ borderColor: `color-mix(in srgb, ${tone} 45%, transparent)`, color: tone }}
        >
          <span
            aria-hidden="true"
            className={`block h-1.5 w-1.5 rounded-full ${busy && !data.reduce ? "pulse" : ""}`}
            style={{ background: tone, color: tone }}
          />
          {agentStatusLabel(data.status)}
        </span>
      </div>
      <div className="mono mt-0.5 truncate text-[10.5px] text-fg-3">{data.model}</div>
      {data.detail ? <div className="mt-1 line-clamp-2 text-[11px] text-fg-2">{data.detail}</div> : null}
    </div>
  );
}

function ComponentNodeView({ data }: NodeProps<ComponentNode>) {
  const border = data.added ? "border-ok" : data.changed ? "border-accent" : "border-line-1";
  return (
    <div className={`${CARD} ${border} px-3 py-2.5`} style={{ width: NODE_W }}>
      <Ports />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-medium">{data.name}</span>
        {data.tag ? (
          <span
            className={`shrink-0 rounded-[5px] px-1.5 py-px text-[10px] ${data.added ? "bg-ok/15 text-ok" : "bg-accent/15 text-accent"}`}
          >
            {data.tag}
          </span>
        ) : null}
      </div>
      <div className="mono mt-1 space-y-px text-[10.5px] text-fg-3">
        {data.files.slice(0, 4).map((f) => (
          <div key={f} className="truncate">
            {f}
          </div>
        ))}
        {data.files.length > 4 ? <div>+{data.files.length - 4} more</div> : null}
      </div>
    </div>
  );
}

function ShipNodeView({ data }: NodeProps<ShipNode>) {
  return (
    <div className={`${CARD} ${data.current ? "border-ok" : "border-line-1"} px-3 py-2.5`} style={{ width: NODE_W }}>
      <Ports />
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="block h-1.5 w-1.5 rounded-full bg-ok" />
        <span className="font-medium">r{data.revision} live</span>
        <span className="truncate text-[11px] text-fg-2">· {data.host}</span>
      </div>
      <a
        href={data.url}
        target="_blank"
        rel="noopener noreferrer"
        className="nodrag mono mt-1 block truncate text-[10.5px] text-fg-2 underline decoration-line-2 underline-offset-2 hover:text-fg-0"
        title={data.url}
      >
        {data.url}
      </a>
    </div>
  );
}

function VerdictNodeView({ data }: NodeProps<VerdictNode>) {
  const tone = data.verdict === "passed" ? "ok" : data.verdict === "warnings" ? "warn" : "err";
  const cls = tone === "ok" ? "border-ok text-ok" : tone === "warn" ? "border-warn text-warn" : "border-err text-err";
  const label = data.verdict === "passed" ? "Passed" : data.verdict === "warnings" ? "Warnings" : "Failed";
  return (
    <div className={`${CARD} ${cls} px-3 py-2.5`} style={{ width: NODE_W }}>
      <Ports />
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">Review {label}</span>
        <span className="mono text-[10.5px] opacity-80">r{data.revision}</span>
      </div>
      <div className="mt-0.5 text-[11px] text-fg-2">
        {data.ok}/{data.total} checks
      </div>
    </div>
  );
}

function FailureNodeView({ data }: NodeProps<FailureNode>) {
  return (
    <div className={`${CARD} border-err px-3 py-2.5`} style={{ width: NODE_W }}>
      <Ports />
      <div className="font-medium text-err">{data.title}</div>
      <div className="mt-0.5 line-clamp-3 text-[11px] text-fg-2">{data.detail}</div>
    </div>
  );
}

function LabelNodeView({ data }: NodeProps<LabelNode>) {
  return (
    <div className="select-none text-[10.5px] font-medium uppercase tracking-[0.12em] text-fg-3" style={{ width: NODE_W }}>
      {data.label}
    </div>
  );
}

const nodeTypes = {
  human: HumanNodeView,
  revision: RevisionNodeView,
  agent: AgentNodeView,
  component: ComponentNodeView,
  ship: ShipNodeView,
  verdict: VerdictNodeView,
  failure: FailureNodeView,
  label: LabelNodeView,
};

// ── Derivation ───────────────────────────────────────────────────────────────

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

interface Derived {
  nodes: MapNode[];
  edges: Edge[];
}

function derive(props: MapViewProps, reduce: boolean): Derived {
  const { workspace, participants, agents, tasks, events, now } = props;
  const nodes: MapNode[] = [];
  const edges: Edge[] = [];
  const nodeIds = new Set<string>();

  const push = (n: MapNode) => {
    nodes.push(n);
    nodeIds.add(n.id);
  };
  const base = { draggable: true, connectable: false, deletable: false, selectable: false } as const;
  const at = (col: number, row: number) => ({ x: COL_X[col], y: 36 + row * ROW_H });
  const link = (source: string, target: string, animated = false) => {
    if (!nodeIds.has(source) || !nodeIds.has(target)) return;
    edges.push({
      id: `${source}->${target}`,
      source,
      target,
      type: "smoothstep",
      animated: animated && !reduce,
      style: { stroke: EDGE_STROKE, strokeWidth: 1.25 },
    });
  };

  // Column labels (not draggable, purely decorative).
  COLUMN_LABELS.forEach((label, col) => {
    nodes.push({
      id: `label:${col}`,
      type: "label",
      position: { x: COL_X[col], y: 0 },
      data: { label },
      draggable: false,
      selectable: false,
      connectable: false,
      deletable: false,
    });
  });

  // Column 0 — humans
  const humans = [...participants].sort((a, b) => a.joinedAt - b.joinedAt);
  humans.forEach((p, i) => {
    push({
      id: `h:${p.id}`,
      type: "human",
      position: at(0, i),
      data: { name: p.name, color: p.color, online: now - p.lastSeen < PRESENCE_TTL_MS },
      ...base,
    });
  });

  // Column 1 — revisions (one per requirement)
  const reqs = [...workspace.requirements].sort((a, b) => a.revision - b.revision || a.createdAt - b.createdAt);
  const revisionNode = new Map<number, string>();
  reqs.forEach((r, i) => {
    const id = `r:${r.id}`;
    push({
      id,
      type: "revision",
      position: at(1, i),
      data: { revision: r.revision, author: r.authorName, text: r.text },
      ...base,
    });
    revisionNode.set(r.revision, id);
    link(`h:${r.authorId}`, id);
  });
  const latestRevisionId = reqs.length ? `r:${reqs[reqs.length - 1].id}` : null;
  const resolveRevision = (rev: number | null | undefined): string | null => {
    if (rev == null) return latestRevisionId;
    const exact = revisionNode.get(rev);
    if (exact) return exact;
    // Fall back to the newest requirement at or before that revision.
    let best: string | null = null;
    for (const r of reqs) if (r.revision <= rev) best = `r:${r.id}`;
    return best ?? latestRevisionId;
  };

  // Column 2 — agents
  const order: Agent["role"][] = ["architect", "builder", "reviewer"];
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const sortedAgents = [...agents].sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
  sortedAgents.forEach((a, i) => {
    const id = `a:${a.role}`;
    push({
      id,
      type: "agent",
      position: at(2, i),
      data: { role: a.role, name: a.name, model: a.model, status: a.status, detail: a.statusDetail, reduce },
      ...base,
    });
    const task = a.currentTaskId ? taskById.get(a.currentTaskId) : undefined;
    const from = resolveRevision(task?.baseRevision);
    if (from) link(from, id, isAgentBusy(a.status));
  });

  // Column 3 — plan components
  const plan = workspace.plan;
  const building = isBuildInFlight(workspace.buildStatus);
  const componentIds: string[] = [];
  if (plan) {
    const affected = new Set(plan.delta?.affectedComponents ?? []);
    const added = new Set(plan.delta?.addedComponents ?? []);
    plan.components.forEach((c, i) => {
      const id = `c:${c.id}`;
      const isAdded = added.has(c.id);
      const isChanged = affected.has(c.id);
      push({
        id,
        type: "component",
        position: at(3, i),
        data: {
          name: c.name,
          files: c.files,
          changed: isChanged,
          added: isAdded,
          tag: isAdded ? `new in r${plan.revision}` : isChanged ? `changed in r${plan.revision}` : null,
        },
        ...base,
      });
      componentIds.push(id);
      const from = resolveRevision(plan.revision);
      if (from) link(from, id, building);
    });
  }

  // Column 4 — ships, verdicts, failures
  const shipsByRev = new Map<number, RelayEvent>();
  const reviewsByRev = new Map<number, RelayEvent>();
  const failures: RelayEvent[] = [];
  for (const e of events) {
    if (e.type === "build.succeeded") {
      const rev = num(e.payload.revision) ?? e.revision;
      shipsByRev.set(rev, e);
    } else if (e.type === "review.completed") {
      const rev = num(e.payload.revision) ?? e.revision;
      reviewsByRev.set(rev, e);
    } else if (e.type === "build.failed" || e.type === "error") {
      failures.push(e);
    }
  }
  let row = 0;
  const currentRev = workspace.artifact?.revision ?? null;
  const shipRevs = [...shipsByRev.keys()].sort((a, b) => a - b);
  for (const rev of shipRevs) {
    const e = shipsByRev.get(rev)!;
    const url = str(e.payload.previewUrl) ?? (currentRev === rev ? workspace.artifact?.previewUrl ?? "" : "");
    const shipId = `s:${rev}`;
    const current = currentRev === rev;
    push({
      id: shipId,
      type: "ship",
      position: at(4, row++),
      data: { revision: rev, host: hostOf(url), url, current },
      ...base,
    });
    if (current) for (const cid of componentIds) link(cid, shipId);
    const review = reviewsByRev.get(rev);
    if (review) {
      const verdictRaw = str(review.payload.verdict);
      const verdict: VerdictData["verdict"] = verdictRaw === "passed" || verdictRaw === "warnings" || verdictRaw === "failed" ? verdictRaw : "warnings";
      const checks = Array.isArray(review.payload.checks) ? (review.payload.checks as Array<Record<string, unknown>>) : [];
      const ok = checks.filter((c) => c && c.ok === true).length;
      const vid = `v:${rev}`;
      push({
        id: vid,
        type: "verdict",
        position: at(4, row++),
        data: { verdict, ok, total: checks.length, revision: rev },
        ...base,
      });
      link(shipId, vid);
    }
  }
  const recentFailures = failures.slice(-3);
  for (const e of recentFailures) {
    const rev = num(e.payload.revision) ?? e.revision;
    const id = `f:${e.id}`;
    push({
      id,
      type: "failure",
      position: at(4, row++),
      data: {
        title: e.type === "build.failed" ? `Build failed · r${rev}` : `Error · r${rev}`,
        detail: str(e.payload.error) ?? e.message,
      },
      ...base,
    });
    const from = resolveRevision(rev);
    if (from) link(from, id);
  }

  return { nodes, edges };
}

// ── Canvas ───────────────────────────────────────────────────────────────────

function MapCanvas(props: MapViewProps) {
  const reduce = useReducedMotion() ?? false;
  const rf = useReactFlow();
  const { workspace, participants, agents, tasks, events, now } = props;
  const derived = useMemo(
    () => derive({ workspace, participants, agents, tasks, events, now }, reduce),
    [workspace, participants, agents, tasks, events, now, reduce],
  );

  // Local drag positions, keyed by node id. Never persisted.
  const [overrides, setOverrides] = useState<Record<string, { x: number; y: number }>>({});
  const onNodesChange = useCallback((changes: NodeChange<MapNode>[]) => {
    setOverrides((prev) => {
      let next = prev;
      for (const c of changes) {
        if (c.type === "position" && c.position) {
          if (next === prev) next = { ...prev };
          next[c.id] = c.position;
        }
      }
      return next;
    });
  }, []);

  const nodes = useMemo<MapNode[]>(
    () => derived.nodes.map((n) => (overrides[n.id] ? { ...n, position: overrides[n.id] } : n)),
    [derived.nodes, overrides],
  );

  // Fit the view on mount and whenever the node count changes.
  const lastCount = useRef(-1);
  useEffect(() => {
    if (nodes.length === lastCount.current) return;
    lastCount.current = nodes.length;
    const t = window.setTimeout(() => {
      void rf.fitView({ padding: 0.2, duration: reduce ? 0 : 300 });
    }, 80);
    return () => window.clearTimeout(t);
  }, [nodes.length, rf, reduce]);

  const empty = workspace.requirements.length === 0;

  return (
    <div className="relay-map relative h-full w-full">
      <ReactFlow<MapNode>
        nodes={nodes}
        edges={derived.edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        nodesConnectable={false}
        nodesDraggable
        elementsSelectable={false}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        panOnScroll
        zoomOnDoubleClick={false}
        minZoom={0.25}
        maxZoom={1.75}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: "smoothstep", style: { stroke: EDGE_STROKE, strokeWidth: 1.25 } }}
        colorMode="dark"
        className="bg-bg-1"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(255,255,255,0.07)" />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
      {empty ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="text-[12.5px] text-fg-3">The map fills in as humans and agents work</p>
        </div>
      ) : null}
      <style>{`
        .relay-map .react-flow__controls { box-shadow: none; border: 1px solid var(--line-1); border-radius: 8px; overflow: hidden; }
        .relay-map .react-flow__controls button {
          background: var(--bg-2); border-bottom: 1px solid var(--line-0); color: var(--fg-1); width: 24px; height: 24px;
        }
        .relay-map .react-flow__controls button:hover { background: var(--bg-3); color: var(--fg-0); }
        .relay-map .react-flow__controls button:last-child { border-bottom: none; }
        .relay-map .react-flow__controls button svg { fill: currentColor; max-width: 11px; max-height: 11px; }
        .relay-map .react-flow__node { font-family: inherit; }
        .relay-map .react-flow__edge-path { stroke: ${EDGE_STROKE}; }
        .relay-map .react-flow__attribution { display: none; }
        @media (prefers-reduced-motion: reduce) {
          .relay-map .react-flow__edge.animated path { animation: none; }
        }
      `}</style>
    </div>
  );
}

export function MapView(props: MapViewProps) {
  return (
    <ReactFlowProvider>
      <MapCanvas {...props} />
    </ReactFlowProvider>
  );
}
