"use client";

import QRCode from "qrcode";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { IconAlert, IconCheck, IconCopy, IconSpinner } from "@/components/ui/icons";

export interface QrCodeProps {
  value: string;
  size?: number;
  className?: string;
}

/** Renders `value` as a QR code on a raised hairline card. */
export function QrCode({ value, size = 160, className }: QrCodeProps) {
  // Result is keyed by (value, size) so a stale render never shows the wrong code
  // and the effect never needs to reset state synchronously.
  const key = `${size}:${value}`;
  const [result, setResult] = useState<{ key: string; src: string | null; error: string | null } | null>(null);

  useEffect(() => {
    if (!value) return;
    let cancelled = false;
    QRCode.toDataURL(value, {
      margin: 1,
      width: size,
      color: { dark: "#f3f1ec", light: "#00000000" },
    })
      .then((url) => {
        if (!cancelled) setResult({ key, src: url, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setResult({ key, src: null, error: err instanceof Error ? err.message : "Could not render QR code" });
      });
    return () => {
      cancelled = true;
    };
  }, [value, size, key]);

  const current = result && result.key === key ? result : null;
  const src = current?.src ?? null;
  const error = !value ? "Nothing to encode" : (current?.error ?? null);

  return (
    <div
      className={[
        "inline-flex shrink-0 items-center justify-center rounded-[10px] border border-line-1 bg-bg-2 p-3",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ width: size + 24, height: size + 24, boxShadow: "var(--shadow-1)" }}
      role="img"
      aria-label={error ? `QR code unavailable: ${error}` : src ? `QR code for ${value}` : "Rendering QR code"}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} width={size} height={size} alt="" className="block select-none" draggable={false} />
      ) : error ? (
        <span className="flex max-w-full flex-col items-center gap-1.5 px-2 text-center text-[11.5px] leading-[15px] text-err">
          <IconAlert size={16} />
          <span className="line-clamp-3">{error}</span>
        </span>
      ) : (
        <IconSpinner size={18} className="text-fg-3" />
      )}
    </div>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export interface QrPopoverProps {
  open: boolean;
  onClose: () => void;
  /** The element the popover hangs below; clicks on it do not count as "outside". */
  anchorRef: RefObject<HTMLElement | null>;
  title: string;
  /** URL to encode and copy. `null` while it is still being resolved. */
  url: string | null;
  hint?: string;
  /** Externally driven copied flash (e.g. when the trigger itself copied). */
  copied?: boolean;
  onCopied?: () => void;
}

/**
 * Small anchored popover with a QR code, the URL in mono and a Copy button.
 * Rendered through a portal with fixed positioning so it never gets clipped
 * by an overflow-hidden panel. Closes on Escape and on click outside.
 */
export function QrPopover({ open, onClose, anchorRef, title, url, hint, copied: copiedProp, onCopied }: QrPopoverProps) {
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [copiedLocal, setCopiedLocal] = useState(false);
  const timer = useRef<number | null>(null);
  // Portals cannot render on the server; this flips to true only on the client.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const place = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const right = Math.max(8, window.innerWidth - r.right);
    setPos({ top: r.bottom + 6, right });
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (panelRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, onClose, anchorRef]);

  const onCopy = useCallback(async () => {
    if (!url) return;
    const ok = await copyText(url);
    if (!ok) return;
    setCopiedLocal(true);
    onCopied?.();
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopiedLocal(false), 1400);
  }, [url, onCopied]);

  const copied = copiedLocal || Boolean(copiedProp);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && pos ? (
        <motion.div
          key="qr-popover"
          ref={panelRef}
          role="dialog"
          aria-label={title}
          initial={reduce ? false : { opacity: 0, y: -4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.98 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          style={{ position: "fixed", top: pos.top, right: pos.right, boxShadow: "var(--shadow-pop)" }}
          className="z-[60] w-[248px] origin-top-right rounded-lg border border-line-1 bg-bg-1 p-3"
        >
          <div className="text-[12.5px] font-semibold text-fg-0">{title}</div>
          <div className="mt-2.5 flex justify-center">
            {url ? (
              <QrCode value={url} size={160} />
            ) : (
              <div
                className="inline-flex items-center justify-center rounded-[10px] border border-line-1 bg-bg-2"
                style={{ width: 184, height: 184 }}
                aria-label="Resolving link"
              >
                <IconSpinner size={18} className="text-fg-3" />
              </div>
            )}
          </div>
          <div
            className="mt-2.5 truncate rounded-md border border-line-0 bg-bg-2 px-2 py-1.5 font-mono text-[11px] text-fg-1"
            title={url ?? undefined}
          >
            {url ?? "Resolving link..."}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={onCopy}
              disabled={!url}
              aria-live="polite"
              leading={copied ? <IconCheck size={14} className="text-ok" /> : <IconCopy size={14} className="text-fg-2" />}
              className="min-w-[96px]"
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
          {hint ? <p className="mt-2 text-[11.5px] leading-[15px] text-fg-3">{hint}</p> : null}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
