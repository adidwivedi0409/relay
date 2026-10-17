"use client";

import type { RelayEvent } from "@/lib/types";
import { IconAlert, IconArrowRight } from "@/components/ui/icons";
import { num, strArr } from "./payload";
import { Timestamp } from "./RowFrame";

export function CascadeRow({ event, now }: { event: RelayEvent; now: number }) {
  const from = num(event.payload, "fromRevision");
  const to = num(event.payload, "toRevision") ?? event.revision;
  const stale = strArr(event.payload, "staleTasks");
  const staleCount = stale.length || num(event.payload, "staleCount") || 0;

  return (
    <div className="flex gap-3">
      <div className="flex w-6 shrink-0 justify-center pt-2 text-warn">
        <IconAlert size={16} />
      </div>
      <div className="min-w-0 flex-1 rounded-md border border-warn/35 bg-warn/[0.07] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 font-mono text-[12px] font-medium tabular-nums text-warn">
            {from !== null ? `r${from}` : "r?"}
            <IconArrowRight size={12} />
            r{to}
          </span>
          <span className="min-w-0 truncate text-[13px] font-medium text-fg-0">Requirements changed mid-build</span>
          <Timestamp createdAt={event.createdAt} now={now} className="ml-auto" />
        </div>
        <p className="mt-1 text-[12.5px] leading-[18px] text-fg-1">{event.message}</p>
        {staleCount > 0 ? (
          <p className="mt-1 text-[12px] text-fg-2">
            {staleCount} task{staleCount === 1 ? "" : "s"} will be re-planned against r{to}
            {stale.length > 0 ? <span className="text-fg-3"> · {stale.join(", ")}</span> : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}
