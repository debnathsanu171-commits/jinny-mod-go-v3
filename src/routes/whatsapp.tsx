import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Guard } from "@/components/guard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, statusTone } from "@/components/ui/badge";
import { listWhatsapp, sendWhatsapp } from "@/lib/server";

export const Route = createFileRoute("/whatsapp")({ component: Page });

function Page() {
  return (
    <Guard title="WhatsApp" perm="whatsapp">
      <WhatsApp />
    </Guard>
  );
}

function WhatsApp() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["whatsapp"], queryFn: () => listWhatsapp() });
  const send = useMutation({
    mutationFn: (id: number) => sendWhatsapp({ data: id }),
    onSuccess: async () => {
      toast.success("Marked sent");
      await qc.invalidateQueries({ queryKey: ["whatsapp"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Dispatch events queue a client + owner message. Mark sent after the operator posts it on WhatsApp.
      </p>
      {(q.data ?? []).length === 0 ? (
        <Card>
          <p className="text-sm text-muted">No messages yet. Dispatch a load to queue the first one.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {(q.data ?? []).map((m) => (
            <Card key={m.id} className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{m.template_name}</p>
                  <p className="text-xs text-muted">{m.recipient}</p>
                </div>
                <Badge tone={statusTone(m.status)}>{m.status}</Badge>
              </div>
              <p className="rounded-md bg-surface-low p-3 text-sm">{m.body}</p>
              {m.status !== "sent" ? (
                <Button size="sm" onClick={() => send.mutate(m.id)} disabled={send.isPending}>
                  Mark sent
                </Button>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
