"use client";

import type { RelayEvent } from "@/lib/types";
import { Chip } from "@/components/ui/Chip";
import { IconArrowRight } from "@/components/ui/icons";
import { asRequirement, num, str } from "./payload";
import { RowFrame, SystemLine } from "./RowFrame";

export interface RowProps {
  event: RelayEvent;
  now: number;
}

function Body({ text, className }: { text: string; className?: string }) {
  return (
    <p className={["mt-1 whitespace-pre-wrap break-words text-[14px] leading-[20px] text-fg-0", className].filter(Boolean).join(" ")}>
      {text}
    </p>
  );
}

export function HumanMessageRow({ event, now }: RowProps) {
  const text = str(event.payload, "text") ?? event.message;
  return (
    <RowFrame actor={event.actor} createdAt={event.createdAt} now={now} meta={<Chip tone="neutral">Note</Chip>}>
      <Body text={text} className="text-fg-1" />
    </RowFrame>
  );
}

export function RequirementRow({ event, now }: RowProps) {
  const req = asRequirement(event.payload.requirement);
  const revision = num(event.payload, "revision") ?? req?.revision ?? event.revision;
  const previous = num(event.payload, "previousRevision");
  const text = req?.text ?? str(event.payload, "text") ?? event.message;
  return (
    <RowFrame
      actor={event.actor}
      createdAt={event.createdAt}
      now={now}
      meta={
        <Chip tone="accent" title={previous !== null ? `Revision ${previous} to ${revision}` : `Revision ${revision}`}>
          <span className="inline-flex items-center gap-1">
            {revision <= 1 ? "set the brief" : "changed requirements"}
            <IconArrowRight size={12} />
            <span className="font-mono tabular-nums">r{revision}</span>
          </span>
        </Chip>
      }
    >
      <div className="mt-1.5 rounded-md border border-line-1 border-l-2 border-l-accent bg-bg-2/60 px-3 py-2">
        <p className="whitespace-pre-wrap break-words text-[14px] leading-[20px] text-fg-0">{text}</p>
      </div>
    </RowFrame>
  );
}

export function AgentMessageRow({ event, now }: RowProps) {
  const text = str(event.payload, "text") ?? event.message;
  return (
    <RowFrame actor={event.actor} createdAt={event.createdAt} now={now}>
      <Body text={text} className="text-fg-1" />
    </RowFrame>
  );
}

export function SystemRow({ event, now }: RowProps) {
  return (
    <SystemLine createdAt={event.createdAt} now={now}>
      {event.message}
    </SystemLine>
  );
}
