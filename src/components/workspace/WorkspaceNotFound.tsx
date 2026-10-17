"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { IconArrowRight } from "@/components/ui/icons";
import { EASE_OUT } from "./motion";

export function WorkspaceNotFound({ id }: { id: string }) {
  const reduce = useReducedMotion();
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-bg-0 text-fg-0">
      <div className="flex h-12 shrink-0 items-center border-b border-line-0 bg-bg-1 px-3.5">
        <Link href="/" className="text-[14px] font-semibold tracking-tight text-fg-0">
          Relay
        </Link>
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: EASE_OUT }}
          className="w-full max-w-[420px] rounded-xl border border-line-1 bg-bg-1 p-6 text-center"
          style={{ boxShadow: "var(--shadow-2)" }}
        >
          <div className="mx-auto mb-4 flex h-9 w-9 items-center justify-center rounded-lg border border-dashed border-line-2 text-fg-3">
            <span className="block h-1.5 w-1.5 rounded-full bg-fg-3" />
          </div>
          <h1 className="text-[16px] font-semibold tracking-tight">Workspace not found</h1>
          <p className="mt-1.5 text-[13px] leading-[19px] text-fg-2">
            There is no workspace with the id <span className="font-mono text-fg-1">{id}</span>. The link may be wrong, or the
            workspace may have been created on a different server.
          </p>
          <div className="mt-5 flex items-center justify-center gap-2">
            <Link href="/">
              <Button variant="primary" size="md" trailing={<IconArrowRight size={14} />}>
                Create a workspace
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
