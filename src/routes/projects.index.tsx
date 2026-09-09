import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Guard } from "@/components/guard";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge, statusTone } from "@/components/ui/badge";
import { listClients, listProjects, nextOrderNo, saveClient, saveProject, setProjectStage, setProjectStatus } from "@/lib/server";
import { JOB_BINS, JOB_STATUSES, SHOP_STAGES, jobBinId, type JobBinId, type JobStatus, type ShopStageKey, type ShopStageValue } from "@/lib/platform";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/projects/")({ component: Page });

function Page() {
  return (
    <Guard title="Projects" perm="projects">
      <Projects />
    </Guard>
  );
}

function Projects() {
  const qc = useQueryClient();
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const clients = useQuery({ queryKey: ["clients"], queryFn: () => listClients() });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [po, setPo] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [receiveDate, setReceiveDate] = useState("");
  const [expectDate, setExpectDate] = useState("");
  const [bin, setBin] = useState<JobBinId>("new");

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

  const genPo = useMutation({
    mutationFn: () => nextOrderNo(),
    onSuccess: (r) => setPo(r.orderNo),
    onError: (e: Error) => toast.error(e.message),
  });

  const create = useMutation({
    mutationFn: async () => {
      const typed = clientName.trim();
      let client_id: number | undefined;
      if (typed) {
        const match = (clients.data ?? []).find((c) => c.name.toLowerCase() === typed.toLowerCase());
        if (match) client_id = match.id;
        else {
          const saved = await saveClient({
            data: { name: typed, phone: phone.trim() || undefined, delivery_address: address.trim() || undefined },
          });
          client_id = saved.id;
        }
      }
      return saveProject({
        data: {
          name,
          client_id,
          po_number: po || undefined,
          address: address || undefined,
          city_state: city || undefined,
          client_phone: phone || undefined,
          order_receive_date: receiveDate || undefined,
          expected_dispatch_date: expectDate || undefined,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Project created");
      setOpen(false);
      setName("");
      setClientName("");
      setPo("");
      setAddress("");
      setCity("");
      setPhone("");
      setReceiveDate("");
      setExpectDate("");
      await qc.invalidateQueries({ queryKey: ["projects"] });
      await qc.invalidateQueries({ queryKey: ["clients"] });
      await qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Order board — client, product, and shop stages.</p>
        <Button onClick={() => setOpen((v) => !v)}>
          <Plus className="size-4" />
          New project
        </Button>
      </div>

      {open ? (
        <Card className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold leading-none">New project</h3>
            <p className="mt-1 text-xs text-muted">Sticker heading fields print on labels.</p>
          </div>
          <div className="grid grid-cols-1 gap-x-3 gap-y-2 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label htmlFor="pname" className="mb-0.5 text-xs text-muted">
                Product name
              </Label>
              <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Product name" />
            </div>
            <div>
              <Label htmlFor="cname" className="mb-0.5 text-xs text-muted">
                Client name
              </Label>
              <Input
                id="cname"
                name="jmg-client-name"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Type client name"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            <div>
              <Label htmlFor="po" className="mb-0.5 text-xs text-muted">
                Order no / PO
              </Label>
              <div className="flex gap-2">
                <Input
                  id="po"
                  value={po}
                  onChange={(e) => setPo(e.target.value.toUpperCase())}
                  placeholder="JMD-09-26-001"
                  className="flex-1"
                />
                <Button variant="outline" className="shrink-0" disabled={genPo.isPending} onClick={() => genPo.mutate()}>
                  {genPo.isPending ? "…" : "Auto generate"}
                </Button>
              </div>
            </div>
            <div>
              <Label htmlFor="phone" className="mb-0.5 text-xs text-muted">
                Client mobile
              </Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" />
            </div>
            <div>
              <Label htmlFor="city" className="mb-0.5 text-xs text-muted">
                City / State
              </Label>
              <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Jaipur, Rajasthan" />
            </div>
            <div>
              <Label htmlFor="recv" className="mb-0.5 text-xs text-muted">
                Order receive date
              </Label>
              <Input id="recv" type="date" value={receiveDate} onChange={(e) => setReceiveDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="expd" className="mb-0.5 text-xs text-muted">
                Expected dispatch date
              </Label>
              <Input id="expd" type="date" value={expectDate} onChange={(e) => setExpectDate(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="addr" className="mb-0.5 text-xs text-muted">
                Address
              </Label>
              <Input id="addr" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Site / delivery address" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
              Create
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {JOB_BINS.map((b) => {
          const count = (projects.data ?? []).filter((p) => jobBinId(p.status) === b.id).length;
          const on = bin === b.id;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setBin(b.id)}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold uppercase tracking-wide",
                on ? "border-primary bg-primary text-on-primary" : "border-outline bg-paper text-muted hover:bg-surface-low",
              )}
            >
              {b.label}
              <span
                className={cn(
                  "grid min-w-5 place-items-center rounded-full px-1 font-mono text-[10px] tabular-nums",
                  on ? "bg-on-primary/15" : "bg-surface-container",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b border-outline bg-surface-low text-xs uppercase tracking-wide text-muted">
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
            {(projects.data ?? [])
              .filter((p) => jobBinId(p.status) === bin)
              .map((p) => {
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
        {(projects.data ?? []).filter((p) => jobBinId(p.status) === bin).length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">No projects in {JOB_BINS.find((b) => b.id === bin)?.label}.</p>
        ) : null}
      </Card>
    </div>
  );
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
