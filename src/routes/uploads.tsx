import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Download, FileSpreadsheet } from "lucide-react";
import { Guard } from "@/components/guard";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { importCsv, listProjects } from "@/lib/server";
import { CSV_TEMPLATE } from "@/lib/csv";
import { downloadTextFile } from "@/lib/download";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/uploads")({ component: Page });

function Page() {
  return (
    <Guard title="CSV Upload" perm="uploads">
      <Uploads />
    </Guard>
  );
}

function Uploads() {
  const qc = useQueryClient();
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const [projectId, setProjectId] = useState("");
  const [fileName, setFileName] = useState("");
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ imported: number; issues: { line: number; field: string; message: string }[] } | null>(null);

  const selected = Number(projectId) || (projects.data?.[0]?.id ?? 0);

  const run = useMutation({
    mutationFn: (payload: { fileName: string; text: string }) =>
      importCsv({ data: { projectId: selected, fileName: payload.fileName, text: payload.text } }),
    onSuccess: async (r) => {
      setResult({ imported: r.imported, issues: r.issues });
      if (r.ok) {
        toast.success(`${r.imported} rows imported`);
        await qc.invalidateQueries({ queryKey: ["projects"] });
        await qc.invalidateQueries({ queryKey: ["project", selected] });
        await qc.invalidateQueries({ queryKey: ["dashboard"] });
      } else {
        toast.error("CSV has blocking errors");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onFile(file: File) {
    setFileName(file.name);
    file.text().then(setText);
  }

  async function copyTemplate() {
    try {
      await navigator.clipboard.writeText(CSV_TEMPLATE);
      toast.success("CSV template copied");
    } catch {
      downloadTextFile("jinny-mod-go-cutlist.csv", CSV_TEMPLATE);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Required columns: Unit, Part Name, Length (mm), Width (mm), Thickness (mm), Material, Quantity. Weights use the locked Excel catalog or Favicol paste, based on the project mode.
      </p>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-3 lg:col-span-2">
          <div>
            <Label>Project</Label>
            {projects.data?.length === 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/50 dark:text-amber-200 mt-1">
                You haven't created any projects yet. Please <Link to="/projects" className="font-bold underline">create a project</Link> first before uploading a cut-list.
              </div>
            ) : (
              <Select value={String(selected || "")} onChange={(e) => setProjectId(e.target.value)}>
                {(projects.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name} ({p.lam_mode})
                  </option>
                ))}
              </Select>
            )}
          </div>
          <label className={cn("flex min-h-40 flex-col items-center justify-center rounded-md border border-dashed border-outline bg-surface-low text-sm text-muted", projects.data?.length === 0 ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-surface-container")}>
            <FileSpreadsheet className="mb-2 size-8" />
            {fileName || "Drop CSV here or click to choose"}
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={projects.data?.length === 0}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!selected || !text || run.isPending} onClick={() => run.mutate({ fileName: fileName || "upload.csv", text })}>
              {run.isPending ? "Importing…" : "Validate & import"}
            </Button>
            <Button
              variant="outline"
              disabled={!selected || run.isPending}
              onClick={() => {
                setFileName("sample-cutlist.csv");
                setText(CSV_TEMPLATE);
                run.mutate({ fileName: "sample-cutlist.csv", text: CSV_TEMPLATE });
              }}
            >
              Load sample cut-list
            </Button>
            <a
              href="/jinny-mod-go-cutlist.csv"
              download="jinny-mod-go-cutlist.csv"
              target="_blank"
              rel="noopener"
              className={cn(buttonVariants({ variant: "outline" }))}
              onClick={(e) => {
                const framed = typeof window !== "undefined" && window.parent !== window;
                if (!framed) {
                  e.preventDefault();
                  downloadTextFile("jinny-mod-go-cutlist.csv", CSV_TEMPLATE);
                }
                toast.success("CSV template downloading");
              }}
            >
              <Download className="size-4" />
              Download template
            </a>
            <Button variant="ghost" onClick={() => void copyTemplate()}>
              Copy template
            </Button>
          </div>
        </Card>
        <Card>
          <h3 className="mb-2 text-sm font-semibold">Material shorts</h3>
          <ul className="space-y-1 font-mono text-xs text-muted">
            <li>HDHMR — laminated HDHMR BSL</li>
            <li>MDF-WHITE — laminated MDF BSL</li>
            <li>PART-GRY — laminated particle</li>
            <li>MDF-RAW — plain MDF</li>
            <li>BOILO — laminated boilo</li>
          </ul>
        </Card>
      </div>
      {result ? (
        <Card>
          <p className="text-sm">
            Imported <span className="font-mono font-semibold">{result.imported}</span> rows
            {result.issues.length ? ` · ${result.issues.length} notes` : ""}
          </p>
          {result.issues.length ? (
            <ul className="mt-3 space-y-1 text-sm">
              {result.issues.map((i, idx) => (
                <li key={idx} className="font-mono text-xs text-warn">
                  Line {i.line} · {i.field}: {i.message}
                </li>
              ))}
            </ul>
          ) : null}
          {result.imported > 0 ? (
            <Link to="/projects/$id" params={{ id: String(selected) }} className="mt-3 inline-block text-sm underline-offset-2 hover:underline">
              Open project and run packing
            </Link>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}