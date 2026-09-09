import { cn } from "@/lib/utils";

export function ProcessBox({
  pct,
  disabled,
  onCycle,
}: {
  pct: number;
  disabled?: boolean;
  onCycle: () => void;
}) {
  const tone =
    pct >= 100
      ? "border-ok/35 text-ok"
      : pct > 0
        ? "border-warn/40 text-warn"
        : "border-outline text-muted";
  const fill = pct >= 100 ? "bg-ok/45" : pct > 0 ? "bg-warn/45" : "bg-surface-container";
  const track = pct >= 100 ? "bg-ok/10" : pct > 0 ? "bg-warn/10" : "bg-surface-container";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onCycle}
      className={cn(
        "relative mx-auto block h-8 w-[3.85rem] overflow-hidden rounded-md border",
        tone,
        track,
      )}
    >
      <span className={cn("absolute inset-y-0 left-0", fill)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      <span className="relative z-10 grid h-full place-items-center font-mono text-[11px] font-semibold tabular-nums leading-none">
        {pct}%
      </span>
    </button>
  );
}
