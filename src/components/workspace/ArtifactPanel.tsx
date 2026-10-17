"use client";

import { useState } from "react";
import type { Workspace } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Chip, type ChipTone } from "@/components/ui/Chip";
import { Tabs } from "@/components/ui/Tabs";
import { Tooltip } from "@/components/ui/Tooltip";
import { IconExternal } from "@/components/ui/icons";
import { buildStatusLabel, executorLabel, isBuildInFlight, shortId } from "@/lib/client/format";
import { FilesView } from "./FilesView";
import { PlanView } from "./PlanView";
import { PreviewFrame } from "./PreviewFrame";
import { RevisionPill } from "./RevisionPill";

export interface ArtifactPanelProps {
  workspace: Workspace;
}

type Tab = "preview" | "files" | "plan";

function buildTone(status: Workspace["buildStatus"]): ChipTone {
  switch (status) {
    case "live":
      return "ok";
    case "failed":
      return "err";
    case "provisioning":
    case "writing":
    case "building":
      return "accent";
    default:
      return "neutral";
  }
}

export function ArtifactPanel({ workspace }: ArtifactPanelProps) {
  const [tab, setTab] = useState<Tab>("preview");
  const artifact = workspace.artifact;
  const inFlight = isBuildInFlight(workspace.buildStatus);
  const targetRevision = workspace.activeRevision ?? workspace.revision;
  const sandboxId = workspace.sandboxId ?? artifact?.sandboxId ?? null;
  const executor = artifact?.executor ?? workspace.executor;

  const tabs = [
    { value: "preview" as const, label: "Preview" },
    { value: "files" as const, label: "Files", count: artifact?.files.length },
    { value: "plan" as const, label: "Plan" },
  ];

  return (
    <section className="flex h-full min-h-0 flex-col bg-bg-1" aria-label="Live artifact">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line-0 px-3">
        <Tabs<Tab> value={tab} onChange={setTab} items={tabs} size="xs" aria-label="Artifact views" />

        <div className="ml-auto flex min-w-0 items-center gap-2">
          <Chip tone={buildTone(workspace.buildStatus)} dot pulse={inFlight} layout title={`Build status: ${buildStatusLabel(workspace.buildStatus)}`}>
            {buildStatusLabel(workspace.buildStatus)}
          </Chip>
          <span className="hidden shrink-0 whitespace-nowrap text-[11.5px] text-fg-2 xl:inline" title={`Executor: ${executorLabel(executor)}`}>
            {executorLabel(executor)}
          </span>
          {sandboxId ? (
            <Tooltip label={sandboxId} side="bottom" align="end">
              <span className="hidden font-mono text-[11px] tabular-nums text-fg-3 2xl:inline">{shortId(sandboxId, 10)}</span>
            </Tooltip>
          ) : null}
          {artifact ? <RevisionPill revision={artifact.revision} size="xs" title={`Artifact revision ${artifact.revision}`} /> : null}
          <Button
            size="xs"
            variant="secondary"
            disabled={!artifact}
            onClick={() => {
              if (artifact) window.open(artifact.previewUrl, "_blank", "noopener,noreferrer");
            }}
            trailing={<IconExternal size={13} />}
            title={artifact ? artifact.previewUrl : "No build yet"}
            aria-label="Open preview in a new tab"
          >
            <span className="hidden xl:inline">Open</span>
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {tab === "preview" ? (
          <PreviewFrame
            artifact={artifact}
            buildStatus={workspace.buildStatus}
            buildError={workspace.buildError}
            targetRevision={targetRevision}
          />
        ) : tab === "files" ? (
          <FilesView artifact={artifact} />
        ) : (
          <PlanView plan={workspace.plan} workspaceRevision={workspace.revision} />
        )}
      </div>
    </section>
  );
}
