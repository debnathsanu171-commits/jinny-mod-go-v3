import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Shield } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSecurityOverview } from "@/lib/security";

export const Route = createFileRoute("/admin/security")({ component: Page });

function Page() {
  const q = useQuery({ queryKey: ["security"], queryFn: () => getSecurityOverview() });

  if (q.isPending) return <div className="h-40 animate-pulse rounded-lg bg-surface-container" />;
  if (q.error || !q.data) {
    return <p className="text-sm text-danger">{q.error instanceof Error ? q.error.message : "Could not load security"}</p>;
  }

  const { controls, locked, recent, failLimit, windowMin } = q.data;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">JINNY MOD GO security controls. Isolation is on at login, role, and database.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {controls.map((c) => (
          <Card key={c.id} className="flex items-start gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-md bg-ok/10">
              <Shield className="size-4 text-ok" />
            </div>
            <div className="min-w-0">
              <Badge tone="ok">On</Badge>
              <p className="mt-1 text-sm font-medium leading-snug">{c.label}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold">Locked logins</h2>
        <p className="text-xs text-muted">
          {failLimit} failed attempts in {windowMin} minutes locks that ID. Client and team stay isolated even when unlocked.
        </p>
        {locked.length === 0 ? (
          <p className="text-sm text-muted">No IDs locked right now.</p>
        ) : (
          <ul className="divide-y divide-outline text-sm">
            {locked.map((r) => (
              <li key={r.email} className="flex items-center justify-between py-2">
                <span className="font-mono text-xs">{r.email}</span>
                <Badge tone="warn">{r.fails} fails</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold">Recent sign-in events</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted">No attempts logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="pb-2 font-medium">Email</th>
                  <th className="pb-2 font-medium">Result</th>
                  <th className="pb-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id} className="border-t border-outline">
                    <td className="py-2 font-mono text-xs">{r.email}</td>
                    <td className="py-2">
                      <Badge tone={r.ok ? "ok" : "danger"}>{r.ok ? "ok" : "fail"}</Badge>
                    </td>
                    <td className="py-2 text-xs text-muted">
                      {new Date(r.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
