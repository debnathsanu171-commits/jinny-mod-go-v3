import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  bar,
  barClass,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  bar?: number;
  barClass?: string;
}) {
  return (
    <Card className={cn("relative overflow-hidden", bar != null && "pb-5")}>
      <div className="mb-2 flex items-start justify-between">
        <span className="text-sm text-muted">{label}</span>
        <Icon className="size-5 text-muted/50" />
      </div>
      <p className="font-mono text-2xl font-semibold tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      {bar != null ? (
        <div className="absolute bottom-0 left-0 h-1 w-full bg-surface-container">
          <div className={cn("h-full transition-all duration-700 ease-out animate-bar-grow", barClass ?? "bg-info")} style={{ width: `${Math.min(100, Math.max(0, bar))}%` }} />
        </div>
      ) : null}
    </Card>
  );
}
