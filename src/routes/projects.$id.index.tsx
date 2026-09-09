import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Guard } from "@/components/guard";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge, statusTone } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getProject, listSubProjects, runPacking, saveClient, saveProject, saveSubProject, setLamMode, setSubProjectStatus } from "@/lib/server";
import { formatKg } from "@/lib/utils";
import type { LamMode } from "@/lib/weight";
import { jobStatusPct, nextJobStatus } from "@/lib/platform";
import { ProcessBox } from "@/components/process-box";

export const Route = createFileRoute("/projects/$id/")({ component: Page });

function Page() {
  const { id } = Route.useParams();
  return (
    <Guard title="Project" perm="projects">
      <Detail id={Number(id)} />
    </Guard>
  );
}

function Detail({ id }: { id: number }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["project", id], queryFn: () => getProject({ data: id }) });
  const pack = useMutation({
    mutationFn: () => runPacking({ data: id }),
    onSuccess: async (r) => {
      toast.success(`${r.boxes} boxes packed`);
      await qc.invalidateQueries({ queryKey: ["project"] });
      await qc.invalidateQueries({ queryKey: ["dashboard"] });
      await qc.invalidateQueries({ queryKey: ["boxes"] });
      await q.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const lam = useMutation({
    mutationFn: (mode: LamMode) => setLamMode({ data: { projectId: id, lam_mode: mode } }),
    onSuccess: async (r) => {
      toast.success(r.recalculated ? `Weights recalculated for ${r.recalculated} parts` : "Mode saved");
      await qc.invalidateQueries({ queryKey: ["project", id] });
      await qc.invalidateQueries({ queryKey: ["boxes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isPending) return <div className="h-40 animate-pulse rounded-lg bg-surface-container" />;
  if (q.error || !q.data) return <p className="text-sm text-danger">Project not found</p>;
  const { project, parts, boxes } = q.data;
  const totalKg = parts.reduce((s, p) => s + Number(p.weight_kg), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted">{project.code}</p>
          <h2 className="text-xl font-semibold">{project.name}</h2>
          <p className="text-sm text-muted">{project.client_name ?? "No client"} · PO {project.po_number ?? "—"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={statusTone(project.status)}>{project.status}</Badge>
          <Select
            value={project.lam_mode}
            disabled={lam.isPending}
            onChange={(e) => lam.mutate(e.target.value as LamMode)}
            className="w-56"
          >
            <option value="prelam">Prelam catalog</option>
            <option value="favicol">Favicol paste</option>
          </Select>
          <Link to="/uploads">
            <Button variant="outline">Import CSV</Button>
          </Link>
          <Button disabled={!parts.length || pack.isPending} onClick={() => pack.mutate()}>
            {pack.isPending ? "Packing…" : "Run packing"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-muted">Parts</p>
          <p className="font-mono text-2xl">{parts.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Cut-list weight</p>
          <p className="font-mono text-2xl">{formatKg(totalKg)}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Boxes</p>
          <p className="font-mono text-2xl">{boxes.length}</p>
        </Card>
      </div>

      <ClientDetails project={project} id={id} />
      <SubProjects projectId={id} />

      <Card className="overflow-x-auto p-0">
        <h3 className="border-b border-outline px-4 py-3 text-sm font-semibold">Cut list</h3>
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-low text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Unit</th>
              <th className="px-4 py-2 font-medium">Part</th>
              <th className="px-4 py-2 font-medium">L×W×T</th>
              <th className="px-4 py-2 font-medium">Mat</th>
              <th className="px-4 py-2 font-medium">Qty</th>
              <th className="px-4 py-2 font-medium">Kg</th>
              <th className="px-4 py-2 font-medium">SKU</th>
            </tr>
          </thead>
          <tbody>
            {parts.map((p) => (
              <tr key={p.id} className="border-t border-outline">
                <td className="px-4 py-2 font-mono text-xs">{p.unit}</td>
                <td className="px-4 py-2">{p.part_name}</td>
                <td className="px-4 py-2 font-mono text-xs">
                  {Number(p.length_mm)}×{Number(p.width_mm)}×{Number(p.thickness_mm)}
                </td>
                <td className="px-4 py-2">{p.material}</td>
                <td className="px-4 py-2 font-mono">{p.qty}</td>
                <td className="px-4 py-2 font-mono">{Number(p.weight_kg).toFixed(3)}</td>
                <td className="px-4 py-2 font-mono text-xs">{p.board_sku}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!parts.length ? <p className="px-4 py-8 text-center text-sm text-muted">Import a CSV to load parts.</p> : null}
      </Card>

      {boxes.length ? (
        <Card className="overflow-x-auto p-0">
          <h3 className="border-b border-outline px-4 py-3 text-sm font-semibold">Boxes</h3>
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-low text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Box</th>
                <th className="px-4 py-2 font-medium">Unit</th>
                <th className="px-4 py-2 font-medium">Weight</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {boxes.map((b) => (
                <tr key={b.id} className="border-t border-outline">
                  <td className="px-4 py-2 font-mono text-xs">{b.box_number}</td>
                  <td className="px-4 py-2">{b.unit}</td>
                  <td className="px-4 py-2 font-mono">{formatKg(Number(b.total_weight_kg))}</td>
                  <td className="px-4 py-2">
                    <Badge tone={statusTone(b.status)}>{b.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </div>
  );
}

function ClientDetails({
  project,
  id,
}: {
  id: number;
  project: {
    name: string;
    client_id: number | null;
    client_name: string | null;
    po_number: string | null;
    lam_mode: string;
    notes: string | null;
    cabinet_size: string | null;
    city_state: string | null;
    address: string | null;
    client_phone: string | null;
    order_receive_date: string | null;
    expected_dispatch_date: string | null;
  };
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [product, setProduct] = useState(project.name);
  const [clientName, setClientName] = useState(project.client_name ?? "");
  const [po, setPo] = useState(project.po_number ?? "");
  const [city, setCity] = useState(project.city_state ?? "");
  const [phone, setPhone] = useState(project.client_phone ?? "");
  const [address, setAddress] = useState(project.address ?? "");
  const [receiveDate, setReceiveDate] = useState(project.order_receive_date ?? "");
  const [expectDate, setExpectDate] = useState(project.expected_dispatch_date ?? "");

  function startEdit() {
    setProduct(project.name);
    setClientName(project.client_name ?? "");
    setPo(project.po_number ?? "");
    setCity(project.city_state ?? "");
    setPhone(project.client_phone ?? "");
    setAddress(project.address ?? "");
    setReceiveDate(project.order_receive_date ?? "");
    setExpectDate(project.expected_dispatch_date ?? "");
    setOpen(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      let client_id = project.client_id ?? undefined;
      const typed = clientName.trim();
      if (typed) {
        if (client_id) {
          await saveClient({
            data: { id: client_id, name: typed, phone: phone.trim() || undefined, delivery_address: address.trim() || undefined },
          });
        } else {
          const created = await saveClient({
            data: { name: typed, phone: phone.trim() || undefined, delivery_address: address.trim() || undefined },
          });
          client_id = created.id;
        }
      }
      return saveProject({
        data: {
          id,
          name: product.trim() || project.name,
          client_id,
          po_number: po.trim() || undefined,
          lam_mode: project.lam_mode as LamMode,
          notes: project.notes ?? undefined,
          cabinet_size: project.cabinet_size ?? undefined,
          city_state: city,
          client_phone: phone,
          address,
          order_receive_date: receiveDate,
          expected_dispatch_date: expectDate,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Client details saved — stickers use this");
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["project", id] });
      await qc.invalidateQueries({ queryKey: ["projects"] });
      await qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold leading-none">Client details</h3>
          <p className="mt-1 text-xs text-muted">Same data saved at create. Stickers print from here.</p>
        </div>
        {open ? (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={!product.trim() || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={startEdit}>
            Edit client details
          </Button>
        )}
      </div>

      {open ? (
        <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2">
          <div>
            <Label htmlFor="ed-product" className="mb-0.5 text-xs text-muted">
              Product name
            </Label>
            <Input id="ed-product" value={product} onChange={(e) => setProduct(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ed-client" className="mb-0.5 text-xs text-muted">
              Client name
            </Label>
            <Input id="ed-client" value={clientName} onChange={(e) => setClientName(e.target.value)} autoComplete="off" />
          </div>
          <div>
            <Label htmlFor="ed-po" className="mb-0.5 text-xs text-muted">
              Order no / PO
            </Label>
            <Input id="ed-po" value={po} onChange={(e) => setPo(e.target.value.toUpperCase())} />
          </div>
          <div>
            <Label htmlFor="ed-phone" className="mb-0.5 text-xs text-muted">
              Client mobile
            </Label>
            <Input id="ed-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ed-city" className="mb-0.5 text-xs text-muted">
              City / State
            </Label>
            <Input id="ed-city" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ed-recv" className="mb-0.5 text-xs text-muted">
              Order receive date
            </Label>
            <Input id="ed-recv" type="date" value={receiveDate} onChange={(e) => setReceiveDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ed-expd" className="mb-0.5 text-xs text-muted">
              Expected dispatch date
            </Label>
            <Input id="ed-expd" type="date" value={expectDate} onChange={(e) => setExpectDate(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="ed-addr" className="mb-0.5 text-xs text-muted">
              Address
            </Label>
            <Input id="ed-addr" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
        </div>
      ) : (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted">Client name</dt>
            <dd>{project.client_name || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Product name</dt>
            <dd>{project.name || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Order no / PO</dt>
            <dd className="font-mono text-xs">{project.po_number || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Client mobile</dt>
            <dd className="font-mono text-xs">{project.client_phone || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">City / State</dt>
            <dd>{project.city_state || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Order receive date</dt>
            <dd className="font-mono text-xs">{project.order_receive_date || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Expected dispatch date</dt>
            <dd className="font-mono text-xs">{project.expected_dispatch_date || "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted">Address</dt>
            <dd>{project.address || "—"}</dd>
          </div>
        </dl>
      )}
    </Card>
  );
}

function SubProjects({ projectId }: { projectId: number }) {
  const qc = useQueryClient();
  const subs = useQuery({ queryKey: ["sub-projects", projectId], queryFn: () => listSubProjects({ data: projectId }) });
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [open, setOpen] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      saveSubProject({ data: { project_id: projectId, product_name: name, item_qty: Number(qty) || 1 } }),
    onSuccess: async () => {
      toast.success("Sub project created");
      setName("");
      setQty("1");
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["sub-projects", projectId] });
      await qc.invalidateQueries({ queryKey: ["work-board"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMut = useMutation({
    mutationFn: (d: { id: number; status: string }) => setSubProjectStatus({ data: d }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sub-projects", projectId] });
      qc.invalidateQueries({ queryKey: ["work-board"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="overflow-x-auto p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline px-4 py-3">
        <h3 className="text-sm font-semibold">Sub projects</h3>
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
          Add sub project
        </Button>
      </div>
      {open ? (
        <div className="flex flex-wrap items-end gap-2 border-b border-outline px-4 py-3">
          <div className="min-w-[180px] flex-1">
            <Label className="mb-0.5 text-xs text-muted">Product name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Son's bedroom" />
          </div>
          <div className="w-24">
            <Label className="mb-0.5 text-xs text-muted">Item qty</Label>
            <Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" />
          </div>
          <Button size="sm" disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Create"}
          </Button>
        </div>
      ) : null}
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-surface-low text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-2 font-medium">Sub order no.</th>
            <th className="px-4 py-2 font-medium">Product name</th>
            <th className="px-4 py-2 font-medium">Item qty</th>
            <th className="px-4 py-2 text-center font-medium">Status</th>
            <th className="px-4 py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {(subs.data ?? []).map((s) => (
            <tr key={s.id} className="border-t border-outline">
              <td className="px-4 py-2.5 font-mono text-xs font-semibold">{s.sub_order_no}</td>
              <td className="px-4 py-2.5">{s.product_name}</td>
              <td className="px-4 py-2.5 font-mono">{s.item_qty}</td>
              <td className="px-4 py-2.5 text-center">
                <div className="inline-flex flex-col items-center gap-1">
                  <ProcessBox
                    pct={jobStatusPct(s.status)}
                    disabled={statusMut.isPending}
                    onCycle={() => statusMut.mutate({ id: s.id, status: nextJobStatus(s.status) })}
                  />
                  <button
                    type="button"
                    disabled={statusMut.isPending}
                    onClick={() => statusMut.mutate({ id: s.id, status: nextJobStatus(s.status) })}
                    className="rounded-full"
                  >
                    <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                  </button>
                </div>
              </td>
              <td className="px-4 py-2.5">
                <Link
                  to="/projects/$id/subs/$sid"
                  params={{ id: String(projectId), sid: String(s.id) }}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(subs.data ?? []).length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted">No sub projects. Add rooms or units under this order.</p>
      ) : null}
    </Card>
  );
}
