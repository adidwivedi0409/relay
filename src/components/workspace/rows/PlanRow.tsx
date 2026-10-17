"use client";

import { useState } from "react";
import type { RelayEvent } from "@/lib/types";
import { Chip } from "@/components/ui/Chip";
import { IconChevronRight, IconLayers } from "@/components/ui/icons";
import { asPlan } from "./payload";
import { RowFrame } from "./RowFrame";

export function PlanRow({ event, now }: { event: RelayEvent; now: number }) {
  const plan = asPlan(event.payload.plan);
  const revised = event.type === "plan.revised";
  const [open, setOpen] = useState(false);

  if (!plan) {
    return (
      <RowFrame actor={event.actor} createdAt={event.createdAt} now={now} meta={<Chip tone="architect">{revised ? "Plan revised" : "Plan"}</Chip>}>
        <p className="mt-1 text-[14px] leading-[20px] text-fg-1">{event.message}</p>
      </RowFrame>
    );
  }

  const delta = plan.delta;
  const affected = new Set(delta?.affectedComponents ?? []);
  const added = new Set(delta?.addedComponents ?? []);
  const removed = delta?.removedComponents ?? [];

  return (
    <RowFrame
      actor={event.actor}
      createdAt={event.createdAt}
      now={now}
      meta={
        <Chip tone="architect" mono>
          <span className="font-sans">{revised ? "Plan revised" : "Plan"}</span>
          <span className="ml-1 tabular-nums">r{plan.revision}</span>
        </Chip>
      }
    >
      <div className="mt-1.5 overflow-hidden rounded-lg border border-line-1 bg-bg-2/70" style={{ boxShadow: "var(--shadow-1)" }}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-bg-3/60"
        >
          <IconLayers size={16} className="mt-0.5 shrink-0 text-architect" />
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] leading-[20px] text-fg-0">{plan.summary || event.message}</span>
            <span className="mt-0.5 block text-[12px] text-fg-2">
              {plan.components.length} component{plan.components.length === 1 ? "" : "s"}
              {plan.audience ? <> · for {plan.audience}</> : null}
              {delta ? (
                <>
                  {" "}
                  · <span className="text-warn">{affected.size} affected</span>
                  {added.size ? <>, <span className="text-ok">{added.size} added</span></> : null}
                  {removed.length ? <>, <span className="text-err">{removed.length} removed</span></> : null}
                </>
              ) : null}
            </span>
          </span>
          <IconChevronRight size={14} className={["mt-1 shrink-0 text-fg-3 transition-transform duration-150", open ? "rotate-90" : ""].join(" ")} />
        </button>

        {open ? (
          <div className="border-t border-line-0 px-3 py-2.5">
            {delta?.rationale ? (
              <p className="mb-2.5 rounded-md border border-warn/20 bg-warn/5 px-2.5 py-2 text-[12.5px] leading-[18px] text-fg-1">
                <span className="font-medium text-warn">Why it changed · </span>
                {delta.rationale}
              </p>
            ) : null}
            <ul className="flex flex-col gap-1.5">
              {plan.components.map((c) => {
                const isAffected = affected.has(c.id);
                const isAdded = added.has(c.id);
                return (
                  <li
                    key={c.id}
                    className={[
                      "rounded-md border px-2.5 py-2",
                      isAdded ? "border-ok/30 bg-ok/5" : isAffected ? "border-warn/30 bg-warn/5" : "border-line-0 bg-bg-1/60",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-fg-0">{c.name}</span>
                      <span className="font-mono text-[11px] text-fg-3">{c.id}</span>
                      {isAdded ? <Chip tone="ok">added</Chip> : isAffected ? <Chip tone="warn">affected</Chip> : null}
                      {c.files.length ? (
                        <span className="ml-auto truncate font-mono text-[11px] text-fg-3" title={c.files.join(", ")}>
                          {c.files.join(" · ")}
                        </span>
                      ) : null}
                    </div>
                    {c.description ? <p className="mt-0.5 text-[12.5px] leading-[18px] text-fg-2">{c.description}</p> : null}
                  </li>
                );
              })}
              {removed.map((id) => (
                <li key={`removed-${id}`} className="rounded-md border border-err/25 bg-err/5 px-2.5 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12px] text-fg-2 line-through">{id}</span>
                    <Chip tone="err">removed</Chip>
                  </div>
                </li>
              ))}
            </ul>
            {plan.design.palette || plan.design.typography || plan.design.tone ? (
              <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
                {plan.design.palette ? (
                  <>
                    <dt className="text-fg-3">Palette</dt>
                    <dd className="text-fg-1">{plan.design.palette}</dd>
                  </>
                ) : null}
                {plan.design.typography ? (
                  <>
                    <dt className="text-fg-3">Type</dt>
                    <dd className="text-fg-1">{plan.design.typography}</dd>
                  </>
                ) : null}
                {plan.design.tone ? (
                  <>
                    <dt className="text-fg-3">Tone</dt>
                    <dd className="text-fg-1">{plan.design.tone}</dd>
                  </>
                ) : null}
              </dl>
            ) : null}
          </div>
        ) : null}
      </div>
    </RowFrame>
  );
}
