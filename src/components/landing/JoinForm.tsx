"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { readIdentity, saveIdentity } from "./identity";
import { useStoredIdentityName } from "./useIdentity";
import { ArrowRightIcon, Field, FormError, PrimaryButton, Spinner, TextInput } from "./ui";

const ID_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;

/**
 * Accepts a full invite link (`https://host/w/<id>`), a path (`/w/<id>`) or a
 * bare id, and returns the workspace id or null when nothing usable is found.
 */
export function parseWorkspaceRef(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const fromPath = raw.match(/\/w\/([A-Za-z0-9_-]+)/);
  if (fromPath) return fromPath[1];

  // A URL that is not a /w/ link: try the last path segment (e.g. someone pasted a preview URL).
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const last = url.pathname.split("/").filter(Boolean).pop() ?? "";
      return ID_PATTERN.test(last) ? last : null;
    } catch {
      return null;
    }
  }

  return ID_PATTERN.test(raw) ? raw : null;
}

export function JoinForm() {
  const router = useRouter();
  const uid = useId();
  const [ref, setRef] = useState("");
  // null while hydrating (unknown), "" when nothing is stored, otherwise the stored name.
  const storedName = useStoredIdentityName();
  const [typedName, setTypedName] = useState<string | null>(null);
  const yourName = typedName ?? storedName ?? "";
  const hasIdentity: boolean | null = storedName === null ? null : storedName.trim().length > 0;
  const [editingName, setEditingName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ask for a name when none is stored, or when the person says the stored one is not them.
  const needsName = hasIdentity === false || editingName;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const id = parseWorkspaceRef(ref);
    if (!id) return setError("Paste a workspace link or id.");

    const person = yourName.trim();
    if (needsName && !person) return setError("Add your name so the room knows who joined.");

    setError(null);
    setBusy(true);

    // Store identity before navigating so the workspace page can join immediately.
    const existing = readIdentity();
    if (person && (!existing || existing.name !== person)) saveIdentity(person);

    // Verify the workspace exists when the API can answer; only a definite 404 blocks the join.
    try {
      const res = await fetch(`/api/workspaces/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (res.status === 404) {
        setError(`No workspace found for "${id}".`);
        setBusy(false);
        return;
      }
    } catch {
      // Network hiccup: the workspace page has its own reconnect and error handling.
    }

    router.push(`/w/${encodeURIComponent(id)}`);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Field label="Workspace link or id" htmlFor={`${uid}-ref`}>
        <TextInput
          id={`${uid}-ref`}
          name="workspace-ref"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="https://relay.local/w/… or the id"
          autoComplete="off"
          spellCheck={false}
          autoFocus
          disabled={busy}
        />
      </Field>

      {needsName ? (
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
      ) : hasIdentity ? (
        <p className="text-xs text-fg-3">
          Joining as <span className="text-fg-1">{yourName}</span>.{" "}
          <button
            type="button"
            onClick={() => setEditingName(true)}
            className="rounded-sm text-fg-2 underline decoration-line-2 underline-offset-2 transition-colors hover:text-fg-0"
          >
            Not you?
          </button>
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3 pt-1">
        <FormError message={error} />
        <PrimaryButton type="submit" disabled={busy} aria-busy={busy}>
          {busy ? (
            <>
              <Spinner />
              Joining
            </>
          ) : (
            <>
              Join workspace
              <ArrowRightIcon />
            </>
          )}
        </PrimaryButton>
      </div>
    </form>
  );
}
