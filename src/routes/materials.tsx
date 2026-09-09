import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Guard } from "@/components/guard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { listMaterials, saveMaterial } from "@/lib/server";
import { closestBoard, fullBoardKg } from "@/lib/weight";

const FAMILIES = [
  "LAMINATED_HDHMR",
  "PLAIN_HDHMR",
  "LAMINATED_MDF",
  "PLAIN_MDF",
  "LAMINATED_PARTICLE",
  "PLAIN_PARTICLE",
  "LAMINATED_BOILO",
  "PLAIN_BOILO",
  "LAMINATED_HMR_PARTICLE",
];

export const Route = createFileRoute("/materials")({ component: Page });

function Page() {
  return (
    <Guard title="Materials" perm="materials">
      <Materials />
    </Guard>
  );
}

function Materials() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["materials"], queryFn: () => listMaterials() });
  const [shortName, setShortName] = useState("");
  const [fullName, setFullName] = useState("");
  const [family, setFamily] = useState("LAMINATED_HDHMR");
  const [lam, setLam] = useState("BSL");
  const [th, setTh] = useState("18");

  const save = useMutation({
    mutationFn: () =>
      saveMaterial({
        data: {
          short_name: shortName.trim().toUpperCase(),
          full_name: fullName.trim(),
          family,
          lam,
          thickness_mm: Number(th) || undefined,
        },
      }),
    onSuccess: async () => {
      toast.success("Material saved");
      setShortName("");
      setFullName("");
      await qc.invalidateQueries({ queryKey: ["materials"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const preview = fullBoardKg({ family, th: Number(th) || 18, lam, mode: "prelam" });
  const fav = fullBoardKg({ family, th: Number(th) || 18, lam, mode: "favicol" });
  const row = closestBoard(family, Number(th) || 18, lam);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Short names used in CSV. Board kilograms come from the locked Action Tesa catalog — they cannot be edited here.
      </p>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-3 lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Short name</Label>
              <Input value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="HDHMR" className="uppercase" />
            </div>
            <div>
              <Label>Full name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Laminated HDHMR" />
            </div>
            <div>
              <Label>Family</Label>
              <Select value={family} onChange={(e) => setFamily(e.target.value)}>
                {FAMILIES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Lamination</Label>
              <Select value={lam} onChange={(e) => setLam(e.target.value)}>
                {["BSL", "OSL", "BSB", "OSR", "ORD", "PLAIN"].map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Thickness mm</Label>
              <Input value={th} onChange={(e) => setTh(e.target.value)} />
            </div>
          </div>
          <Button disabled={!shortName.trim() || !fullName.trim() || save.isPending} onClick={() => save.mutate()}>
            Save material
          </Button>
        </Card>
        <Card>
          <h3 className="text-sm font-semibold">8×4 board preview</h3>
          <p className="mt-2 font-mono text-xs text-muted">SKU {row?.sku ?? preview.sku}</p>
          <p className="mt-3 text-sm text-muted">Prelam catalog</p>
          <p className="font-mono text-xl">{preview.kg.toFixed(3)} kg</p>
          <p className="mt-3 text-sm text-muted">Favicol paste (2-side if BSL)</p>
          <p className="font-mono text-xl">{fav.kg.toFixed(3)} kg</p>
        </Card>
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-outline bg-surface-low text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Short</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Family</th>
              <th className="px-4 py-3 font-medium">Lam</th>
              <th className="px-4 py-3 font-medium">mm</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {(q.data ?? []).map((m) => (
              <tr key={m.id} className="border-b border-outline last:border-0">
                <td className="px-4 py-3 font-mono text-xs">{m.short_name}</td>
                <td className="px-4 py-3">{m.full_name}</td>
                <td className="px-4 py-3 font-mono text-xs">{m.family}</td>
                <td className="px-4 py-3">{m.lam}</td>
                <td className="px-4 py-3 font-mono">{m.thickness_mm ?? "—"}</td>
                <td className="px-4 py-3">
                  <Badge tone={m.active ? "ok" : "muted"}>{m.active ? "active" : "off"}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
