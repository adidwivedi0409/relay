"use client";

import { useState } from "react";
import type { RelayEvent } from "@/lib/types";
import { Chip, type ChipTone } from "@/components/ui/Chip";
import { IconCheck, IconChevronRight, IconX } from "@/components/ui/icons";
import { asChecks, str, strArr } from "./payload";
import { RowFrame } from "./RowFrame";

type Verdict = "passed" | "warnings" | "failed";

function asVerdict(v: string | null): Verdict {
  return v === "passed" || v === "warnings" || v === "failed" ? v : "warnings";
}

const tone: Record<Verdict, ChipTone> = { passed: "ok", warnings: "warn", failed: "err" };
const label: Record<Verdict, string> = { passed: "Passed", warnings: "Passed with warnings", failed: "Failed" };

export function ReviewRow({ event, now }: { event: RelayEvent; now: number }) {
  const verdict = asVerdict(str(event.payload, "verdict"));
  const checks = asChecks(event.payload.checks);
  const notes = str(event.payload, "notes");
  const blocking = strArr(event.payload, "blocking");
  const failedChecks = checks.filter((c) => !c.ok).length;
  const [open, setOpen] = useState(verdict !== "passed");

  return (
    <RowFrame
      actor={event.actor}
      createdAt={event.createdAt}
      now={now}
      meta={
        <>
          <Chip tone={tone[verdict]}>{label[verdict]}</Chip>
          {checks.length > 0 ? (
            <span className="font-mono text-[11px] tabular-nums text-fg-3">
              {checks.length - failedChecks}/{checks.length} checks
            </span>
          ) : null}
        </>
      }
    >
      {notes ? <p className="mt-1 text-[14px] leading-[20px] text-fg-1">{notes}</p> : null}

      {blocking.length > 0 ? (
        <ul className="mt-1.5 flex flex-col gap-1 rounded-md border border-err/30 bg-err/5 px-3 py-2">
          {blocking.map((b, i) => (
            <li key={`${i}-${b}`} className="flex items-start gap-2 text-[13px] leading-[18px] text-err">
              <IconX size={14} className="mt-0.5 shrink-0" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {checks.length > 0 ? (
        <div className="mt-1.5">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 text-[12px] text-fg-2 hover:text-fg-0"
          >
            <IconChevronRight size={12} className={["transition-transform duration-150", open ? "rotate-90" : ""].join(" ")} />
            {open ? "Hide checks" : "Show checks"}
          </button>
          {open ? (
            <ul className="mt-1.5 overflow-hidden rounded-md border border-line-1 bg-bg-2/60">
              {checks.map((c, i) => (
                <li
                  key={`${i}-${c.name}`}
                  className={["flex items-start gap-2.5 px-3 py-1.5 text-[12.5px] leading-[18px]", i > 0 ? "border-t border-line-0" : ""].join(" ")}
                >
                  <span
                    className={[
                      "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                      c.ok ? "bg-ok/15 text-ok" : "bg-err/15 text-err",
                    ].join(" ")}
                  >
                    {c.ok ? <IconCheck size={11} strokeWidth={2} /> : <IconX size={11} strokeWidth={2} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={c.ok ? "text-fg-1" : "text-fg-0"}>{c.name}</span>
                    {c.detail ? <span className="text-fg-3"> · {c.detail}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </RowFrame>
  );
}
