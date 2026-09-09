import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Guard } from "@/components/guard";
import { Card } from "@/components/ui/card";
import { listAudit, getAccess } from "@/lib/server";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { departmentLabel, permLabel } from "@/lib/platform";
import {
  FEVICOL_DRY_KG_PER_M2,
  FT_TO_M,
  HDHMR_PLAIN_DENSITY_KG_M3,
  HPL_KG_PER_M2,
} from "@/lib/weight";
import { HARD_MAX_KG, PREFERRED_KG, SIZE_TOL_MM } from "@/lib/packing";

export const Route = createFileRoute("/settings")({ component: Page });

function Page() {
  return (
    <Guard title="Settings" perm="settings">
      <Settings />
    </Guard>
  );
}

function Settings() {
  const user = useCurrentUser();
  const audit = useQuery({ queryKey: ["audit"], queryFn: () => listAudit() });
  const access = useQuery({ queryKey: ["access"], queryFn: () => getAccess() });

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-sm font-semibold">Operator</h2>
        <p className="mt-2">{user?.displayName}</p>
        <p className="font-mono text-sm text-muted">{user?.primaryEmail}</p>
        {access.data?.company ? <p className="mt-1 text-sm text-muted">{access.data.company}</p> : null}
        {access.data?.role === "worker" ? (
          <p className="mt-1 text-sm">Role · {departmentLabel(access.data.department)}</p>
        ) : access.data?.role === "subscriber" ? (
          <p className="mt-1 text-sm text-muted">Role · Factory admin</p>
        ) : access.data?.role === "owner" ? (
          <p className="mt-1 text-sm text-muted">Role · Owner</p>
        ) : null}
        {access.data?.permissions?.length ? (
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Access: {access.data.permissions.map(permLabel).join(" · ")}
          </p>
        ) : null}
      </Card>
      <Card>
        <h2 className="text-sm font-semibold">Locked weight engine</h2>
        <p className="mt-1 text-sm text-muted">Do not change. Source: Action weight.xlsx + measured Favicol paste.</p>
        <dl className="mt-3 grid gap-2 font-mono text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted">ft → m</dt>
            <dd>{FT_TO_M}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">HDHMR plain density</dt>
            <dd>{HDHMR_PLAIN_DENSITY_KG_M3} kg/m³</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">1 mm HPL</dt>
            <dd>{HPL_KG_PER_M2} kg/m²</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Fevicol dry film</dt>
            <dd>{FEVICOL_DRY_KG_PER_M2} kg/m²</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">18 mm HDHMR 8×4 BSL prelam</dt>
            <dd>47.37 kg</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Same board Favicol both sides</dt>
            <dd>54.85 kg</dd>
          </div>
        </dl>
      </Card>
      <Card>
        <h2 className="text-sm font-semibold">Packing rules</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>Unit isolation — parts from different units never share a box</li>
          <li>Preferred {PREFERRED_KG} kg · auto-fill if size fits · hard max {HARD_MAX_KG} kg</li>
          <li>Similar-size panels share a box (90° rotation is the same size, ±{SIZE_TOL_MM} mm)</li>
          <li>Similar large panels (two 2400 mm at ~35 kg) stack in one carton up to {HARD_MAX_KG} kg</li>
          <li>One leftover panel adds onto a ~{PREFERRED_KG} kg box when it fits, even if the box goes to 26–{HARD_MAX_KG} kg</li>
          <li>Backs thinner than 12 mm pack separately unless they fit under that unit’s highest panel (never bigger)</li>
          <li>Unmatched backs of a unit nest under that unit’s largest back</li>
          <li>Box number format BOX UNIT-i/n</li>
        </ul>
      </Card>
      <Card>
        <h2 className="mb-3 text-sm font-semibold">Audit</h2>
        <ul className="space-y-2">
          {(audit.data ?? []).map((a) => (
            <li key={a.id} className="border-b border-outline pb-2 last:border-0">
              <p className="font-mono text-xs">{a.action}</p>
              <p className="text-sm text-muted">{a.detail}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
