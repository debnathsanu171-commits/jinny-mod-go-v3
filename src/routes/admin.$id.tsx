import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ArrowLeft, KeyRound, Users } from "lucide-react";
import { Kpi } from "@/components/kpi";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  createPortalWorker,
  getSubscriber,
  grantSubscriptionDays,
  removePortalWorker,
  resetPortalWorkerPassword,
  setClientLogin,
  setPortalMessage,
  setSubscriberStatus,
} from "@/lib/server";
import {
  DEPARTMENTS,
  departmentLabel,
  displayStatus,
  formatSubDate,
  statusActions,
  type SubscriberStatus,
  type TeamMemberRow,
} from "@/lib/platform";

export const Route = createFileRoute("/admin/$id")({ component: ClientDashboard });

const ACTION_LABEL: Record<SubscriberStatus, string> = {
  pending: "Set pending",
  approved: "Approve",
  active: "Activate",
  suspended: "Suspend",
  revoked: "Revoke",
};

function ClientDashboard() {
  const { id } = Route.useParams();
  const subscriberId = Number(id);
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: ["subscriber", subscriberId],
    queryFn: () => getSubscriber({ data: subscriberId }),
    enabled: Number.isFinite(subscriberId),
  });
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [resetId, setResetId] = useState<number | null>(null);
  const [resetPass, setResetPass] = useState("");
  const [adminPass, setAdminPass] = useState("");
  const [notice, setNotice] = useState("");
  const [blockFor, setBlockFor] = useState<"suspended" | "revoked" | null>(null);
  const [blockMsg, setBlockMsg] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    department: "packing",
    phone: "",
  });

  useEffect(() => {
    setNotice(detail.data?.client.portal_message ?? "");
  }, [detail.data?.client.portal_message]);

  const statusMut = useMutation({
    mutationFn: (d: { status: string; message?: string }) =>
      setSubscriberStatus({ data: { id: subscriberId, status: d.status, message: d.message } }),
    onSuccess: () => {
      toast.success("Status updated");
      setBlockFor(null);
      void qc.invalidateQueries({ queryKey: ["subscriber", subscriberId] });
      void qc.invalidateQueries({ queryKey: ["subscribers"] });
      void qc.invalidateQueries({ queryKey: ["access"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update status"),
  });

  const noticeMut = useMutation({
    mutationFn: (message: string) => setPortalMessage({ data: { id: subscriberId, message } }),
    onSuccess: () => {
      toast.success("Popup message saved");
      void qc.invalidateQueries({ queryKey: ["subscriber", subscriberId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save message"),
  });

  const daysMut = useMutation({
    mutationFn: (days: number) => grantSubscriptionDays({ data: { id: subscriberId, days } }),
    onSuccess: (r) => {
      toast.success(`${r.days} day${r.days === 1 ? "" : "s"} added`);
      void qc.invalidateQueries({ queryKey: ["subscriber", subscriberId] });
      void qc.invalidateQueries({ queryKey: ["subscribers"] });
      void qc.invalidateQueries({ queryKey: ["access"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add days"),
  });

  const createMut = useMutation({
    mutationFn: createPortalWorker,
    onSuccess: (r) => {
      toast.success(r.created === false ? "Worker login updated" : "Worker account created. They can sign in now.");
      setForm({ name: "", email: "", password: "", department: "packing", phone: "" });
      void qc.invalidateQueries({ queryKey: ["subscriber", subscriberId] });
      void qc.invalidateQueries({ queryKey: ["subscribers"] });
      void qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create worker"),
  });

  const resetMut = useMutation({
    mutationFn: (d: { memberId: number; password: string }) =>
      resetPortalWorkerPassword({ data: { subscriberId, ...d } }),
    onSuccess: () => {
      toast.success("Password saved. Give it to the worker.");
      setResetId(null);
      setResetPass("");
      void qc.invalidateQueries({ queryKey: ["subscriber", subscriberId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not set password"),
  });

  const adminMut = useMutation({
    mutationFn: (password: string) => setClientLogin({ data: { subscriberId, password } }),
    onSuccess: () => {
      toast.success("Factory admin can sign in with this password.");
      setAdminPass("");
      void qc.invalidateQueries({ queryKey: ["subscriber", subscriberId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not set admin login"),
  });

  const removeMut = useMutation({
    mutationFn: (memberId: number) =>
      removePortalWorker({ data: { subscriberId, memberId } }),
    onSuccess: () => {
      toast.success("Worker removed");
      setConfirmId(null);
      void qc.invalidateQueries({ queryKey: ["subscriber", subscriberId] });
      void qc.invalidateQueries({ queryKey: ["subscribers"] });
      void qc.invalidateQueries({ queryKey: ["team"] });
      void qc.invalidateQueries({ queryKey: ["access"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not remove worker"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    createMut.mutate({
      data: {
        subscriberId,
        name: form.name,
        email: form.email,
        password: form.password,
        department: form.department,
        phone: form.phone,
      },
    });
  }

  if (!Number.isFinite(subscriberId)) {
    return <p className="text-sm text-danger">Invalid client</p>;
  }
  if (detail.isPending) {
    return <div className="h-40 animate-pulse rounded-lg bg-surface-container" />;
  }
  if (detail.error || !detail.data) {
    return (
      <p className="text-sm text-danger">
        {detail.error instanceof Error ? detail.error.message : "Client not found"}
      </p>
    );
  }

  const { client, members } = detail.data;
  const grouped = DEPARTMENTS.map((d) => ({
    ...d,
    rows: members.filter((m) => m.department === d.id),
  })).filter((d) => d.rows.length > 0);
  const ready = members.filter((m) => m.user_id).length;
  const shown = displayStatus(client.status, client.ends_at);
  const canGrant = client.status === "pending" || client.status === "approved" || client.status === "active";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/admin" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
            <ArrowLeft className="size-4" />
            All clients
          </Link>
          <h2 className="text-lg font-semibold">{client.company_name}</h2>
          <p className="font-mono text-sm text-muted">{client.email}</p>
          <p className="text-sm text-muted">
            {client.contact_name || "No contact"} {client.phone ? `· ${client.phone}` : ""}
          </p>
          <p className="mt-1 text-xs text-muted">
            Start {formatSubDate(client.starts_at)} · End {formatSubDate(client.ends_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="muted">{client.plan}</Badge>
          <Badge tone={statusTone(shown)}>{shown}</Badge>
          {canGrant
            ? [1, 2, 3].map((d) => (
                <Button key={d} size="sm" variant="outline" disabled={daysMut.isPending} onClick={() => daysMut.mutate(d)}>
                  {d}d
                </Button>
              ))
            : null}
          {statusActions(client.status as SubscriberStatus)
            .filter((s) => s !== "active")
            .map((s) => (
            <Button
              key={s}
              size="sm"
              variant={s === "revoked" || s === "suspended" ? "danger" : "outline"}
              disabled={statusMut.isPending}
              onClick={() => {
                if (s === "suspended" || s === "revoked") {
                  setBlockFor(s);
                  setBlockMsg(client.portal_message ?? "");
                  return;
                }
                statusMut.mutate({ status: s });
              }}
            >
              {ACTION_LABEL[s]}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Workers" value={members.length} icon={Users} hint="Under this factory" />
        <Kpi
          label="Ready to login"
          value={ready}
          icon={KeyRound}
          hint="Account created"
          bar={members.length ? Math.round((ready / members.length) * 100) : 0}
          barClass="bg-ok"
        />
        <Kpi
          label="Departments"
          value={grouped.length}
          icon={Users}
          hint={grouped.map((d) => d.label).join(", ") || "None yet"}
        />
        <Kpi
          label="Factory admin"
          value={client.user_id ? "Ready" : "No login"}
          icon={KeyRound}
          hint={client.email}
        />
      </div>

      {shown !== "active" ? (
        <p className="text-sm text-warn">
          Client and team cannot use the factory. Grant 1 / 2 / 3 days to open login, or wait until unsuspended.
        </p>
      ) : null}

      <Card>
        <h2 className="text-sm font-semibold">Popup message</h2>
        <p className="mb-3 text-xs text-muted">Client and team see this. On suspend/revoke it is the lock screen.</p>
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            noticeMut.mutate(notice);
          }}
        >
          <textarea
            value={notice}
            onChange={(e) => setNotice(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-outline bg-paper px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            placeholder="Payment overdue. Factory and team access paused until settled."
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={noticeMut.isPending}>
              {noticeMut.isPending ? "Saving…" : "Save message"}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Factory admin login</h2>
            <p className="text-xs text-muted">
              {client.contact_name || client.company_name} signs in with {client.email}
            </p>
          </div>
          <Badge tone={client.user_id ? "ok" : "warn"}>{client.user_id ? "Ready" : "No login"}</Badge>
        </div>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            adminMut.mutate(adminPass);
          }}
        >
          <div className="min-w-48 flex-1">
            <Label htmlFor="admin-pass">Set password</Label>
            <Input
              id="admin-pass"
              type="password"
              required
              minLength={8}
              value={adminPass}
              onChange={(e) => setAdminPass(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" disabled={adminMut.isPending}>
            {adminMut.isPending ? "Saving…" : client.user_id ? "Reset admin password" : "Create admin login"}
          </Button>
        </form>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-1 text-sm font-semibold">Workers under this client</h2>
          <p className="mb-4 text-xs text-muted">Created here. They share this factory’s packing and dispatch.</p>
          {members.length === 0 ? (
            <p className="text-sm text-muted">
              No workers yet. Create a login on the right. Pick their department so the floor knows who packs, cuts, or dispatches.
            </p>
          ) : grouped.length === 0 ? (
            <WorkerTable
              rows={members}
              confirmId={confirmId}
              resetId={resetId}
              resetPass={resetPass}
              busy={removeMut.isPending || resetMut.isPending}
              onConfirm={(id) => {
                setResetId(null);
                setConfirmId(id);
              }}
              onRemove={(id) => removeMut.mutate(id)}
              onReset={(id) => {
                setConfirmId(null);
                setResetId(id);
                setResetPass("");
              }}
              onCancelReset={() => {
                setResetId(null);
                setResetPass("");
              }}
              onResetPass={setResetPass}
              onSaveReset={(memberId) => resetMut.mutate({ memberId, password: resetPass })}
            />
          ) : (
            <div className="space-y-6">
              {grouped.map((g) => (
                <div key={g.id}>
                  <div className="mb-2 flex items-center gap-2">
                    <Badge tone="info">
                      {g.label} {g.rows.length}
                    </Badge>
                  </div>
                  <WorkerTable
                    rows={g.rows}
                    confirmId={confirmId}
                    resetId={resetId}
                    resetPass={resetPass}
                    busy={removeMut.isPending || resetMut.isPending}
                    onConfirm={(id) => {
                      setResetId(null);
                      setConfirmId(id);
                    }}
                    onRemove={(id) => removeMut.mutate(id)}
                    onReset={(id) => {
                      setConfirmId(null);
                      setResetId(id);
                      setResetPass("");
                    }}
                    onCancelReset={() => {
                      setResetId(null);
                      setResetPass("");
                    }}
                    onResetPass={setResetPass}
                    onSaveReset={(memberId) => resetMut.mutate({ memberId, password: resetPass })}
                  />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center gap-2">
            <Users className="size-4 text-muted" />
            <h2 className="text-sm font-semibold">Create worker account</h2>
          </div>
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <Label htmlFor="w-name">Name</Label>
              <Input
                id="w-name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ravi packing"
              />
            </div>
            <div>
              <Label htmlFor="w-email">Login email</Label>
              <Input
                id="w-email"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="ravi@factory.com"
              />
            </div>
            <div>
              <Label htmlFor="w-pass">Password</Label>
              <Input
                id="w-pass"
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            </div>
            <div>
              <Label htmlFor="w-dept">Department</Label>
              <Select
                id="w-dept"
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="w-phone">Phone</Label>
              <Input
                id="w-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="98765 43210"
              />
            </div>
            <Button type="submit" className="w-full" disabled={createMut.isPending}>
              {createMut.isPending ? "Creating…" : "Create login"}
            </Button>
            <p className="text-xs text-muted">
              Account is created here. Department is the role: packing sees packing/labels, dispatch sees dispatch, admin sees the full factory.
            </p>
          </form>
        </Card>
      </div>

      {blockFor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/50 p-4">
          <Card className="w-full max-w-md space-y-3 p-5">
            <h2 className="text-sm font-semibold">
              {blockFor === "suspended" ? "Suspend" : "Revoke"} {client.company_name}
            </h2>
            <p className="text-xs text-muted">Client and every team login will see this popup. Packing stays locked.</p>
            <Input
              value={blockMsg}
              onChange={(e) => setBlockMsg(e.target.value)}
              placeholder="Payment overdue. Access paused until settled."
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBlockFor(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={statusMut.isPending}
                onClick={() => statusMut.mutate({ status: blockFor, message: blockMsg })}
              >
                {blockFor === "suspended" ? "Suspend" : "Revoke"}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function WorkerTable({
  rows,
  confirmId,
  resetId,
  resetPass,
  busy,
  onConfirm,
  onRemove,
  onReset,
  onCancelReset,
  onResetPass,
  onSaveReset,
}: {
  rows: TeamMemberRow[];
  confirmId: number | null;
  resetId: number | null;
  resetPass: string;
  busy: boolean;
  onConfirm: (id: number | null) => void;
  onRemove: (id: number) => void;
  onReset: (id: number) => void;
  onCancelReset: () => void;
  onResetPass: (v: string) => void;
  onSaveReset: (id: number) => void;
}) {
  const showDept = useMemo(() => new Set(rows.map((r) => r.department)).size > 1, [rows]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="pb-2 font-medium">Name</th>
            {showDept ? <th className="pb-2 font-medium">Department</th> : null}
            <th className="pb-2 font-medium">Email</th>
            <th className="pb-2 font-medium">Account</th>
            <th className="pb-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-outline align-top">
              <td className="py-3">
                <p className="font-medium">{row.name}</p>
                {row.phone ? <p className="text-xs text-muted">{row.phone}</p> : null}
              </td>
              {showDept ? (
                <td className="py-3">
                  <Badge tone="muted">{departmentLabel(row.department)}</Badge>
                </td>
              ) : null}
              <td className="py-3 font-mono text-xs">{row.email}</td>
              <td className="py-3">
                <Badge tone={row.user_id ? "ok" : "warn"}>{row.user_id ? "Ready" : "No login"}</Badge>
              </td>
              <td className="py-3">
                {resetId === row.id ? (
                  <form
                    className="flex flex-wrap items-center gap-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      onSaveReset(row.id);
                    }}
                  >
                    <Input
                      type="password"
                      required
                      minLength={8}
                      value={resetPass}
                      onChange={(e) => onResetPass(e.target.value)}
                      placeholder="New password"
                      autoComplete="new-password"
                      className="h-8 w-40"
                    />
                    <Button size="sm" type="submit" disabled={busy}>
                      Save
                    </Button>
                    <Button size="sm" type="button" variant="outline" onClick={onCancelReset}>
                      Cancel
                    </Button>
                  </form>
                ) : confirmId === row.id ? (
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="danger" disabled={busy} onClick={() => onRemove(row.id)}>
                      Confirm
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onConfirm(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="outline" onClick={() => onReset(row.id)}>
                      {row.user_id ? "Reset password" : "Set password"}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => onConfirm(row.id)}>
                      Remove
                    </Button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
