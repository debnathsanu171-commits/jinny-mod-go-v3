import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveWorkOrder } from "@/lib/server";
import { buildWorkOrder, type WorkOrderSeed } from "@/components/work-order-sheet";
import {
  defaultCutlistTemplate,
  emptyManualRow,
  getCutCell,
  newCutlistColumn,
  nextSr,
  paperDims,
  PAPER_PRESETS,
  setCutCell,
  syncCutlistFromUnits,
  type CutlistCol,
  type CutlistDoc,
  type CutlistPaper,
  type CutlistRow,
  type CutlistTemplate,
} from "@/lib/cutlist-bom";

function In({
  value,
  onChange,
  align,
  placeholder,
  bold,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  align?: "c" | "l";
  placeholder?: string;
  bold?: boolean;
  className?: string;
}) {
  return (
    <input
      className={`cl-in${align === "c" ? " cl-in-c" : ""}${bold ? " cl-in-b" : ""}${className ? ` ${className}` : ""}`}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function headerGroups(cols: CutlistCol[]) {
  const out: { group?: string; cols: CutlistCol[]; start: number }[] = [];
  cols.forEach((c, i) => {
    const last = out[out.length - 1];
    if (c.group && last && last.group === c.group) last.cols.push(c);
    else out.push({ group: c.group, cols: [c], start: i });
  });
  return out;
}

export function CutlistSheet({
  projectId,
  subId,
  company,
  seed,
  saved,
  onSaved,
}: {
  projectId: number;
  subId: number;
  company: string;
  seed: WorkOrderSeed;
  saved?: unknown;
  onSaved: () => void;
}) {
  const wo = useMemo(() => buildWorkOrder(seed, saved), [seed, saved]);
  const [doc, setDoc] = useState<CutlistDoc>(() =>
    syncCutlistFromUnits(wo.units, wo.cutlist, {
      product_name: wo.project_name || seed.project_name,
      client_name: wo.customer_name,
      location: wo.delivery_address,
      order_no: wo.order_no,
      date: wo.date,
      delivery_date: wo.expected_delivery,
    }),
  );
  const [editing, setEditing] = useState(false);

  const tpl: CutlistTemplate = {
    ...defaultCutlistTemplate(),
    ...(doc.template ?? {}),
    columns: doc.template?.columns?.length ? doc.template.columns : defaultCutlistTemplate().columns,
  };
  const cols = tpl.columns;
  const groups = headerGroups(cols);
  const hasSub = cols.some((c) => c.group);

  function patch(p: Partial<CutlistDoc>) {
    setDoc((d) => ({ ...d, ...p }));
  }
  function patchTpl(p: Partial<CutlistTemplate>) {
    setDoc((d) => ({ ...d, template: { ...(d.template ?? defaultCutlistTemplate()), ...p } }));
  }
  function patchCols(next: CutlistCol[]) {
    patchTpl({ columns: next });
  }
  function patchCol(i: number, p: Partial<CutlistCol>) {
    patchCols(cols.map((c, n) => (n === i ? { ...c, ...p } : c)));
  }
  function patchRow(id: string, updater: (r: CutlistRow) => CutlistRow) {
    setDoc((d) => ({ ...d, rows: d.rows.map((r) => (r.id === id ? updater(r) : r)) }));
  }

  function addRow() {
    setDoc((d) => {
      const last = [...d.rows].reverse().find((r) => r.unitKey) ?? d.rows[d.rows.length - 1];
      const unitKey = last?.unitKey || "A";
      return { ...d, rows: [...d.rows, emptyManualRow(unitKey, nextSr(d.rows, unitKey))] };
    });
  }
  function removeRow(id: string) {
    setDoc((d) => ({ ...d, rows: d.rows.filter((r) => r.id !== id) }));
  }
  function addCol(after?: number) {
    const next = [...cols];
    next.splice((after ?? cols.length - 1) + 1, 0, newCutlistColumn());
    patchCols(next);
  }
  function removeCol(i: number) {
    if (cols.length <= 2) return;
    patchCols(cols.filter((_, n) => n !== i));
  }

  function rebuild() {
    setDoc(
      syncCutlistFromUnits(wo.units, { ...doc, template: tpl }, {
        product_name: doc.product_name,
        client_name: doc.client_name,
        location: doc.location,
        order_no: doc.order_no,
        date: doc.date,
        delivery_date: doc.delivery_date,
      }),
    );
    toast.success("Cutlist updated from work-order cabinet sizes");
  }

  const save = useMutation({
    mutationFn: () =>
      saveWorkOrder({
        data: { projectId, subId, work_order: { ...wo, cutlist: { ...doc, template: tpl }, notes: wo.notes } },
      }),
    onSuccess: () => {
      toast.success(editing ? "Template saved" : "Cutlist saved");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const factoryLogo = tpl.factoryLogo || company || "FACTORY / COMPANY LOGO";
  const paper = paperDims(tpl);
  const printCss = `@media print { @page { size: ${paper.w}mm ${paper.h}mm; margin: 6mm; } }`;

  return (
    <div className="cl-wrap">
      <style>{printCss}</style>
      <div className="no-print cl-toolbar">
          <Button size="sm" variant={editing ? "default" : "outline"} onClick={() => setEditing((v) => !v)}>
            {editing ? "Done editing" : "Edit template"}
          </Button>
          <Button size="sm" variant="outline" onClick={rebuild}>
            Update from work order
          </Button>
          <Button size="sm" variant="outline" onClick={addRow}>
            Add row
          </Button>
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            Print {tpl.paperSize}
          </Button>
      </div>

        {editing ? (
          <div className="no-print cl-editbar">
            <label>
              Title
              <input value={tpl.title} onChange={(e) => patchTpl({ title: e.target.value })} />
            </label>
            <label>
              Left logo
              <input value={tpl.appLogo} onChange={(e) => patchTpl({ appLogo: e.target.value })} />
            </label>
            <label>
              Right logo
              <input
                value={tpl.factoryLogo}
                placeholder={company}
                onChange={(e) => patchTpl({ factoryLogo: e.target.value })}
              />
            </label>
            <label>
              Paper
              <select
                value={tpl.paperSize}
                onChange={(e) => patchTpl({ paperSize: e.target.value as CutlistPaper })}
              >
                {(Object.keys(PAPER_PRESETS) as Array<keyof typeof PAPER_PRESETS>).map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
                <option value="Custom">Custom</option>
              </select>
            </label>
            <label>
              Side
              <select
                value={tpl.orientation}
                onChange={(e) => patchTpl({ orientation: e.target.value as "portrait" | "landscape" })}
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </label>
            {tpl.paperSize === "Custom" ? (
              <>
                <label>
                  Width mm
                  <input
                    type="number"
                    min={80}
                    max={1200}
                    value={tpl.customW}
                    onChange={(e) => patchTpl({ customW: Number(e.target.value) || 297 })}
                  />
                </label>
                <label>
                  Height mm
                  <input
                    type="number"
                    min={80}
                    max={1200}
                    value={tpl.customH}
                    onChange={(e) => patchTpl({ customH: Number(e.target.value) || 210 })}
                  />
                </label>
              </>
            ) : null}
            <div className="cl-papersize">
              {paper.w} × {paper.h} mm
            </div>
            <label>
              Font {tpl.fontSize}px
              <input
                type="range"
                min={7}
                max={12}
                value={tpl.fontSize}
                onChange={(e) => patchTpl({ fontSize: Number(e.target.value) })}
              />
            </label>
            <label>
              Cell {tpl.rowHeight}px
              <input
                type="range"
                min={16}
                max={36}
                value={tpl.rowHeight}
                onChange={(e) => patchTpl({ rowHeight: Number(e.target.value) })}
              />
            </label>
            <Button size="sm" variant="outline" onClick={() => addCol()}>
              + Column
            </Button>
            <Button size="sm" variant="ghost" onClick={() => patchTpl(defaultCutlistTemplate())}>
              Reset template
            </Button>
          </div>
        ) : null}

        <div className="cl-stage">
          <div className="cl-paper">
        <div
          className={`cl-frame${editing ? " cl-editing" : ""}`}
          style={{
            ["--cl-fs" as string]: `${tpl.fontSize}px`,
            ["--cl-rh" as string]: `${tpl.rowHeight}px`,
          }}
        >
          <div className="cl-head">
            <div className="cl-logo cl-logo-app">
              {editing ? (
                <input className="cl-in cl-in-b cl-in-c" value={tpl.appLogo} onChange={(e) => patchTpl({ appLogo: e.target.value })} />
              ) : (
                tpl.appLogo || "JINNY MOD GO"
              )}
            </div>
            <div className="cl-mid">
              <div className="cl-mid-grid">
                <div className="cl-title">
                  {editing ? (
                    <input className="cl-in cl-in-b cl-in-c" value={tpl.title} onChange={(e) => patchTpl({ title: e.target.value })} />
                  ) : (
                    tpl.title
                  )}
                </div>
                <span className="cl-hlab">ORDER NO</span>
                <In className="cl-end" value={doc.order_no} onChange={(v) => patch({ order_no: v })} />
                <span className="cl-hlab">PRODUCT NAME :-</span>
                <In value={doc.product_name} onChange={(v) => patch({ product_name: v })} />
                <span className="cl-hlab">DATE:-</span>
                <In className="cl-end" value={doc.date} onChange={(v) => patch({ date: v })} />
                <span className="cl-hlab">CLIENT NAME :-</span>
                <In value={doc.client_name} onChange={(v) => patch({ client_name: v })} />
                <span className="cl-hlab">DELIVERY DATE:-</span>
                <In className="cl-end" value={doc.delivery_date} onChange={(v) => patch({ delivery_date: v })} />
                <span className="cl-hlab cl-last">LOCATION :-</span>
                <In className="cl-last" value={doc.location} onChange={(v) => patch({ location: v })} />
                <span className="cl-hlab cl-last">ITEM QTY</span>
                <In className="cl-end cl-last" align="c" value={doc.qty} onChange={(v) => patch({ qty: v })} />
              </div>
            </div>
            <div className="cl-logo cl-logo-factory">
              {editing ? (
                <input
                  className="cl-in cl-in-b cl-in-c"
                  value={tpl.factoryLogo}
                  placeholder={company}
                  onChange={(e) => patchTpl({ factoryLogo: e.target.value })}
                />
              ) : (
                factoryLogo
              )}
            </div>
          </div>

          <table className="cl-table">
            <colgroup>
              {cols.map((c) => (
                <col key={c.id} style={{ width: c.width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {groups.map((g, gi) =>
                  g.group ? (
                    <th key={`g-${gi}`} colSpan={g.cols.length}>
                      {editing ? (
                        <input
                          className="cl-in cl-in-b cl-in-c"
                          value={g.group}
                          onChange={(e) => {
                            const name = e.target.value;
                            patchCols(
                              cols.map((c) => (g.cols.some((x) => x.id === c.id) ? { ...c, group: name } : c)),
                            );
                          }}
                        />
                      ) : (
                        g.group
                      )}
                    </th>
                  ) : (
                    <th key={g.cols[0].id} rowSpan={hasSub ? 2 : 1}>
                      <HeadCell
                        col={g.cols[0]}
                        editing={editing}
                        index={g.start}
                        onPatch={(p) => patchCol(g.start, p)}
                        onRemove={() => removeCol(g.start)}
                        onAdd={() => addCol(g.start)}
                      />
                    </th>
                  ),
                )}
              </tr>
              {hasSub ? (
                <tr>
                  {cols
                    .map((c, i) => ({ c, i }))
                    .filter(({ c }) => c.group)
                    .map(({ c, i }) => (
                      <th key={c.id}>
                        <HeadCell
                          col={c}
                          editing={editing}
                          index={i}
                          sub
                          onPatch={(p) => patchCol(i, p)}
                          onRemove={() => removeCol(i)}
                          onAdd={() => addCol(i)}
                        />
                      </th>
                    ))}
                </tr>
              ) : null}
            </thead>
            <tbody>
              {doc.rows.length === 0 ? (
                <tr>
                  <td colSpan={cols.length} className="cl-empty">
                    Work order me cabinet size fill karke Save karo, ya Add row se manual part daalo.
                  </td>
                </tr>
              ) : (
                doc.rows.map((r) => (
                  <tr key={r.id} className={r.kind === "unit" ? "cl-unit" : undefined}>
                    {cols.map((c) => (
                      <td key={c.id}>
                        {c.id === "description" ? (
                          <div className="cl-desc-cell">
                            <In
                              bold={r.kind === "unit"}
                              align={c.align}
                              value={getCutCell(r, c.id)}
                              placeholder={r.kind === "unit" ? "UNIT NAME" : "TOP"}
                              onChange={(v) => patchRow(r.id, (row) => setCutCell(row, c.id, v))}
                            />
                            <button type="button" className="no-print cl-del" onClick={() => removeRow(r.id)} title="Remove row">
                              ×
                            </button>
                          </div>
                        ) : (
                          <In
                            bold={r.kind === "unit" && c.id === "sr"}
                            align={c.align}
                            value={getCutCell(r, c.id)}
                            onChange={(v) => patchRow(r.id, (row) => setCutCell(row, c.id, v))}
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
          </div>
        </div>
    </div>
  );
}

function HeadCell({
  col,
  editing,
  sub,
  onPatch,
  onRemove,
  onAdd,
}: {
  col: CutlistCol;
  editing: boolean;
  index: number;
  sub?: boolean;
  onPatch: (p: Partial<CutlistCol>) => void;
  onRemove: () => void;
  onAdd: () => void;
}) {
  if (!editing) return <>{col.label}</>;
  return (
    <div className="cl-headcell">
      <input className="cl-in cl-in-b cl-in-c" value={col.label} onChange={(e) => onPatch({ label: e.target.value })} />
      <div className="cl-headtools">
        <button type="button" onClick={() => onPatch({ width: Math.max(28, col.width - 8) })} title="Narrower">
          −
        </button>
        <span>{col.width}</span>
        <button type="button" onClick={() => onPatch({ width: Math.min(180, col.width + 8) })} title="Wider">
          +
        </button>
        <button type="button" onClick={onAdd} title="Add column after">
          ▸+
        </button>
        <button type="button" onClick={onRemove} title="Remove column">
          ×
        </button>
      </div>
    </div>
  );
}
