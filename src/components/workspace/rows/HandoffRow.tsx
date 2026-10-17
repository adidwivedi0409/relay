"use client";

import { useState } from "react";
import type { AgentRole, RelayEvent } from "@/lib/types";
import { AGENT_COLORS, AGENT_NAMES } from "@/lib/types";
import { IconArrowRight, IconChevronRight } from "@/components/ui/icons";
import { AgentGlyph } from "../Avatar";
import { str, strArr } from "./payload";
import { Timestamp } from "./RowFrame";

const ROLES: AgentRole[] = ["architect", "builder", "reviewer"];

function asRole(v: string | null, fallback: AgentRole | undefined): AgentRole | null {
  if (v && (ROLES as string[]).includes(v)) return v as AgentRole;
  return fallback ?? null;
}

export function HandoffRow({ event, now }: { event: RelayEvent; now: number }) {
  const [open, setOpen] = useState(false);
  const from = asRole(str(event.payload, "from"), event.actor.role);
  const to = asRole(str(event.payload, "to"), undefined);
  const summary = str(event.payload, "summary") ?? event.message;
  const items = strArr(event.payload, "items");

  return (
    <div className="flex gap-3">
      <div className="flex w-6 shrink-0 justify-center pt-1 text-fg-3">
        <span className="block h-1 w-1 rounded-full bg-fg-3/70" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 items-center gap-1.5 rounded-md border border-line-1 bg-bg-2 px-1.5 text-[12px] font-medium">
            {from ? (
              <>
                <AgentGlyph role={from} size={16} />
                <span style={{ color: AGENT_COLORS[from] }}>{AGENT_NAMES[from]}</span>
              </>
            ) : (
              <span className="text-fg-2">{event.actor.name}</span>
            )}
            <IconArrowRight size={12} className="text-fg-3" />
            {to ? (
              <>
                <AgentGlyph role={to} size={16} />
                <span style={{ color: AGENT_COLORS[to] }}>{AGENT_NAMES[to]}</span>
              </>
            ) : (
              <span className="text-fg-2">team</span>
            )}
          </span>
          <span className="text-[11px] uppercase tracking-[0.06em] text-fg-3">handoff</span>
          <Timestamp createdAt={event.createdAt} now={now} className="ml-auto" />
        </div>
        <p className="mt-1.5 text-[13px] leading-[19px] text-fg-1">{summary}</p>
        {items.length > 0 ? (
          <div className="mt-1.5">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="inline-flex items-center gap-1 text-[12px] text-fg-2 hover:text-fg-0"
            >
              <IconChevronRight size={12} className={["transition-transform duration-150", open ? "rotate-90" : ""].join(" ")} />
              {items.length} item{items.length === 1 ? "" : "s"}
            </button>
            {open ? (
              <ul className="mt-1.5 flex flex-col gap-1 border-l border-line-1 pl-3">
                {items.map((item, i) => (
                  <li key={`${i}-${item}`} className="text-[13px] leading-[18px] text-fg-1">
                    {item}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
