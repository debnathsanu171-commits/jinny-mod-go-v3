import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import { Guard } from "@/components/guard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge, statusTone } from "@/components/ui/badge";
import { getProject, listProjects, runPacking, verifyBox } from "@/lib/server";
import { formatKg } from "@/lib/utils";
import { MAX_BOX_KG, PREFERRED_KG, SOFT_MAX_KG } from "@/lib/packing";
import { BoxLayers3D } from "@/components/box-layers-3d";
import { PackingListPrint, useCompanyName } from "@/components/print-docs";

export const Route = createFileRoute("/packing")({ component: Page });

function Page() {
  return (
    <Guard title="Packing" perm="packing">
      <Packing />
    </Guard>
  );
}

function Packing() {
  const qc = useQueryClient();
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const first = projects.data?.find((p) => p.parts > 0)?.id ?? projects.data?.[0]?.id;
  const [projectId, setProjectId] = useState<number | null>(null);
  const selected = projectId ?? first ?? 0;
  const detail = useQuery({
    queryKey: ["project", selected],
    queryFn: () => getProject({ data: selected }),
    enabled: selected > 0,
  });

  const pack = useMutation({
    mutationFn: () => runPacking({ data: selected }),
    onSuccess: async (r) => {
      toast.success(`${r.boxes} boxes packed`);
      await qc.invalidateQueries({ queryKey: ["project"] });
      await qc.invalidateQueries({ queryKey: ["projects"] });
      await qc.invalidateQueries({ queryKey: ["boxes"] });
      await qc.invalidateQueries({ queryKey: ["dashboard"] });
      await detail.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const verify = useMutation({
    mutationFn: (d: { boxId: number; verified: boolean }) => verifyBox({ data: d }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["project", selected] });
      await qc.invalidateQueries({ queryKey: ["boxes"] });
    },
  });

  const company = useCompanyName();
  const boxes = detail.data?.boxes ?? [];
  const parts = detail.data?.parts ?? [];
  const byBox = useMemo(() => {
    const m = new Map<number, typeof parts>();
    for (const p of parts) {
      if (!p.box_id) continue;
      const arr = m.get(p.box_id) ?? [];
      arr.push(p);
      m.set(p.box_id, arr);
    }
    return m;
  }, [parts]);

  return (
    <div className="space-y-4">
      <style>{`@media print { @page { size: A4 portrait; margin: 8mm; } }`}</style>
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-56">
          <p className="mb-1 text-xs text-muted">
            Unit isolation · similar-size stack · thin back {'<'} 12 mm · preferred {PREFERRED_KG} kg · leftover {SOFT_MAX_KG} kg · max {MAX_BOX_KG} kg
          </p>
          <Select value={String(selected || "")} onChange={(e) => setProjectId(Number(e.target.value))}>
            {(projects.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex gap-2">
          <Link to="/uploads">
            <Button variant="outline">CSV</Button>
          </Link>
          <Button variant="outline" disabled={!boxes.length} onClick={() => window.print()}>
            <Printer className="size-4" />
            Print packing list
          </Button>
          <Button disabled={!selected || pack.isPending} onClick={() => pack.mutate()}>
            {pack.isPending ? "Packing…" : "Run packing"}
          </Button>
        </div>
      </div>

      {!boxes.length ? (
        <Card>
          <p className="text-sm text-muted">No boxes yet. Import a cut-list, then run packing.</p>
        </Card>
      ) : (
        <div className="no-print grid gap-4 md:grid-cols-2">
          {boxes.map((b) => {
            const kg = Number(b.total_weight_kg);
            const heavy = kg > MAX_BOX_KG;
            const overPref = kg > PREFERRED_KG;
            const items = byBox.get(b.id) ?? [];
            return (
              <Card key={b.id} className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-sm font-semibold">{b.box_number}</p>
                    <p className="text-xs text-muted">{b.unit}</p>
                  </div>
                  <Badge tone={statusTone(b.status)}>{b.status}</Badge>
                </div>
                <div>
                  <div className="mb-1 flex justify-between font-mono text-xs">
                    <span>{formatKg(kg)}</span>
                    <span className="text-muted">{PREFERRED_KG} kg preferred · {MAX_BOX_KG} kg max</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-container">
                    <div
                      className={`h-full ${heavy ? "bg-danger" : overPref ? "bg-warn" : "bg-ok"}`}
                      style={{ width: `${Math.min(100, (kg / MAX_BOX_KG) * 100)}%` }}
                    />
                  </div>
                </div>
                <BoxLayers3D items={items} />
                <ul className="divide-y divide-outline text-sm">
                  {items.map((p) => {
                    const L = Math.round(Number(p.length_mm));
                    const W = Math.round(Number(p.width_mm));
                    const T = Number(p.thickness_mm);
                    return (
                      <li key={p.id} className="flex items-start justify-between gap-2 py-1.5 first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <p>
                            {p.part_name} <span className="text-muted">×{p.qty}</span>
                          </p>
                          <p className="font-mono text-xs text-muted">
                            {L} × {W} × {T} mm
                            {p.material ? ` · ${p.material}` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 font-mono text-xs">{Number(p.weight_kg).toFixed(2)} kg</span>
                      </li>
                    );
                  })}
                </ul>
                <Button
                  size="sm"
                  variant={b.verified ? "outline" : "default"}
                  onClick={() => verify.mutate({ boxId: b.id, verified: !b.verified })}
                >
                  {b.verified ? "Verified" : "Mark verified"}
                </Button>
              </Card>
            );
          })}
        </div>
      )}
      {detail.data?.boxes.length ? (
        <div className="space-y-3">
          <p className="no-print text-sm font-semibold">Packing list — A4 · one job heading · box-wise details</p>
          <PackingListPrint
            project={detail.data.project}
            boxes={detail.data.boxes}
            parts={detail.data.parts}
            company={company}
          />
        </div>
      ) : null}
    </div>
  );
}
