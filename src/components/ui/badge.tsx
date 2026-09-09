import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const tones: Record<string, string> = {
  ok: "bg-ok/10 text-ok border-ok/20",
  warn: "bg-warn/10 text-warn border-warn/20",
  danger: "bg-danger/10 text-danger border-danger/20",
  info: "bg-info/10 text-info border-info/20",
  muted: "bg-surface-container text-muted border-outline",
};

export function Badge({
  tone = "muted",
  className,
  children,
}: {
  tone?: keyof typeof tones;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide transition-colors duration-200",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function statusTone(status: string): keyof typeof tones {
  const s = status.toLowerCase();
  if (["dispatched", "sent", "verified", "active", "ok"].includes(s)) return "ok";
  if (["ready", "imported", "packing", "queued", "generated", "approved"].includes(s)) return "info";
  if (["pending", "draft", "warn", "suspended", "expired"].includes(s)) return "warn";
  if (["error", "failed", "cancelled", "archived", "revoked"].includes(s)) return "danger";
  return "muted";
}
