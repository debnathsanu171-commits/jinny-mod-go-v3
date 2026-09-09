import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, FolderKanban, Package, Boxes, Clock, CheckCircle2, Plus, Upload, Layers } from "lucide-react";
import { Guard } from "@/components/guard";
import { Kpi } from "@/components/kpi";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, statusTone } from "@/components/ui/badge";
import { getDashboard, getAccess } from "@/lib/server";
import { formatKg } from "@/lib/utils";
import { hasPerm } from "@/lib/platform";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <Guard title="Command Center" perm="dashboard">
      <Dashboard />
    </Guard>
  );
}

function Dashboard() {
  const { data, isPending, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => getDashboard(),
  });
  const access = useQuery({ queryKey: ["access"], queryFn: () => getAccess() });

  if (isPending) {
    return <div className="h-40 animate-pulse rounded-lg bg-surface-container" />;
  }
  if (error || !data) {
    return <p className="text-sm text-danger">{error instanceof Error ? error.message : "Could not load dashboard"}</p>;
  }

  const packed = data.totalBoxes ? Math.round((data.dispatched / Math.max(data.totalBoxes, 1)) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Factory packing & dispatch</p>
          <p className="font-mono text-sm text-muted">Weight engine locked · Excel catalog + Favicol paste</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasPerm(access.data, "materials") ? (
            <Link to="/materials">
              <Button variant="outline">
                <Layers className="size-4" />
                Materials
              </Button>
            </Link>
          ) : null}
          {hasPerm(access.data, "uploads") ? (
            <Link to="/uploads">
              <Button variant="outline">
                <Upload className="size-4" />
                Upload CSV
              </Button>
            </Link>
          ) : null}
          {hasPerm(access.data, "uploads") || hasPerm(access.data, "projects") ? (
            <Link to="/projects">
              <Button>
                <Plus className="size-4" />
                {hasPerm(access.data, "uploads") ? "New Project" : "Projects"}
              </Button>
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Total Clients" value={data.totalClients} icon={Building2} hint="Active accounts" bar={70} barClass="bg-ok" />
        <Kpi label="Active Projects" value={data.activeProjects} icon={FolderKanban} hint="In production" bar={40} barClass="bg-info" />
        <Kpi label="Packed weight" value={formatKg(data.packedKg, 1)} icon={Package} hint="Across all boxes" bar={packed} barClass="bg-warn" />
        <Kpi label="Total Boxes" value={data.totalBoxes} icon={Boxes} hint="Generated" />
        <Kpi label="Pending Dispatch" value={data.pendingDispatch} icon={Clock} hint="Awaiting truck" bar={data.pendingDispatch ? 35 : 0} barClass="bg-warn" />
        <Kpi label="Dispatched" value={data.dispatched} icon={CheckCircle2} hint="This workspace" bar={packed} barClass="bg-ok" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold">Projects</h2>
          {data.projects.length === 0 ? (
            <p className="text-sm text-muted">No projects yet. Create one to import a cut-list.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="pb-2 font-medium">Code</th>
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Client</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.projects.map((p) => (
                    <tr key={p.id} className="border-t border-outline">
                      <td className="py-2.5 font-mono text-xs">
                        <Link to="/projects/$id" params={{ id: String(p.id) }} className="underline-offset-2 hover:underline">
                          {p.code}
                        </Link>
                      </td>
                      <td className="py-2.5">{p.name}</td>
                      <td className="py-2.5 text-muted">{p.client_name ?? "—"}</td>
                      <td className="py-2.5">
                        <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card>
          <h2 className="mb-4 text-sm font-semibold">Activity</h2>
          {data.recent.length === 0 ? (
            <p className="text-sm text-muted">Workspace is quiet.</p>
          ) : (
            <ul className="space-y-3">
              {data.recent.map((r) => (
                <li key={r.id} className="border-b border-outline pb-3 last:border-0">
                  <p className="font-mono text-xs">{r.action}</p>
                  <p className="text-sm text-muted">{r.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
