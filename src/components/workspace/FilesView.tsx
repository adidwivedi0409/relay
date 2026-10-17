"use client";

import { useMemo, useState } from "react";
import type { Artifact } from "@/lib/types";
import { Chip } from "@/components/ui/Chip";
import { IconFile } from "@/components/ui/icons";

export interface FilesViewProps {
  artifact: Artifact | null;
}

function languageOf(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "html":
      return "HTML";
    case "css":
      return "CSS";
    case "js":
    case "mjs":
      return "JavaScript";
    case "ts":
      return "TypeScript";
    case "json":
      return "JSON";
    case "svg":
      return "SVG";
    case "md":
      return "Markdown";
    default:
      return ext.toUpperCase() || "Text";
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

export function FilesView({ artifact }: FilesViewProps) {
  const files = useMemo(() => artifact?.files ?? [], [artifact]);
  const changed = useMemo(() => new Set(artifact?.changedFiles ?? []), [artifact]);
  const [picked, setPicked] = useState<string | null>(null);

  // Derived selection: the explicit pick while it still exists, else the first
  // changed file, else the first file.
  const selected = useMemo(() => {
    if (files.length === 0) return null;
    if (picked && files.some((f) => f.path === picked)) return picked;
    return (files.find((f) => changed.has(f.path)) ?? files[0]).path;
  }, [files, changed, picked]);

  const current = files.find((f) => f.path === selected) ?? null;
  const lines = useMemo(() => (current ? current.content.split("\n") : []), [current]);
  const gutterWidth = Math.max(2, String(lines.length).length);

  if (!artifact || files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-[360px] text-center">
          <IconFile size={18} className="mx-auto mb-2 text-fg-3" />
          <p className="text-[13px] text-fg-2">No files yet. The Builder writes index.html, styles.css and app.js on the first successful build.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <nav className="w-[188px] shrink-0 overflow-y-auto border-r border-line-0 bg-bg-1 py-2" aria-label="Artifact files">
        <div className="flex items-center justify-between px-3 pb-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-fg-3">
            r{artifact.revision} · {files.length} file{files.length === 1 ? "" : "s"}
          </span>
        </div>
        <ul className="flex flex-col gap-px px-1.5">
          {files.map((f) => {
            const active = f.path === selected;
            const isChanged = changed.has(f.path);
            return (
              <li key={f.path}>
                <button
                  type="button"
                  onClick={() => setPicked(f.path)}
                  aria-current={active ? "true" : undefined}
                  className={[
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-[12px] transition-colors duration-100",
                    active ? "bg-bg-3 text-fg-0" : "text-fg-1 hover:bg-bg-2 hover:text-fg-0",
                  ].join(" ")}
                  title={f.path}
                >
                  <span className={["block h-1.5 w-1.5 shrink-0 rounded-full", isChanged ? "bg-accent" : "bg-fg-3/40"].join(" ")} />
                  <span className="min-w-0 flex-1 truncate">{f.path}</span>
                  {isChanged ? <Chip tone="accent">changed</Chip> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {current ? (
          <>
            <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line-0 bg-bg-1 px-3">
              <span className="truncate font-mono text-[12px] text-fg-0">{current.path}</span>
              <span className="text-[11px] text-fg-3">{languageOf(current.path)}</span>
              <span className="ml-auto font-mono text-[11px] tabular-nums text-fg-3">
                {lines.length} lines · {formatBytes(new TextEncoder().encode(current.content).length)}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-bg-0">
              <pre className="min-w-max px-0 py-2 font-mono text-[12px] leading-[18px] text-fg-1">
                {lines.map((line, i) => (
                  <div key={i} className="flex hover:bg-bg-1">
                    <span
                      className="sticky left-0 shrink-0 select-none bg-bg-0 pl-3 pr-3 text-right tabular-nums text-fg-3/70"
                      style={{ minWidth: `${gutterWidth + 2}ch` }}
                    >
                      {i + 1}
                    </span>
                    <span className="whitespace-pre pr-6">{line.length ? line : " "}</span>
                  </div>
                ))}
              </pre>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
