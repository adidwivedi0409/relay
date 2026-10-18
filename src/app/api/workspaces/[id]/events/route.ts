import { z } from "zod";
import type { NextRequest } from "next/server";
import { participantsFrame, store } from "@/lib/store";
import type { SseFrame } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PING_MS = 15_000;
const SinceParam = z.coerce.number().int().min(0);

const encoder = new TextEncoder();

function encodeFrame(frame: SseFrame): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(frame)}\n\n`);
}

/**
 * GET /api/workspaces/[id]/events  — Server-Sent Events.
 *
 * On connect: a {kind:"snapshot"} frame, or, with `?since=<seq>`, every event
 * after that seq as individual event frames followed by workspace, agent, task
 * and participants frames (so a resuming client re-syncs mutable state without
 * replaying the whole log). Then live frames from the store, a ping every 15s,
 * and cleanup on client abort.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!store.getWorkspace(id)) {
    return Response.json({ error: "Workspace not found" }, { status: 404 });
  }

  const sinceRaw = request.nextUrl.searchParams.get("since");
  let since: number | undefined;
  if (sinceRaw !== null && sinceRaw !== "") {
    const parsed = SinceParam.safeParse(sinceRaw);
    if (!parsed.success) {
      return Response.json({ error: "Invalid `since`: expected a non-negative integer sequence number" }, { status: 400 });
    }
    since = parsed.data;
  }

  let closed = false;
  let unsubscribe: (() => void) | null = null;
  let ping: ReturnType<typeof setInterval> | null = null;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;

  const close = () => {
    if (closed) return;
    closed = true;
    if (ping) clearInterval(ping);
    ping = null;
    unsubscribe?.();
    unsubscribe = null;
    request.signal.removeEventListener("abort", close);
    try {
      controllerRef?.close();
    } catch {
      // Stream already closed by the consumer; nothing left to release.
    }
  };

  const send = (frame: SseFrame) => {
    if (closed || !controllerRef) return;
    try {
      controllerRef.enqueue(encodeFrame(frame));
    } catch {
      // Enqueue after the consumer went away: tear everything down.
      close();
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      if (request.signal.aborted) {
        close();
        return;
      }
      // A leading comment line makes proxies flush headers immediately and
      // tells EventSource how fast to retry after a drop.
      controller.enqueue(encoder.encode(`retry: 1500\n: connected ${id}\n\n`));
      // PADDING: some proxies (Cloudflare tunnels, corporate gateways) hold small responses back;
      // a 4 KB comment pushes the first bytes through so the snapshot is not buffered.
      controller.enqueue(encoder.encode(`: ${" ".repeat(4096)}\n\n`));

      if (since === undefined) {
        send({ kind: "snapshot", snapshot: store.snapshot(id) });
      } else {
        for (const event of store.getEvents(id, since)) send({ kind: "event", event });
        const workspace = store.getWorkspace(id);
        if (workspace) send({ kind: "workspace", workspace });
        for (const agent of store.getAgents(id)) send({ kind: "agent", agent });
        for (const task of store.getTasks(id)) send({ kind: "task", task });
        send(participantsFrame(id));
      }

      // Subscribe synchronously after the initial frames so no event can slip
      // between the snapshot and the live feed.
      unsubscribe = store.subscribe(id, send);
      ping = setInterval(() => send({ kind: "ping", now: Date.now() }), PING_MS);
      ping.unref?.();
      request.signal.addEventListener("abort", close, { once: true });
    },
    cancel() {
      close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
