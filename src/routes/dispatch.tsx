import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import { Guard } from "@/components/guard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge, statusTone } from "@/components/ui/badge";
import { createDispatch, getProject, listDispatches, listProjects, markReady } from "@/lib/server";
import { formatKg } from "@/lib/utils";
import { DispatchSummaryPrint, useCompanyName } from "@/components/print-docs";

export const Route = createFileRoute("/dispatch")({ component: Page });

function Page() {
  return (
    <Guard title="Dispatch" perm="dispatch">
      <Dispatch />
    </Guard>
  );
}

function Dispatch() {
  const qc = useQueryClient();
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const history = useQuery({ queryKey: ["dispatches"], queryFn: () => listDispatches() });
  const first = projects.data?.find((p) => p.boxes > 0)?.id ?? projects.data?.[0]?.id;
  const [projectId, setProjectId] = useState<number | null>(null);
  const selected = projectId ?? first ?? 0;
  const detail = useQuery({
    queryKey: ["project", selected],
    queryFn: () => getProject({ data: selected }),
    enabled: selected > 0,
  });
  const [transporter, setTransporter] = useState("");
  const [lr, setLr] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const company = useCompanyName();

  const boxes = detail.data?.boxes ?? [];
  const available = boxes.filter((b) => b.status !== "dispatched");

  const selectedKg = useMemo(
    () => available.filter((b) => picked.includes(b.id)).reduce((s, b) => s + Number(b.total_weight_kg), 0),
    [available, picked],
  );

  const ready = useMutation({
    mutationFn: () => markReady({ data: selected }),
    onSuccess: async () => {
      toast.success("Boxes marked ready");
      await qc.invalidateQueries({ queryKey: ["project", selected] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ship = useMutation({
    mutationFn: () =>
      createDispatch({
        data: { projectId: selected, transporter, lr_number: lr, boxIds: picked },
      }),
    onSuccess: async () => {
      toast.success("Dispatch created · WhatsApp queued");
      setPicked([]);
      setLr("");
      await qc.invalidateQueries({ queryKey: ["project", selected] });
      await qc.invalidateQueries({ queryKey: ["dispatches"] });
      await qc.invalidateQueries({ queryKey: ["whatsapp"] });
      await qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function toggle(id: number) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div className="space-y-4">
      <style>{`@media print { @page { size: A4 portrait; margin: 8mm; } }`}</style>
      <div className="no-print grid gap-4 lg:grid-cols-3">
        <Card className="space-y-3 lg:col-span-2">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <Label>Project</Label>
              <Select value={String(selected || "")} onChange={(e) => { setProjectId(Number(e.target.value)); setPicked([]); }}>
                {(projects.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button variant="outline" disabled={!selected || ready.isPending} onClick={() => ready.mutate()}>
              Mark ready
            </Button>
            <Button variant="outline" disabled={!boxes.length} onClick={() => window.print()}>
              <Printer className="size-4" />
              Print packing summary
            </Button>
          </div>
          <ul className="divide-y divide-outline">
            {available.map((b) => (
              <li key={b.id} className="flex items-center gap-3 py-2">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={picked.includes(b.id)}
                  onChange={() => toggle(b.id)}
                />
                <span className="flex-1 font-mono text-sm">{b.box_number}</span>
                <span className="font-mono text-xs">{formatKg(Number(b.total_weight_kg))}</span>
                <Badge tone={statusTone(b.status)}>{b.status}</Badge>
              </li>
            ))}
            {!available.length ? <li className="py-6 text-sm text-muted">No boxes waiting.</li> : null}
          </ul>
        </Card>
        <Card className="space-y-3">
          <h3 className="text-sm font-semibold">Create dispatch</h3>
          <div>
            <Label>Transporter</Label>
            <Input value={transporter} onChange={(e) => setTransporter(e.target.value)} placeholder="TCI / VRL / local" />
          </div>
          <div>
            <Label>LR number</Label>
            <Input value={lr} onChange={(e) => setLr(e.target.value)} placeholder="LR-88421" />
          </div>
          <p className="font-mono text-sm">
            {picked.length} box(es) · {formatKg(selectedKg)}
          </p>
          <Button
            className="w-full"
            disabled={!picked.length || !transporter.trim() || !lr.trim() || ship.isPending}
            onClick={() => ship.mutate()}
          >
            Dispatch
          </Button>
        </Card>
      </div>
      <Card className="no-print overflow-x-auto p-0">
        <h3 className="border-b border-outline px-4 py-3 text-sm font-semibold">History</h3>
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-low text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">When</th>
              <th className="px-4 py-2 font-medium">Project</th>
              <th className="px-4 py-2 font-medium">Transporter</th>
              <th className="px-4 py-2 font-medium">LR</th>
              <th className="px-4 py-2 font-medium">Boxes</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {(history.data ?? []).map((d) => (
              <tr key={d.id} className="border-t border-outline">
                <td className="px-4 py-2 font-mono text-xs">{d.dispatched_at?.slice(0, 16) ?? "—"}</td>
                <td className="px-4 py-2 font-mono text-xs">{d.project_code}</td>
                <td className="px-4 py-2">{d.transporter}</td>
                <td className="px-4 py-2 font-mono">{d.lr_number}</td>
                <td className="px-4 py-2 font-mono">{d.box_count}</td>
                <td className="px-4 py-2">
                  <Badge tone={statusTone(d.status)}>{d.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {detail.data?.boxes.length ? (
        <div className="space-y-3">
          <p className="no-print text-sm font-semibold">Packing summary</p>
          <DispatchSummaryPrint
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
