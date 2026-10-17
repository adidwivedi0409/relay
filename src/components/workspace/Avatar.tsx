import type { Actor, AgentRole } from "@/lib/types";
import { AGENT_COLORS } from "@/lib/types";
import { initials, roleGlyph } from "@/lib/client/format";

export interface HumanAvatarProps {
  name: string;
  color: string;
  size?: number;
  /** Shows the presence ring + pulse. */
  online?: boolean;
  /** Ring color behind the avatar (match the surface it sits on). */
  ring?: boolean;
  className?: string;
}

export function HumanAvatar({ name, color, size = 24, online = false, ring = false, className }: HumanAvatarProps) {
  const fontSize = Math.max(9, Math.round(size * 0.42));
  return (
    <span
      className={[
        "relative inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold leading-none text-bg-0",
        ring ? "ring-2 ring-bg-1" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ width: size, height: size, background: color, fontSize, letterSpacing: "-0.01em" }}
      title={name}
    >
      {initials(name)}
      {online ? (
        <span
          aria-hidden="true"
          className="pulse absolute -bottom-px -right-px block rounded-full border-2 border-bg-1 bg-ok"
          style={{ width: 9, height: 9, color: "var(--ok)" }}
        />
      ) : null}
    </span>
  );
}

export interface AgentGlyphProps {
  role: AgentRole;
  size?: number;
  className?: string;
  title?: string;
}

/** Square role glyph: amber A, sage B, violet R. */
export function AgentGlyph({ role, size = 24, className, title }: AgentGlyphProps) {
  const color = AGENT_COLORS[role];
  const fontSize = Math.max(9, Math.round(size * 0.46));
  return (
    <span
      className={["inline-flex shrink-0 select-none items-center justify-center rounded-[6px] font-semibold leading-none", className]
        .filter(Boolean)
        .join(" ")}
      style={{
        width: size,
        height: size,
        fontSize,
        color,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 35%, transparent)`,
      }}
      title={title ?? role}
    >
      {roleGlyph(role)}
    </span>
  );
}

export function SystemGlyph({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={["inline-flex shrink-0 items-center justify-center rounded-full border border-line-1 bg-bg-2 text-fg-3", className]
        .filter(Boolean)
        .join(" ")}
      style={{ width: size, height: size }}
    >
      <span className="block h-1.5 w-1.5 rounded-full bg-fg-3" />
    </span>
  );
}

/** Picks the right avatar for an event actor. */
export function ActorAvatar({ actor, size = 24, fallbackColor }: { actor: Actor; size?: number; fallbackColor?: string }) {
  if (actor.kind === "agent" && actor.role) return <AgentGlyph role={actor.role} size={size} title={actor.name} />;
  if (actor.kind === "human") return <HumanAvatar name={actor.name} color={actor.color ?? fallbackColor ?? "#9CC2E5"} size={size} />;
  return <SystemGlyph size={size} />;
}
