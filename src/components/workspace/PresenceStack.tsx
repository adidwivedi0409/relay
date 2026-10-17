"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";
import type { Participant } from "@/lib/types";
import { PRESENCE_TTL_MS } from "@/lib/types";
import { Tooltip } from "@/components/ui/Tooltip";
import { HumanAvatar } from "./Avatar";
import { formatRelative } from "@/lib/client/format";

export interface PresenceStackProps {
  participants: Participant[];
  now: number;
  selfId?: string | null;
  max?: number;
  size?: number;
}

export function isOnline(p: Participant, now: number): boolean {
  return now - p.lastSeen < PRESENCE_TTL_MS;
}

export function PresenceStack({ participants, now, selfId = null, max = 5, size = 24 }: PresenceStackProps) {
  const reduce = useReducedMotion();
  const ordered = useMemo(() => {
    const online = participants.filter((p) => isOnline(p, now));
    const offline = participants.filter((p) => !isOnline(p, now));
    const byJoin = (a: Participant, b: Participant) => a.joinedAt - b.joinedAt;
    return [...online.sort(byJoin), ...offline.sort(byJoin)];
  }, [participants, now]);

  const visible = ordered.slice(0, max);
  const overflow = ordered.length - visible.length;
  const onlineCount = ordered.filter((p) => isOnline(p, now)).length;

  return (
    <div className="flex items-center" aria-label={`${onlineCount} online of ${participants.length} participants`}>
      <div className="flex items-center" style={{ paddingLeft: 6 }}>
        <AnimatePresence initial={false} mode="popLayout">
          {visible.map((p) => {
            const online = isOnline(p, now);
            const label = `${p.name}${p.id === selfId ? " (you)" : ""} · ${online ? "online" : `last seen ${formatRelative(p.lastSeen, now)}`}`;
            return (
              <motion.div
                key={p.id}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, scale: 0.6, y: 4 }}
                animate={{ opacity: online ? 1 : 0.45, scale: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6, y: -4 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="relative"
                style={{ marginLeft: -6 }}
              >
                <Tooltip label={label} side="bottom">
                  <HumanAvatar name={p.name} color={p.color} size={size} online={online} ring />
                </Tooltip>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {overflow > 0 ? (
          <span
            className="relative inline-flex items-center justify-center rounded-full border border-line-1 bg-bg-2 text-[10px] font-medium tabular-nums text-fg-2 ring-2 ring-bg-1"
            style={{ width: size, height: size, marginLeft: -6 }}
            title={ordered
              .slice(max)
              .map((p) => p.name)
              .join(", ")}
          >
            +{overflow}
          </span>
        ) : null}
      </div>
    </div>
  );
}
