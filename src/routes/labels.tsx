import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { Guard } from "@/components/guard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { getProject, listProjects } from "@/lib/server";
import { formatKg } from "@/lib/utils";
import { useCompanyName } from "@/components/print-docs";

export const Route = createFileRoute("/labels")({ component: Page });

const PANEL_ROWS = 5;

function todayLabel() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function txt(v?: string | number | null) {
  if (v == null) return "";
  return String(v).trim();
}

function dash(v?: string | number | null) {
  const s = txt(v);
  return s || "—";
}

function mm(v?: string | number | null) {
  const n = Number(v);
  if (!Number.isFinite(n)) return txt(v) || "—";
  return String(Math.round(n * 10) / 10).replace(/\.0$/, "");
}

function Page() {
  return (
    <Guard title="Labels" perm="labels">
      <Labels />
    </Guard>
  );
}

function Labels() {
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
  const first = projects.data?.find((p) => p.boxes > 0)?.id ?? projects.data?.[0]?.id;
  const [projectId, setProjectId] = useState<number | null>(null);
  const selected = projectId ?? first ?? 0;
  const detail = useQuery({
    queryKey: ["project", selected],
    queryFn: () => getProject({ data: selected }),
    enabled: selected > 0,
  });
  const company = useCompanyName();

  const stickers = useMemo(() => {
    if (!detail.data) return [];
    const { project, parts, boxes } = detail.data;
    return boxes.map((b, i) => {
      const items = parts.filter((p) => p.box_id === b.id);
      return { box: b, items, project, stickerNo: i + 1, total: boxes.length };
    });
  }, [detail.data]);

  return (
    <div className="space-y-4">
      <style>{`@media print { @page { size: A4 landscape; margin: 8mm 10mm; } }`}</style>
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <Select value={String(selected || "")} onChange={(e) => setProjectId(Number(e.target.value))} className="max-w-sm">
          {(projects.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.name}
            </option>
          ))}
        </Select>
        <Button onClick={() => window.print()} disabled={!stickers.length}>
          <Printer className="size-4" />
          Print stickers · 75×50 mm · 9 / A4
        </Button>
      </div>
      {!stickers.length ? (
        <Card className="no-print">
          <p className="text-sm text-muted">Run packing first. Stickers are 75×50 mm, 9 per A4 sheet.</p>
        </Card>
      ) : (
        <div className="sticker-sheet">
          {stickers.map(({ box, items, project, stickerNo, total }) => {
            const qty = items.reduce((s, p) => s + Number(p.qty || 0), 0);
            const boxNo = `${txt(box.unit)} ${box.seq}/${box.total_seq}`.trim();
            const addr = [txt(project.address), txt(project.city_state), txt(project.client_phone)]
              .filter(Boolean)
              .join("  ·  ");
            const orderNo = txt(project.po_number) || txt(project.code);
            const weight = formatKg(Number(box.total_weight_kg) || 0);
            const shown = items.length > PANEL_ROWS ? items.slice(0, PANEL_ROWS - 1) : items;
            const extra = items.length - shown.length;
            return (
              <article key={box.id} className="sticker">
                <div className="st-pair st-top">
                  <Cell k="COMPANY" v={dash(company)} max={8} className="st-co" />
                  <Cell k="DATE" v={todayLabel()} max={7} mono />
                </div>
                <div className="st-pair">
                  <Cell k="CLIENT" v={dash(project.client_name)} max={7.2} />
                  <Cell k="PROJECT" v={dash(project.name)} max={7.2} />
                </div>
                <div className="st-pair">
                  <Cell k="ORDER NO" v={dash(orderNo)} max={7} mono />
                  <Cell k="STICKER NO" v={`${stickerNo} / ${total}`} max={7} mono />
                </div>
                <div className="st-pair">
                  <Cell k="ADDRESS" v={dash(addr)} max={6.4} />
                  <Cell k="CABINET/UNIT NAME" v={dash(box.unit)} max={6.8} />
                </div>
                <div className="st-hero">
                  <div className="st-hero-col st-hero-box">
                    <span className="st-k">BOX NO</span>
                    <FitText text={boxNo} maxPt={9} minPt={6.2} className="st-v st-mono" />
                  </div>
                  <div className="st-hero-col st-hero-qty">
                    <span className="st-k">ITEM QTY</span>
                    <span className="st-v st-mono">{qty}</span>
                  </div>
                  <div className="st-hero-col st-hero-wt">
                    <span className="st-k">WEIGHT</span>
                    <span className="st-v st-mono">{weight}</span>
                  </div>
                </div>
                <div className="st-parts">
                  <div className="st-parts-h">
                    <span>S NO.</span>
                    <span>UNIT NAME</span>
                    <span>PART NAME</span>
                    <span>Length</span>
                    <span>Width</span>
                    <span>THK</span>
                    <span>QTY</span>
                  </div>
                  {shown.length ? (
                    shown.map((p, i) => (
                      <div key={p.id} className="st-parts-r">
                        <span className="st-mono">{i + 1}</span>
                        <span className="st-pn" title={txt(p.unit)}>
                          {dash(p.unit)}
                        </span>
                        <span className="st-pn" title={txt(p.part_name)}>
                          {dash(p.part_name)}
                        </span>
                        <span className="st-mono">{mm(p.length_mm)}</span>
                        <span className="st-mono">{mm(p.width_mm)}</span>
                        <span className="st-mono">{mm(p.thickness_mm)}</span>
                        <span className="st-mono">{p.qty}</span>
                      </div>
                    ))
                  ) : (
                    <div className="st-parts-r">
                      <span>—</span>
                      <span>—</span>
                      <span>—</span>
                      <span>—</span>
                      <span>—</span>
                      <span>—</span>
                      <span>—</span>
                    </div>
                  )}
                  {extra > 0 ? <div className="st-parts-more">+{extra} more</div> : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Cell({
  k,
  v,
  max,
  min = 5,
  mono,
  invert,
  className,
}: {
  k: string;
  v: string;
  max: number;
  min?: number;
  mono?: boolean;
  invert?: boolean;
  className?: string;
}) {
  return (
    <div className={`st-cell${invert ? " st-inv" : ""}`}>
      <span className="st-k">{k}</span>
      <FitText text={v} maxPt={max} minPt={min} className={`st-v${mono ? " st-mono" : ""}${className ? ` ${className}` : ""}`} />
    </div>
  );
}

function FitText({
  text,
  className,
  minPt,
  maxPt,
}: {
  text: string;
  className?: string;
  minPt: number;
  maxPt: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      let pt = maxPt;
      el.style.fontSize = `${pt}pt`;
      for (let i = 0; i < 28 && pt > minPt; i++) {
        if (el.scrollWidth <= el.clientWidth + 0.5) break;
        pt -= 0.25;
        el.style.fontSize = `${pt}pt`;
      }
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, minPt, maxPt]);
  return (
    <span ref={ref} className={className} title={text}>
      {text}
    </span>
  );
}
