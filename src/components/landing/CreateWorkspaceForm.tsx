"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Participant, Workspace } from "@/lib/types";
import { saveIdentity } from "./identity";
import { useStoredIdentityName } from "./useIdentity";
import { ArrowRightIcon, Field, FormError, PrimaryButton, Spinner, TextInput } from "./ui";

interface CreateResponse {
  workspace: Workspace;
  participant: Participant;
}

function isCreateResponse(value: unknown): value is CreateResponse {
  if (!value || typeof value !== "object") return false;
  const ws = (value as { workspace?: unknown }).workspace;
  return !!ws && typeof ws === "object" && typeof (ws as { id?: unknown }).id === "string";
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object") {
      const err = (body as { error?: unknown }).error;
      if (typeof err === "string" && err.trim()) return err;
      if (err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string") {
        return (err as { message: string }).message;
      }
    }
  } catch {
    // Non-JSON error body; fall through to the status line.
  }
  return `HTTP ${res.status}`;
}

export function CreateWorkspaceForm() {
  const router = useRouter();
  const uid = useId();
  const [workspaceName, setWorkspaceName] = useState("");
  // Prefilled from the stored identity so returning humans keep their name; typing overrides it.
  const storedName = useStoredIdentityName();
  const [typedName, setTypedName] = useState<string | null>(null);
  const yourName = typedName ?? storedName ?? "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const name = workspaceName.trim();
    const person = yourName.trim();
    if (!name) return setError("Give the workspace a name.");
    if (!person) return setError("Tell your collaborators who you are.");

    setError(null);
    setBusy(true);
    const identity = saveIdentity(person);

    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, participant: { id: identity.id, name: identity.name } }),
      });
      if (!res.ok) {
        setError(`Could not create workspace · ${await readErrorMessage(res)}`);
        setBusy(false);
        return;
      }
      const body: unknown = await res.json();
      if (!isCreateResponse(body)) {
        setError("Could not create workspace · unexpected response from server");
        setBusy(false);
        return;
      }
      router.push(`/w/${encodeURIComponent(body.workspace.id)}`);
      // Keep `busy` set while the navigation completes so the button cannot double-submit.
    } catch (err) {
      setError(`Could not reach the server · ${err instanceof Error ? err.message : "network error"}`);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Field label="Workspace name" htmlFor={`${uid}-workspace`}>
        <TextInput
          id={`${uid}-workspace`}
          name="workspace"
          value={workspaceName}
          onChange={(e) => setWorkspaceName(e.target.value)}
          placeholder="Berkeley sublease marketplace"
          autoComplete="off"
          autoFocus
          maxLength={80}
          disabled={busy}
        />
      </Field>
      <Field label="Your name" htmlFor={`${uid}-name`} hint="Shown to everyone in the room">
        <TextInput
          id={`${uid}-name`}
          name="name"
          value={yourName}
          onChange={(e) => setTypedName(e.target.value)}
          placeholder="Ada"
          autoComplete="name"
          maxLength={40}
          disabled={busy}
        />
      </Field>

      <div className="flex items-center justify-between gap-3 pt-1">
        <FormError message={error} />
        <PrimaryButton type="submit" disabled={busy} aria-busy={busy}>
          {busy ? (
            <>
              <Spinner />
              Creating
            </>
          ) : (
            <>
              Create workspace
              <ArrowRightIcon />
            </>
          )}
        </PrimaryButton>
      </div>
    </form>
  );
}
