import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Guard } from "@/components/guard";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge, statusTone } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listWorkBoard, saveSubProject, setSubProjectStatus } from "@/lib/server";
import { isWorkOrderComplete, jobStatusPct, nextJobStatus } from "@/lib/platform";
import { ProcessBox } from "@/components/process-box";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/shop/bom")({ component: Page });

function Page() {
  return (
    <Guard title="Work order" perm="projects">
      <WorkBoard />
    </Guard>
  );
}

function WorkBoard() {
  const qc = useQueryClient();
  const [bin, setBin] = useState<"pending" | "complete">("pending");
  const board = useQuery({ queryKey: ["work-board"], queryFn: () => listWorkBoard() });
  const statusMut = useMutation({
    mutationFn: (d: { id: number; status: string }) => setSubProjectStatus({ data: d }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work-board"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (board.data ?? []).filter((p) => {
    const done = p.subs.length > 0 && p.subs.every((s) => isWorkOrderComplete(s.status));
    return bin === "complete" ? done : !done;
  });

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to="/shop" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Floor SHOP
        </Link>
        <p className="text-sm text-muted">Main project → sub project work orders</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "pending", label: "Pending" },
            { id: "complete", label: "Complete" },
          ] as const
        ).map((b) => {
          const count = (board.data ?? []).filter((p) => {
            const done = p.subs.length > 0 && p.subs.every((s) => isWorkOrderComplete(s.status));
            return b.id === "complete" ? done : !done;
          }).length;
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

      {rows.map((p) => (
        <Card key={p.id} className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline px-4 py-3">
            <div>
              <p className="font-mono text-xs font-semibold">{p.po_number?.trim() || p.code}</p>
              <p className="text-sm">
                {p.client_name ?? "—"} · {p.name}
              </p>
            </div>
            <Link to="/projects/$id" params={{ id: String(p.id) }} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Open project
            </Link>
          </div>
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
              {p.subs.map((s) => (
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
                      params={{ id: String(p.id), sid: String(s.id) }}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {p.subs.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">No sub projects on this order.</p>
          ) : null}
          <AddSub projectId={p.id} />
        </Card>
      ))}

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted">
          {bin === "complete" ? "No complete work orders." : "No pending work orders."}
        </p>
      ) : null}
    </div>
  );
}

function AddSub({ projectId }: { projectId: number }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const save = useMutation({
    mutationFn: () =>
      saveSubProject({ data: { project_id: projectId, product_name: name, item_qty: Number(qty) || 1 } }),
    onSuccess: async () => {
      toast.success("Sub project created");
      setName("");
      setQty("1");
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["work-board"] });
      await qc.invalidateQueries({ queryKey: ["sub-projects", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="border-t border-outline px-4 py-3">
      {open ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[180px] flex-1">
            <Label className="mb-0.5 text-xs text-muted">Product name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Master bedroom" />
          </div>
          <div className="w-24">
            <Label className="mb-0.5 text-xs text-muted">Item qty</Label>
            <Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" />
          </div>
          <Button size="sm" disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Create"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          Add sub project
        </Button>
      )}
    </div>
  );
}
