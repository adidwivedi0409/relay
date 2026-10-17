// ─────────────────────────────────────────────────────────────────────────────
// Executor facade (CONTRACT.md § src/lib/executor). Picks Freestyle when
// FREESTYLE_API_KEY is configured, otherwise the clearly-labelled local
// fallback. Never silently downgrades: a Freestyle failure is thrown to the
// caller with the failing stage in the message.
// ─────────────────────────────────────────────────────────────────────────────

import type { ArtifactFile, BuildStatus, ExecutorKind } from "@/lib/types";
import { deployFreestyle, freestyleApiKey, verifyFreestyle } from "./freestyle";
import { deployLocal, getLocalArtifactFile } from "./local";

export interface DeployResult {
  previewUrl: string;
  sandboxId: string | null;
  executor: ExecutorKind;
  httpStatus: number | null;
  logs: string[];
}

export type DeployProgress = (status: BuildStatus, detail: string) => void;

/** Optional hints the orchestrator can pass so a workspace's VM is reused across server restarts. */
export interface DeployExisting {
  sandboxId: string | null;
}

export const executor = {
  kind(): ExecutorKind {
    return freestyleApiKey() ? "freestyle" : "local";
  },

  async deploy(
    wsId: string,
    files: ArtifactFile[],
    revision: number,
    onProgress: DeployProgress,
    existing?: DeployExisting,
  ): Promise<DeployResult> {
    const progress: DeployProgress = (status, detail) => {
      try {
        onProgress(status, detail);
      } catch {
        // A faulty progress listener must never abort a deploy.
      }
    };
    if (executor.kind() === "freestyle") {
      return deployFreestyle(wsId, files, revision, progress, existing);
    }
    return deployLocal(wsId, files, revision, progress);
  },

  /** Local executor only: read a file from the latest revision of a workspace's artifact. */
  async getArtifactFile(
    wsId: string,
    path: string,
  ): Promise<{ content: string | Uint8Array; contentType: string } | null> {
    return getLocalArtifactFile(wsId, path);
  },
};

export { verifyFreestyle };
export type { FreestyleVmRecord } from "./freestyle";
