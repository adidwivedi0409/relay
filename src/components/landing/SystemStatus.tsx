"use client";

import { useEffect, useState } from "react";
import type { ExecutorKind } from "@/lib/types";

/** Shape of GET /api/health per CONTRACT.md. Validated at runtime; the route may be a stub. */
interface Health {
  ok: boolean;
  provider: { provider: string; model: string; configured: boolean };
  executor: ExecutorKind;
  freestyle: boolean;
}

function isHealth(value: unknown): value is Health {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<Health>;
  const p = v.provider as Partial<Health["provider"]> | undefined;
  return (
    !!p &&
    typeof p === "object" &&
    typeof p.provider === "string" &&
    typeof p.model === "string" &&
    typeof p.configured === "boolean" &&
    (v.executor === "freestyle" || v.executor === "local")
  );
}

type Tone = "ok" | "warn" | "muted";

interface StatusItem {
  label: string;
  value: string;
  tone: Tone;
}

type State = { kind: "loading" } | { kind: "unavailable" } | { kind: "ready"; items: StatusItem[] };

function toItems(h: Health): StatusItem[] {
  const inference: StatusItem = h.provider.configured
    ? { label: "inference", value: `${h.provider.provider} / ${h.provider.model}`, tone: "ok" }
    : { label: "inference", value: "not configured", tone: "warn" };

  const execution: StatusItem =
    h.executor === "freestyle"
      ? {
          label: "execution",
          // A key is present but the auth check failed: say so instead of claiming green.
          value: h.freestyle ? "Freestyle VM" : "Freestyle VM (unverified)",
          tone: h.freestyle ? "ok" : "warn",
        }
      : { label: "execution", value: "local fallback", tone: "warn" };

  return [inference, execution];
}

const dotTone: Record<Tone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  muted: "bg-fg-3",
};

function Dot({ tone }: { tone: Tone }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${dotTone[tone]}`}
      style={tone === "ok" ? { boxShadow: "0 0 0 3px color-mix(in srgb, var(--ok) 18%, transparent)" } : undefined}
    />
  );
}

/**
 * Honest system status line. Fetches /api/health once on mount and renders
 * exactly what the server reports: provider and model when inference is
 * configured, the real executor otherwise. Failure to reach the route is
 * reported as "status unavailable", never guessed.
 */
export function SystemStatus({ className = "" }: { className?: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store", signal: controller.signal });
        if (!res.ok) {
          setState({ kind: "unavailable" });
          return;
        }
        const body: unknown = await res.json();
        setState(isHealth(body) ? { kind: "ready", items: toItems(body) } : { kind: "unavailable" });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState({ kind: "unavailable" });
      }
    })();
    return () => controller.abort();
  }, []);

  const base = `mono flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11.5px] tracking-wide ${className}`;

  if (state.kind === "loading") {
    return (
      <div className={base} aria-live="polite" aria-busy="true">
        <span className="inline-flex items-center gap-2 text-fg-3">
          <Dot tone="muted" />
          checking system status
        </span>
      </div>
    );
  }

  if (state.kind === "unavailable") {
    return (
      <div className={base} aria-live="polite">
        <span className="inline-flex items-center gap-2 text-fg-3">
          <Dot tone="muted" />
          status unavailable
        </span>
      </div>
    );
  }

  return (
    <div className={base} aria-live="polite">
      {state.items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-2 text-fg-2">
          <Dot tone={item.tone} />
          <span>
            {item.label}
            <span className="text-fg-3"> · </span>
            <span className={item.tone === "ok" ? "text-fg-1" : "text-warn"}>{item.value}</span>
          </span>
        </span>
      ))}
    </div>
  );
}
