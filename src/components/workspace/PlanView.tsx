"use client";

import type { Plan } from "@/lib/types";
import { Chip } from "@/components/ui/Chip";
import { IconArrowRight, IconLayers } from "@/components/ui/icons";

export interface PlanViewProps {
  plan: Plan | null;
  workspaceRevision: number;
}

export function PlanView({ plan, workspaceRevision }: PlanViewProps) {
  if (!plan) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-[360px] text-center">
          <IconLayers size={18} className="mx-auto mb-2 text-fg-3" />
          <p className="text-[13px] text-fg-2">No plan yet. The Architect drafts one from the first requirement.</p>
        </div>
      </div>
    );
  }

  const delta = plan.delta;
  const affected = new Set(delta?.affectedComponents ?? []);
  const added = new Set(delta?.addedComponents ?? []);
  const removed = delta?.removedComponents ?? [];
  const behind = plan.revision < workspaceRevision;

  return (
    <div className="h-full overflow-y-auto px-4 py-4">
      <div className="mx-auto max-w-[720px]">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-semibold text-fg-0">Plan</h3>
          <span className="font-mono text-[12px] tabular-nums text-fg-2">r{plan.revision}</span>
          {behind ? (
            <Chip tone="warn" title={`Workspace is at r${workspaceRevision}; the Architect has not re-planned yet.`}>
              behind r{workspaceRevision}
            </Chip>
          ) : null}
        </div>
        <p className="mt-1.5 text-[14px] leading-[21px] text-fg-0">{plan.summary}</p>
        {plan.audience ? (
          <p className="mt-1 text-[12.5px] text-fg-2">
            <span className="text-fg-3">Audience · </span>
            {plan.audience}
          </p>
        ) : null}

        {delta ? (
          <section className="mt-4 rounded-lg border border-warn/25 bg-warn/[0.05] px-3.5 py-3">
            <div className="flex items-center gap-2 text-[12px]">
              <span className="inline-flex items-center gap-1 font-mono font-medium tabular-nums text-warn">
                r{delta.fromRevision}
                <IconArrowRight size={12} />
                r{delta.toRevision}
              </span>
              <span className="font-medium text-fg-0">What changed</span>
              <span className="ml-auto text-fg-3">
                {affected.size} affected · {added.size} added · {removed.length} removed
              </span>
            </div>
            {delta.rationale ? <p className="mt-1.5 text-[13px] leading-[19px] text-fg-1">{delta.rationale}</p> : null}
          </section>
        ) : null}

        <section className="mt-4">
          <h4 className="text-[11px] font-medium uppercase tracking-[0.06em] text-fg-3">
            Components <span className="font-mono tabular-nums">{plan.components.length}</span>
          </h4>
          <ul className="mt-2 flex flex-col gap-1.5">
            {plan.components.map((c) => {
              const isAffected = affected.has(c.id);
              const isAdded = added.has(c.id);
              return (
                <li
                  key={c.id}
                  className={[
                    "rounded-lg border px-3 py-2.5",
                    isAdded ? "border-ok/30 bg-ok/[0.05]" : isAffected ? "border-warn/30 bg-warn/[0.05]" : "border-line-0 bg-bg-2/60",
                  ].join(" ")}
                  style={{ boxShadow: "var(--shadow-1)" }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-fg-0">{c.name}</span>
                    <span className="font-mono text-[11px] text-fg-3">{c.id}</span>
                    {isAdded ? <Chip tone="ok">added</Chip> : isAffected ? <Chip tone="warn">affected</Chip> : null}
                  </div>
                  {c.description ? <p className="mt-1 text-[12.5px] leading-[18px] text-fg-2">{c.description}</p> : null}
                  {c.files.length ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {c.files.map((f) => (
                        <span key={f} className="rounded-[4px] border border-line-1 bg-bg-1 px-1.5 py-0.5 font-mono text-[11px] text-fg-2">
                          {f}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
            {removed.map((id) => (
              <li key={`removed-${id}`} className="rounded-lg border border-err/25 bg-err/[0.05] px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[12px] text-fg-2 line-through">{id}</span>
                  <Chip tone="err">removed</Chip>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {plan.design.palette || plan.design.typography || plan.design.tone ? (
          <section className="mt-4">
            <h4 className="text-[11px] font-medium uppercase tracking-[0.06em] text-fg-3">Design tokens</h4>
            <dl className="mt-2 grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5 rounded-lg border border-line-0 bg-bg-2/60 px-3 py-2.5 text-[12.5px]">
              {plan.design.palette ? (
                <>
                  <dt className="text-fg-3">Palette</dt>
                  <dd className="text-fg-1">{plan.design.palette}</dd>
                </>
              ) : null}
              {plan.design.typography ? (
                <>
                  <dt className="text-fg-3">Typography</dt>
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
          </section>
        ) : null}
      </div>
    </div>
  );
}
