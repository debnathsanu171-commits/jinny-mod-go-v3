import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ScanLine } from "lucide-react";
import { toast } from "sonner";
import { Guard } from "@/components/guard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, statusTone } from "@/components/ui/badge";
import { findBoxByCode, verifyBox } from "@/lib/server";
import { formatKg } from "@/lib/utils";

export const Route = createFileRoute("/floor")({ component: Page });

function Page() {
  return (
    <Guard title="Floor scan" perm="floor">
      <Floor />
    </Guard>
  );
}

function Floor() {
  const [code, setCode] = useState("");
  const lookup = useMutation({
    mutationFn: (c: string) => findBoxByCode({ data: c }),
    onError: (e: Error) => toast.error(e.message),
  });
  const verify = useMutation({
    mutationFn: (boxId: number) => verifyBox({ data: { boxId, verified: true } }),
    onSuccess: async () => {
      toast.success("Box verified on floor");
      if (code) lookup.mutate(code);
    },
  });

  const box = lookup.data?.box;
  const parts = lookup.data?.parts ?? [];

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Card className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted">
          <ScanLine className="size-4" />
          Enter or scan BOX UNIT-i/n
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) lookup.mutate(code.trim());
          }}
        >
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="BOX BED01-1/2"
            className="h-11 text-base"
            autoCapitalize="characters"
          />
          <Button className="h-11" type="submit" disabled={!code.trim() || lookup.isPending}>
            Scan
          </Button>
        </form>
      </Card>
      {lookup.isSuccess && !box ? (
        <Card>
          <p className="text-sm text-danger">No box matched that code.</p>
        </Card>
      ) : null}
      {box ? (
        <Card className="space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono text-lg font-bold">{box.box_number}</p>
              <p className="text-sm text-muted">
                {box.project_code} · {box.unit}
              </p>
            </div>
            <Badge tone={statusTone(box.status)}>{box.status}</Badge>
          </div>
          <p className="font-mono text-xl">{formatKg(Number(box.total_weight_kg))}</p>
          <ul className="space-y-1 text-sm">
            {parts.map((p, i) => (
              <li key={i} className="flex justify-between">
                <span>
                  {p.part_name} <span className="text-muted">×{p.qty}</span>
                </span>
                <span className="font-mono text-xs">{p.material}</span>
              </li>
            ))}
          </ul>
          {!box.verified ? (
            <Button className="h-11 w-full" onClick={() => verify.mutate(box.id)} disabled={verify.isPending}>
              Verify on floor
            </Button>
          ) : (
            <p className="text-sm text-ok">Verified</p>
          )}
        </Card>
      ) : null}
    </div>
  );
}
