import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Building2, CheckCircle2, Clock, PauseCircle, ShieldOff, UserPlus, Users } from "lucide-react";
import { Kpi } from "@/components/kpi";
import { Badge, statusTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  grantSubscriptionDays,
  listSubscribers,
  removeSubscriber,
  saveSubscriber,
  setPortalMessage,
  setSubscriberStatus,
} from "@/lib/server";
import {
  displayStatus,
  formatSubDate,
  statusActions,
  SUBSCRIBER_PLANS,
  SUBSCRIBER_STATUSES,
  type SubscriberRow,
  type SubscriberStatus,
} from "@/lib/platform";

export const Route = createFileRoute("/admin/")({ component: OwnerPortal });

const ACTION_LABEL: Record<SubscriberStatus, string> = {
  pending: "Set pending",
  approved: "Approve",
  active: "Activate",
  suspended: "Suspend",
  revoked: "Revoke",
};

const BLANK = {
  company_name: "",
  contact_name: "",
  email: "",
  phone: "",
  plan: "monthly",
  notes: "",
  password: "",
};

function OwnerPortal() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["subscribers"], queryFn: () => listSubscribers() });
  const [filter, setFilter] = useState<"all" | SubscriberStatus>("all");
  const [editing, setEditing] = useState<SubscriberRow | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  const [form, setForm] = useState(BLANK);
  const [blockFor, setBlockFor] = useState<{ id: number; status: "suspended" | "revoked"; company: string } | null>(null);
  const [blockMsg, setBlockMsg] = useState("");
  const [msgDraft, setMsgDraft] = useState<Record<number, string>>({});

  const saveMut = useMutation({
    mutationFn: saveSubscriber,
    onSuccess: () => {
      toast.success(editing ? "Client updated" : "Client created as pending");
      setEditing(null);
      setForm(BLANK);
      void qc.invalidateQueries({ queryKey: ["subscribers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  const statusMut = useMutation({
    mutationFn: (d: { id: number; status: string; message?: string }) => setSubscriberStatus({ data: d }),
    onSuccess: () => {
      toast.success("Status updated");
      void qc.invalidateQueries({ queryKey: ["subscribers"] });
      void qc.invalidateQueries({ queryKey: ["access"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update status"),
  });

  const daysMut = useMutation({
    mutationFn: (d: { id: number; days: number }) => grantSubscriptionDays({ data: d }),
    onSuccess: (r) => {
      toast.success(`${r.days} day${r.days === 1 ? "" : "s"} added · client can log in until end date`);
      void qc.invalidateQueries({ queryKey: ["subscribers"] });
      void qc.invalidateQueries({ queryKey: ["access"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add days"),
  });

  const msgMut = useMutation({
    mutationFn: (d: { id: number; message: string }) => setPortalMessage({ data: d }),
    onSuccess: () => {
      toast.success("Login message saved");
      void qc.invalidateQueries({ queryKey: ["subscribers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save message"),
  });

  const removeMut = useMutation({
    mutationFn: (id: number) => removeSubscriber({ data: id }),
    onSuccess: () => {
      toast.success("Client removed");
      setConfirmRemove(null);
      if (editing && confirmRemove === editing.id) {
        setEditing(null);
        setForm(BLANK);
      }
      void qc.invalidateQueries({ queryKey: ["subscribers"] });
      void qc.invalidateQueries({ queryKey: ["access"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not remove client"),
  });

  const rows = list.data?.rows ?? [];
  const counts = list.data?.counts;
  const visible = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter],
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    saveMut.mutate({
      data: {
        id: editing?.id,
        company_name: form.company_name,
        contact_name: form.contact_name,
        email: form.email,
        phone: form.phone,
        plan: form.plan,
        notes: form.notes,
        password: form.password || undefined,
      },
    });
  }

  function startEdit(row: SubscriberRow) {
    setEditing(row);
    setForm({
      company_name: row.company_name,
      contact_name: row.contact_name ?? "",
      email: row.email,
      phone: row.phone ?? "",
      plan: row.plan,
      notes: row.notes ?? "",
      password: "",
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">Issue login IDs from here. New clients stay pending until you grant days.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Factories" value={counts?.total ?? 0} icon={Building2} hint="All subscribers" />
        <Kpi label="Pending" value={counts?.pending ?? 0} icon={Clock} hint="No access yet" bar={counts?.total ? Math.round(((counts.pending ?? 0) / counts.total) * 100) : 0} barClass="bg-warn" />
        <Kpi label="Approved" value={counts?.approved ?? 0} icon={Users} hint="Waiting days" barClass="bg-info" />
        <Kpi label="Active" value={counts?.active ?? 0} icon={CheckCircle2} hint="Can use factory" bar={counts?.total ? Math.round(((counts.active ?? 0) / counts.total) * 100) : 0} barClass="bg-ok" />
        <Kpi label="Suspended" value={counts?.suspended ?? 0} icon={PauseCircle} hint="Client + team locked" barClass="bg-warn" />
        <Kpi label="Revoked" value={counts?.revoked ?? 0} icon={ShieldOff} hint="Access closed" barClass="bg-danger" />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Clients</h2>
            <div className="flex flex-wrap gap-1">
              {(["all", ...SUBSCRIBER_STATUSES] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFilter(s)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${
                    filter === s ? "border-primary bg-primary text-on-primary" : "border-outline bg-paper text-muted hover:bg-surface-low"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          {list.isPending ? (
            <div className="h-40 animate-pulse rounded-lg bg-surface-container" />
          ) : visible.length === 0 ? (
            <Card>
              <p className="text-sm text-muted">
                {rows.length === 0
                  ? "Create a client on the right. They stay pending — grant 1 / 2 / 3 days to open login."
                  : "No clients in this status."}
              </p>
            </Card>
          ) : (
            visible.map((row) => {
              const shown = displayStatus(row.status, row.ends_at);
              const locked = shown === "pending" || shown === "suspended" || shown === "revoked" || shown === "expired" || shown === "approved";
              const canGrant = row.status === "pending" || row.status === "approved" || row.status === "active";
              const draft = msgDraft[row.id] ?? row.portal_message ?? "";
              return (
                <Card key={row.id} className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        to="/admin/$id"
                        params={{ id: String(row.id) }}
                        className="text-sm font-semibold underline-offset-2 hover:underline"
                      >
                        {row.company_name}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted">
                        {row.contact_name || "—"}
                        {row.phone ? ` · ${row.phone}` : ""}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-muted">{row.email}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="muted">{row.plan}</Badge>
                      <Badge tone={statusTone(shown)}>{shown}</Badge>
                      <Link to="/admin/$id" params={{ id: String(row.id) }} className="text-xs text-muted underline-offset-2 hover:underline">
                        {row.team_count ?? 0} workers
                      </Link>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
                    <p>
                      <span className="text-muted">Start</span>{" "}
                      <span className="font-medium">{formatSubDate(row.starts_at)}</span>
                    </p>
                    <p>
                      <span className="text-muted">End</span>{" "}
                      <span className="font-medium">{formatSubDate(row.ends_at)}</span>
                    </p>
                    <p className="text-muted col-span-2 sm:col-span-1">
                      {locked ? "Login locked · client + team" : "Login open until end date"}
                    </p>
                  </div>

                  {locked ? (
                    <form
                      className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
                      onSubmit={(e) => {
                        e.preventDefault();
                        msgMut.mutate({ id: row.id, message: draft });
                      }}
                    >
                      <div>
                        <Label className="mb-0.5 text-xs text-muted">Login message</Label>
                        <Input
                          value={draft}
                          onChange={(e) => setMsgDraft((m) => ({ ...m, [row.id]: e.target.value }))}
                          placeholder="Shown when they try to log in"
                        />
                      </div>
                      <Button type="submit" size="sm" disabled={msgMut.isPending}>
                        Save message
                      </Button>
                    </form>
                  ) : null}

                  {canGrant ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted">
                        {row.status === "active" ? "Add days" : "Give access"}
                      </span>
                      {[1, 2, 3].map((d) => (
                        <Button
                          key={d}
                          size="sm"
                          variant="outline"
                          disabled={daysMut.isPending}
                          onClick={() => daysMut.mutate({ id: row.id, days: d })}
                        >
                          {d} day{d === 1 ? "" : "s"}
                        </Button>
                      ))}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-1 border-t border-outline pt-3">
                    {statusActions(row.status as SubscriberStatus)
                      .filter((s) => s !== "active")
                      .map((s) => (
                        <Button
                          key={s}
                          size="sm"
                          variant={s === "revoked" || s === "suspended" ? "danger" : "outline"}
                          disabled={statusMut.isPending}
                          onClick={() => {
                            if (s === "suspended" || s === "revoked") {
                              setBlockFor({ id: row.id, status: s, company: row.company_name });
                              setBlockMsg(row.portal_message ?? "");
                              return;
                            }
                            statusMut.mutate({ id: row.id, status: s });
                          }}
                        >
                          {ACTION_LABEL[s]}
                        </Button>
                      ))}
                    <Link to="/admin/$id" params={{ id: String(row.id) }}>
                      <Button size="sm">Team</Button>
                    </Link>
                    <Button size="sm" variant="ghost" onClick={() => startEdit(row as SubscriberRow)}>
                      Edit
                    </Button>
                    {confirmRemove === row.id ? (
                      <>
                        <Button size="sm" variant="danger" disabled={removeMut.isPending} onClick={() => removeMut.mutate(row.id)}>
                          Confirm remove
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setConfirmRemove(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="danger" onClick={() => setConfirmRemove(row.id)}>
                        Remove
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })
          )}
        </div>

        <Card>
          <div className="mb-3 flex items-center gap-2">
            <UserPlus className="size-4 text-muted" />
            <h2 className="text-sm font-semibold">{editing ? "Edit client" : "Create client"}</h2>
          </div>
          <form onSubmit={onSubmit} className="grid gap-2">
            <div>
              <Label htmlFor="company" className="mb-0.5 text-xs text-muted">
                Company
              </Label>
              <Input
                id="company"
                required
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                placeholder="Shri Gulabrai Sons"
              />
            </div>
            <div>
              <Label htmlFor="contact" className="mb-0.5 text-xs text-muted">
                Contact name
              </Label>
              <Input
                id="contact"
                value={form.contact_name}
                onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                placeholder="Floor manager"
              />
            </div>
            <div>
              <Label htmlFor="sub-email" className="mb-0.5 text-xs text-muted">
                Login ID / email
              </Label>
              <Input
                id="sub-email"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="factory@client.com"
              />
            </div>
            <div>
              <Label htmlFor="sub-pass" className="mb-0.5 text-xs text-muted">
                {editing ? "New password (optional)" : "Password"}
              </Label>
              <Input
                id="sub-pass"
                type="password"
                required={!editing}
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            </div>
            <div>
              <Label htmlFor="phone" className="mb-0.5 text-xs text-muted">
                Phone
              </Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="98765 43210"
              />
            </div>
            <div>
              <Label htmlFor="plan" className="mb-0.5 text-xs text-muted">
                Plan
              </Label>
              <Select id="plan" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
                {SUBSCRIBER_PLANS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="submit" className="flex-1" disabled={saveMut.isPending}>
                {saveMut.isPending ? "Saving…" : editing ? "Save client" : "Create as pending"}
              </Button>
              {editing ? (
                <Button type="button" variant="outline" onClick={() => { setEditing(null); setForm(BLANK); }}>
                  Cancel
                </Button>
              ) : null}
            </div>
            <p className="text-xs leading-relaxed text-muted">
              Created pending. Grant 1 / 2 / 3 days on the client card to open login. Suspend locks client and team.
            </p>
          </form>
        </Card>
      </div>

      {blockFor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/50 p-4">
          <Card className="w-full max-w-md space-y-3 p-5">
            <h2 className="text-sm font-semibold">
              {blockFor.status === "suspended" ? "Suspend" : "Revoke"} {blockFor.company}
            </h2>
            <p className="text-xs text-muted">Client and team cannot log in. This message shows on the lock screen.</p>
            <div>
              <Label htmlFor="block-msg" className="mb-0.5 text-xs text-muted">
                Login message
              </Label>
              <Input
                id="block-msg"
                value={blockMsg}
                onChange={(e) => setBlockMsg(e.target.value)}
                placeholder="Payment overdue. Access paused until settled."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBlockFor(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={statusMut.isPending}
                onClick={() => {
                  statusMut.mutate({ id: blockFor.id, status: blockFor.status, message: blockMsg });
                  setBlockFor(null);
                  setBlockMsg("");
                }}
              >
                {blockFor.status === "suspended" ? "Suspend" : "Revoke"}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
