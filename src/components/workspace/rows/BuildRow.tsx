"use client";

import type { RelayEvent } from "@/lib/types";
import { Chip } from "@/components/ui/Chip";
import { IconExternal } from "@/components/ui/icons";
import { executorLabel, formatDuration, shortId } from "@/lib/client/format";
import { asExecutor, num, str, strArr } from "./payload";
import { RowFrame } from "./RowFrame";

export function BuildRow({ event, now }: { event: RelayEvent; now: number }) {
  const p = event.payload;
  const revision = num(p, "revision") ?? event.revision;
  const executor = asExecutor(p.executor);
  const sandboxId = str(p, "sandboxId");
  const previewUrl = str(p, "previewUrl");
  const changed = strArr(p, "changedFiles");
  const ms = num(p, "ms");
  const error = str(p, "error");

  if (event.type === "build.started") {
    return (
      <RowFrame
        actor={event.actor}
        createdAt={event.createdAt}
        now={now}
        meta={
          <Chip tone="builder" dot pulse>
            Build started
          </Chip>
        }
      >
        <p className="mt-1 text-[13px] leading-[18px] text-fg-2">
          {event.message || `Deploying r${revision}`}
          {executor ? <span className="text-fg-3"> · {executorLabel(executor)}</span> : null}
        </p>
      </RowFrame>
    );
  }

  if (event.type === "build.failed") {
    return (
      <RowFrame actor={event.actor} createdAt={event.createdAt} now={now} meta={<Chip tone="err">Build failed</Chip>}>
        <div className="mt-1.5 rounded-md border border-err/30 bg-err/5 px-3 py-2">
          <p className="text-[13px] leading-[18px] text-err">{error ?? event.message}</p>
          <p className="mt-1 text-[12px] text-fg-3">The previous artifact stays live until a build succeeds.</p>
        </div>
      </RowFrame>
    );
  }

  return (
    <RowFrame
      actor={event.actor}
      createdAt={event.createdAt}
      now={now}
      meta={
        <>
          <Chip tone="ok" mono>
            <span className="font-sans">Shipped</span>
            <span className="ml-1 tabular-nums">r{revision}</span>
          </Chip>
          {ms !== null ? <span className="font-mono text-[11px] tabular-nums text-fg-3">{formatDuration(ms)}</span> : null}
        </>
      }
    >
      <div className="mt-1.5 rounded-md border border-line-1 bg-bg-2/60 px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-2">
          {previewUrl ? (
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 font-medium text-fg-0 hover:text-accent"
            >
              Open preview
              <IconExternal size={13} />
            </a>
          ) : null}
          {executor ? <span>{executorLabel(executor)}</span> : null}
          {sandboxId ? (
            <span className="font-mono text-[11px] text-fg-3" title={sandboxId}>
              {shortId(sandboxId, 12)}
            </span>
          ) : null}
        </div>
        {changed.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {changed.map((f) => (
              <span key={f} className="rounded-[4px] border border-line-1 bg-bg-1 px-1.5 py-0.5 font-mono text-[11px] text-fg-1">
                {f}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-[12px] text-fg-3">First build · all files new</p>
        )}
      </div>
    </RowFrame>
  );
}
