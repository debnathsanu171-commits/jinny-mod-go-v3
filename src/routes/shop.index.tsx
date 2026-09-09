import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Guard } from "@/components/guard";
import { Card } from "@/components/ui/card";
import { Badge, statusTone } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { listProjects, setProjectStage, setProjectStatus } from "@/lib/server";
import { JOB_STATUSES, SHOP_STAGES, type JobStatus, type ShopStageKey, type ShopStageValue } from "@/lib/platform";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/shop/")({ component: Page });

function Page() {
  return (
    <Guard title="Floor SHOP" perm="projects">
      <ShopFloor />
    </Guard>
  );
}

function ShopFloor() {
  const qc = useQueryClient();
  const [station, setStation] = useState<ShopStageKey | null>(null);
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const stageMut = useMutation({
    mutationFn: (d: { id: number; stage: ShopStageKey; value: ShopStageValue }) => setProjectStage({ data: d }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const statusMut = useMutation({
    mutationFn: (d: { id: number; status: JobStatus }) => setProjectStatus({ data: d }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const onProcess = (projects.data ?? []).filter((p) => p.status === "packing");
  const rows = station ? onProcess.filter((p) => stageOf(p, station) === "running" || stageOf(p, station) === "pending") : onProcess;

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col gap-4">
      <p className="text-sm text-muted">Tap a station cube. On process jobs list below.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {SHOP_STAGES.map((s) => {
          const running = onProcess.filter((p) => stageOf(p, s.key) === "running").length;
          const waiting = onProcess.filter((p) => stageOf(p, s.key) === "pending").length;
          const on = station === s.key;
          const body = (
            <>
              <img
                src={`/stations/${s.key}.jpg`}
                alt={s.label}
                className="h-[5.75rem] w-full rounded-md object-contain bg-white"
              />
              <p className="mt-2 px-0.5 text-[10px] font-bold leading-tight tracking-wide text-foreground">
                {s.label}
              </p>
              <p className="mt-2 font-mono text-3xl font-semibold tabular-nums leading-none">{running}</p>
              <p className="mt-1 text-[11px] text-muted">{waiting} waiting</p>
            </>
          );
          const box = cn(
            "flex min-h-[188px] flex-col items-center rounded-lg border-2 p-2.5 text-center shadow-card",
            on ? "border-primary bg-surface-low" : "border-outline bg-paper hover:border-info",
          );
          if (s.key === "bom") {
            return (
              <Link key={s.key} to="/shop/bom" className={box}>
                {body}
              </Link>
            );
          }
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setStation((v) => (v === s.key ? null : s.key))}
              className={box}
            >
              {body}
            </button>
          );
        })}
      </div>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
        <h3 className="border-b border-outline px-4 py-3 text-sm font-semibold">
          On process projects
          {station ? (
            <span className="ml-2 font-normal text-muted">
              · {SHOP_STAGES.find((s) => s.key === station)?.label}
            </span>
          ) : null}
        </h3>
        <div className="flex-1 overflow-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="sticky top-0 border-b border-outline bg-surface-low text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="whitespace-nowrap px-3 py-3 font-medium">Order no.</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">Client name</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">Product name</th>
                {SHOP_STAGES.map((s) => (
                  <th key={s.key} className="whitespace-nowrap px-2 py-3 text-center font-medium normal-case">
                    {s.label}
                  </th>
                ))}
                <th className="whitespace-nowrap px-3 py-3 text-center font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const stages: Record<ShopStageKey, string> = {
                  bom: p.stage_bom,
                  pasting: p.stage_pasting,
                  cutting: p.stage_cutting,
                  edgeband: p.stage_edgeband,
                  cnc: p.stage_cnc,
                  qc: p.stage_qc,
                };
                const overall = Math.round(
                  SHOP_STAGES.reduce((sum, s) => sum + stagePct(stages[s.key]), 0) / SHOP_STAGES.length,
                );
                return (
                  <tr key={p.id} className="border-b border-outline last:border-0 hover:bg-surface-low/60">
                    <td className="whitespace-nowrap px-3 py-3">
                      <p className="font-mono text-xs font-semibold">{p.po_number?.trim() || p.code}</p>
                      <Link
                        to="/projects/$id"
                        params={{ id: String(p.id) }}
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-1.5")}
                      >
                        Open project
                      </Link>
                    </td>
                    <td className="px-3 py-3">{p.client_name ?? "—"}</td>
                    <td className="px-3 py-3">{p.name}</td>
                    {SHOP_STAGES.map((s) => (
                      <td key={s.key} className="px-1.5 py-2.5 text-center">
                        <ProcessBox
                          pct={stagePct(stages[s.key])}
                          disabled={stageMut.isPending}
                          onCycle={() =>
                            stageMut.mutate({ id: p.id, stage: s.key, value: nextStage(stages[s.key]) })
                          }
                        />
                      </td>
                    ))}
                    <td className="px-2 py-2.5 text-center">
                      <div className="inline-flex flex-col items-center gap-1">
                        <ProcessBox
                          pct={overall}
                          disabled={statusMut.isPending}
                          onCycle={() => statusMut.mutate({ id: p.id, status: nextJobStatus(p.status) })}
                        />
                        <button
                          type="button"
                          disabled={statusMut.isPending}
                          onClick={() => statusMut.mutate({ id: p.id, status: nextJobStatus(p.status) })}
                          className="rounded-full"
                        >
                          <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">No on process projects.</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function stageOf(
  p: {
    stage_bom: string;
    stage_pasting: string;
    stage_cutting: string;
    stage_edgeband: string;
    stage_cnc: string;
    stage_qc: string;
  },
  key: ShopStageKey,
): string {
  if (key === "bom") return p.stage_bom;
  if (key === "pasting") return p.stage_pasting;
  if (key === "cutting") return p.stage_cutting;
  if (key === "edgeband") return p.stage_edgeband;
  if (key === "cnc") return p.stage_cnc;
  return p.stage_qc;
}

function nextStage(v: string): ShopStageValue {
  if (v === "pending") return "running";
  if (v === "running") return "done";
  return "pending";
}

function nextJobStatus(v: string): JobStatus {
  const i = JOB_STATUSES.indexOf(v as JobStatus);
  return JOB_STATUSES[i < 0 ? 0 : (i + 1) % JOB_STATUSES.length];
}

function stagePct(v: string): number {
  if (v === "done") return 100;
  if (v === "running") return 50;
  return 0;
}

function ProcessBox({
  pct,
  disabled,
  onCycle,
}: {
  pct: number;
  disabled: boolean;
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
      className={cn("relative mx-auto block h-8 w-[3.85rem] overflow-hidden rounded-md border", tone, track)}
    >
      <span className={cn("absolute inset-y-0 left-0", fill)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      <span className="relative z-10 grid h-full place-items-center font-mono text-[11px] font-semibold tabular-nums leading-none">
        {pct}%
      </span>
    </button>
  );
}
