import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Users } from "lucide-react";
import { Guard } from "@/components/guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { getAccess, listTeam, removeTeamMember, saveTeamMember } from "@/lib/server";
import { DEPARTMENTS, departmentLabel, type TeamMemberRow } from "@/lib/platform";

export const Route = createFileRoute("/team")({ component: Page });

function Page() {
  return (
    <Guard title="Factory team" perm="team">
      <TeamPage />
    </Guard>
  );
}

function TeamPage() {
  const qc = useQueryClient();
  const accessQ = useQuery({ queryKey: ["access"], queryFn: () => getAccess() });
  const teamQ = useQuery({ queryKey: ["team"], queryFn: () => listTeam() });
  const access = accessQ.data;
  const members = teamQ.data?.members ?? [];
  const [editing, setEditing] = useState<TeamMemberRow | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", email: "", department: "packing", phone: "" });

  const saveMut = useMutation({
    mutationFn: saveTeamMember,
    onSuccess: () => {
      toast.success(editing ? "Worker updated" : "Worker added");
      setEditing(null);
      setForm({ name: "", email: "", department: "packing", phone: "" });
      void qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save worker"),
  });

  const removeMut = useMutation({
    mutationFn: (id: number) => removeTeamMember({ data: id }),
    onSuccess: () => {
      toast.success("Worker removed");
      setConfirmId(null);
      void qc.invalidateQueries({ queryKey: ["team"] });
      void qc.invalidateQueries({ queryKey: ["access"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not remove"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    saveMut.mutate({
      data: {
        id: editing?.id,
        name: form.name,
        email: form.email,
        department: form.department,
        phone: form.phone,
      },
    });
  }

  function startEdit(row: TeamMemberRow) {
    setEditing(row);
    setForm({
      name: row.name,
      email: row.email,
      department: row.department,
      phone: row.phone ?? "",
    });
  }

  const byDept = DEPARTMENTS.map((d) => ({
    ...d,
    count: members.filter((m) => m.department === d.id).length,
  })).filter((d) => d.count > 0);

  if (access?.role === "owner") {
    return (
      <Card>
        <h2 className="text-sm font-semibold">Factory teams</h2>
        <p className="mt-2 text-sm text-muted">
          Teams belong to paying factory clients. Open a client dashboard in the owner portal to create worker logins.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">
          {access?.company ? `${access.company} · ` : ""}Workers share this factory’s packing and dispatch.
        </p>
        <p className="font-mono text-sm text-muted">Add by department · they sign up with the same email</p>
      </div>

      {byDept.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {byDept.map((d) => (
            <Badge key={d.id} tone="info">
              {d.label} {d.count}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold">Workers</h2>
          {teamQ.isPending ? (
            <div className="h-40 animate-pulse rounded-md bg-surface-container" />
          ) : members.length === 0 ? (
            <p className="text-sm text-muted">
              {access?.canManageTeam
                ? "No workers yet. Add packing, dispatch, or floor staff so they can log in to this factory."
                : "No workers on this factory yet."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Department</th>
                    <th className="pb-2 font-medium">Email</th>
                    <th className="pb-2 font-medium">Login</th>
                    {access?.canManageTeam ? <th className="pb-2 font-medium">Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {members.map((row) => (
                    <tr key={row.id} className="border-t border-outline">
                      <td className="py-3">
                        <p className="font-medium">{row.name}</p>
                        {row.phone ? <p className="text-xs text-muted">{row.phone}</p> : null}
                      </td>
                      <td className="py-3">
                        <Badge tone="muted">{departmentLabel(row.department)}</Badge>
                      </td>
                      <td className="py-3 font-mono text-xs">{row.email}</td>
                      <td className="py-3">
                        <Badge tone={row.user_id ? "ok" : "warn"}>{row.user_id ? "Linked" : "Invited"}</Badge>
                      </td>
                      {access?.canManageTeam ? (
                        <td className="py-3">
                          <div className="flex flex-wrap gap-1">
                            <Button size="sm" variant="ghost" onClick={() => startEdit(row)}>
                              Edit
                            </Button>
                            {confirmId === row.id ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="danger"
                                  disabled={removeMut.isPending}
                                  onClick={() => removeMut.mutate(row.id)}
                                >
                                  Confirm
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setConfirmId(null)}>
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <Button size="sm" variant="danger" onClick={() => setConfirmId(row.id)}>
                                Remove
                              </Button>
                            )}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {access?.canManageTeam ? (
          <Card>
            <div className="mb-4 flex items-center gap-2">
              <Users className="size-4 text-muted" />
              <h2 className="text-sm font-semibold">{editing ? "Edit worker" : "Add worker"}</h2>
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
              <div className="flex gap-2">
                <Button type="submit" className="flex-1" disabled={saveMut.isPending}>
                  {saveMut.isPending ? "Saving…" : editing ? "Save worker" : "Add to team"}
                </Button>
                {editing ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditing(null);
                      setForm({ name: "", email: "", department: "packing", phone: "" });
                    }}
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted">
                Worker creates an account with this email. They use the same jobs, boxes, and dispatch as this factory.
                Department is how the floor is organised — packing, dispatch, cutting, and so on.
              </p>
            </form>
          </Card>
        ) : (
          <Card>
            <h2 className="text-sm font-semibold">Your department</h2>
            <p className="mt-2 text-sm">{departmentLabel(access?.department)}</p>
            <p className="mt-2 text-sm text-muted">
              You work with {access?.company ?? "this factory"}. Only the factory admin can add or remove workers.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
