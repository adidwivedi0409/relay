"use client";

import { useWorkspace } from "@/hooks/useWorkspace";
import { ConnectingState } from "./ConnectingState";
import { NameModal } from "./NameModal";
import { WorkspaceNotFound } from "./WorkspaceNotFound";
import { WorkspaceShell } from "./WorkspaceShell";

export function WorkspaceApp({ id }: { id: string }) {
  const ws = useWorkspace(id);

  if (ws.phase === "not-found") return <WorkspaceNotFound id={id} />;

  return (
    <>
      <NameModal open={ws.needsIdentity} workspaceName={ws.snapshot?.workspace.name ?? null} onSubmit={ws.setName} />
      {ws.snapshot ? (
        <WorkspaceShell
          snapshot={ws.snapshot}
          connected={ws.connected}
          now={ws.now}
          selfId={ws.identity?.id ?? null}
          onSend={ws.send}
          sending={ws.sending}
        />
      ) : (
        <ConnectingState phase={ws.phase} error={ws.lastError} onRetry={ws.retry} />
      )}
    </>
  );
}
