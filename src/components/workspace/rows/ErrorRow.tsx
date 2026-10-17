"use client";

import type { RelayEvent } from "@/lib/types";
import { IconAlert } from "@/components/ui/icons";
import { str } from "./payload";
import { Timestamp } from "./RowFrame";

export function ErrorRow({ event, now }: { event: RelayEvent; now: number }) {
  const detail = str(event.payload, "error") ?? str(event.payload, "detail") ?? str(event.payload, "message");
  const stage = str(event.payload, "stage");
  return (
    <div className="flex gap-3">
      <div className="flex w-6 shrink-0 justify-center pt-2 text-err">
        <IconAlert size={16} />
      </div>
      <div className="min-w-0 flex-1 rounded-md border border-err/35 bg-err/[0.06] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-err">{event.actor.kind === "agent" ? event.actor.name : "Error"}</span>
          {stage ? <span className="font-mono text-[11px] text-fg-3">{stage}</span> : null}
          <Timestamp createdAt={event.createdAt} now={now} className="ml-auto" />
        </div>
        <p className="mt-0.5 text-[13px] leading-[18px] text-fg-0">{event.message}</p>
        {detail && !event.message.includes(detail) ? (
          <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap break-words rounded-[4px] bg-bg-0/60 px-2 py-1.5 font-mono text-[11.5px] leading-[16px] text-fg-1">
            {detail}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
