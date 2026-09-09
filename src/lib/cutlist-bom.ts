export type CutlistUnitSrc = {
  sl: string;
  description: string;
  width: string;
  depth: string;
  height: string;
  qty: string;
  material: string;
  outer: string;
  inner: string;
  remark: string;
};

export type CutlistRow = {
  id: string;
  kind: "unit" | "part";
  unitKey: string;
  sr: string;
  description: string;
  width: string;
  depth: string;
  height: string;
  cutW: string;
  cutD: string;
  qty: string;
  material: string;
  colourTop: string;
  colourBottom: string;
  l1: string;
  l3: string;
  w2: string;
  w3: string;
  eb22x2: string;
  eb22x08: string;
  remark: string;
  source: "auto" | "manual";
  partType?: string;
  extra?: Record<string, string>;
};

export type CutlistCol = {
  id: string;
  label: string;
  sub?: string;
  group?: string;
  width: number;
  align?: "c" | "l";
};

export type CutlistPaper =
  | "A5"
  | "A4"
  | "A3"
  | "A2"
  | "Letter"
  | "Legal"
  | "Tabloid"
  | "Custom";

export type CutlistTemplate = {
  title: string;
  appLogo: string;
  factoryLogo: string;
  fontSize: number;
  rowHeight: number;
  sheetWidth: number;
  paperSize: CutlistPaper;
  orientation: "portrait" | "landscape";
  customW: number;
  customH: number;
  columns: CutlistCol[];
};

export const PAPER_PRESETS: Record<Exclude<CutlistPaper, "Custom">, [number, number]> = {
  A5: [148, 210],
  A4: [210, 297],
  A3: [297, 420],
  A2: [420, 594],
  Letter: [216, 279],
  Legal: [216, 356],
  Tabloid: [279, 432],
};

export function paperDims(tpl: Pick<CutlistTemplate, "paperSize" | "orientation" | "customW" | "customH">) {
  const base =
    tpl.paperSize === "Custom"
      ? [Math.max(80, tpl.customW || 297), Math.max(80, tpl.customH || 210)]
      : PAPER_PRESETS[tpl.paperSize] || PAPER_PRESETS.A4;
  const [pw, ph] = base;
  return tpl.orientation === "landscape" ? { w: ph, h: pw } : { w: pw, h: ph };
}

export type CutlistDoc = {
  product_name: string;
  client_name: string;
  location: string;
  order_no: string;
  date: string;
  delivery_date: string;
  qty: string;
  panel_thk: string;
  back_thk: string;
  cut_allow: string;
  rebate: string;
  eb_code_a: string;
  eb_code_b: string;
  rows: CutlistRow[];
  template?: CutlistTemplate;
};

export type CutlistMeta = {
  product_name: string;
  client_name: string;
  location: string;
  order_no: string;
  date: string;
  delivery_date: string;
};

function n(v: string | number | undefined) {
  const x = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(x) ? x : 0;
}
function mm(v: number) {
  return String(Math.round(v));
}
function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}
function letter(i: number) {
  return String.fromCharCode(65 + (i % 26));
}
function rsqm(w: number, d: number, qty: number) {
  if (w <= 0 || d <= 0) return "";
  return ((w * d * Math.max(1, qty)) / 100000).toFixed(3);
}

function emptyFields() {
  return { l1: "", l3: "", w2: "", w3: "", eb22x2: "", eb22x08: "", remark: "" };
}

function keepUser(old: CutlistRow | undefined, generated: CutlistRow): CutlistRow {
  if (!old) return generated;
  return {
    ...generated,
    id: old.id || generated.id,
    colourTop: old.colourTop || generated.colourTop,
    colourBottom: old.colourBottom || generated.colourBottom,
    l1: old.l1,
    l3: old.l3,
    w2: old.w2,
    w3: old.w3,
    eb22x2: old.eb22x2 || generated.eb22x2,
    eb22x08: generated.eb22x08,
    remark: old.remark || generated.remark,
    material: old.material || generated.material,
    extra: { ...generated.extra, ...old.extra },
  };
}

export function defaultCutlistTemplate(): CutlistTemplate {
  const col = (id: string, label: string, width: number, extra?: Partial<CutlistCol>): CutlistCol => ({
    id,
    label,
    width,
    align: "c",
    ...extra,
  });
  return {
    title: "CUTTING LIST",
    appLogo: "JINNY MOD GO",
    factoryLogo: "",
    fontSize: 8,
    rowHeight: 20,
    sheetWidth: 1122,
    paperSize: "A4",
    orientation: "landscape",
    customW: 297,
    customH: 210,
    columns: [
      col("sr", "SR.NO", 28, { align: "c" }),
      col("description", "Description", 88, { align: "l" }),
      col("width", "Width", 44),
      col("depth", "Depth", 44),
      col("height", "Height", 44),
      col("cutW", "Width", 44, { group: "Cutting Size" }),
      col("cutD", "Depth", 44, { group: "Cutting Size" }),
      col("qty", "Qty", 32),
      col("material", "Material", 58),
      col("colourTop", "Top", 54, { group: "Colour" }),
      col("colourBottom", "Bottom", 54, { group: "Colour" }),
      col("l1", "L-1", 36, { group: "EDGE BANDING DETAILS" }),
      col("l3", "L-3", 36, { group: "EDGE BANDING DETAILS" }),
      col("w2", "W-2", 36, { group: "EDGE BANDING DETAILS" }),
      col("w3", "W3", 36, { group: "EDGE BANDING DETAILS" }),
      col("eb22x2", "EB CODE", 56),
      col("eb22x08", "RSQM", 46),
      col("remark", "REMARK", 72, { align: "l" }),
    ],
  };
}

const ROW_KEYS = new Set([
  "sr",
  "description",
  "width",
  "depth",
  "height",
  "cutW",
  "cutD",
  "qty",
  "material",
  "colourTop",
  "colourBottom",
  "l1",
  "l3",
  "w2",
  "w3",
  "eb22x2",
  "eb22x08",
  "remark",
]);

export function getCutCell(row: CutlistRow, colId: string): string {
  if (ROW_KEYS.has(colId)) return String((row as unknown as Record<string, unknown>)[colId] ?? "");
  return row.extra?.[colId] ?? "";
}

export function setCutCell(row: CutlistRow, colId: string, value: string): CutlistRow {
  if (ROW_KEYS.has(colId)) return { ...row, [colId]: value };
  return { ...row, extra: { ...row.extra, [colId]: value } };
}

export function newCutlistColumn(): CutlistCol {
  return { id: uid("col"), label: "NEW", width: 52, align: "c" };
}

export function emptyCutlist(meta?: Partial<CutlistMeta>): CutlistDoc {
  return {
    product_name: meta?.product_name ?? "",
    client_name: meta?.client_name ?? "",
    location: meta?.location ?? "",
    order_no: meta?.order_no ?? "",
    date: meta?.date ?? "",
    delivery_date: meta?.delivery_date ?? "",
    qty: "",
    panel_thk: "19",
    back_thk: "9",
    cut_allow: "2",
    rebate: "10",
    eb_code_a: "22X1.5",
    eb_code_b: "22X0.8",
    rows: [],
    template: defaultCutlistTemplate(),
  };
}

export function emptyManualRow(unitKey: string, sr: string): CutlistRow {
  return {
    id: uid("m"),
    kind: "part",
    unitKey,
    sr,
    description: "",
    width: "",
    depth: "",
    height: "",
    cutW: "",
    cutD: "",
    qty: "1",
    material: "",
    colourTop: "",
    colourBottom: "",
    ...emptyFields(),
    source: "manual",
    partType: "CUSTOM",
  };
}

export function explodeUnit(
  unit: CutlistUnitSrc,
  unitKey: string,
  thk = 19,
  backThk = 9,
  cutAllow = 2,
  rebate = 10,
): CutlistRow[] {
  const W = n(unit.width);
  const D = n(unit.depth);
  const H = n(unit.height);
  const Q = Math.max(1, n(unit.qty) || 1);
  const material = unit.material || "";
  const colourTop = unit.outer || "";
  const colourBottom = unit.inner || unit.outer || "";
  const desc = unit.description || "CARCASS";

  if (W <= 0 && D <= 0 && H <= 0) return [];

  const isPanel = H > 0 && H <= 30;

  if (isPanel) {
    const cutW = Math.max(0, W - cutAllow);
    const cutD = Math.max(0, D - cutAllow);
    return [
      {
        id: uid("p"),
        kind: "part",
        unitKey,
        sr: unitKey,
        description: desc,
        width: mm(W),
        depth: mm(D),
        height: mm(H || thk),
        cutW: mm(cutW),
        cutD: mm(cutD),
        qty: String(Q),
        material,
        colourTop,
        colourBottom,
        ...emptyFields(),
        eb22x08: rsqm(W, D, Q),
        remark: unit.remark || "",
        source: "auto",
        partType: /shelf/i.test(desc) ? "SHELF" : "PANEL",
      },
    ];
  }

  const tbW = Math.max(0, W - 2 * thk);
  const tbCutW = Math.max(0, tbW - cutAllow);
  const tbCutD = Math.max(0, D - cutAllow);
  const sideCutW = Math.max(0, H - cutAllow);
  const sideCutD = Math.max(0, D - cutAllow);
  const backW = Math.max(0, W - 2 * rebate);
  const backH = Math.max(0, H - 2 * rebate);

  const header: CutlistRow = {
    id: uid("u"),
    kind: "unit",
    unitKey,
    sr: unitKey,
    description: desc,
    width: W ? mm(W) : "",
    depth: D ? mm(D) : "",
    height: H ? mm(H) : "",
    cutW: String(Q),
    cutD: "",
    qty: "",
    material: "",
    colourTop: "",
    colourBottom: "",
    ...emptyFields(),
    remark: unit.remark || "",
    source: "auto",
    partType: "UNIT",
  };

  const mk = (
    sr: string,
    partType: string,
    width: number,
    depth: number,
    height: number,
    cutW: number,
    cutD: number,
    withEb: boolean,
  ): CutlistRow => ({
    id: uid("p"),
    kind: "part",
    unitKey,
    sr,
    description: partType,
    width: mm(width),
    depth: mm(depth),
    height: mm(height),
    cutW: mm(cutW),
    cutD: mm(cutD),
    qty: String(Q),
    material,
    colourTop,
    colourBottom,
    ...emptyFields(),
    eb22x08: withEb ? rsqm(width, depth, Q) : "",
    source: "auto",
    partType,
  });

  return [
    header,
    mk("1", "TOP", tbW, D, thk, tbCutW, tbCutD, true),
    mk("2", "BOTTOM", tbW, D, thk, tbCutW, tbCutD, true),
    mk("3", "LH SIDE", H, D, thk, sideCutW, sideCutD, true),
    mk("4", "RH SIDE", H, D, thk, sideCutW, sideCutD, true),
    mk("5", "BACK", backW, backH, backThk, backW, backH, false),
  ];
}

export function syncCutlistFromUnits(
  units: CutlistUnitSrc[],
  prev?: CutlistDoc | null,
  meta?: Partial<CutlistMeta>,
): CutlistDoc {
  const base = emptyCutlist({
    product_name: meta?.product_name || prev?.product_name,
    client_name: meta?.client_name || prev?.client_name,
    location: meta?.location || prev?.location,
    order_no: meta?.order_no || prev?.order_no,
    date: meta?.date || prev?.date,
    delivery_date: meta?.delivery_date || prev?.delivery_date,
  });
  const panelThk = n(prev?.panel_thk) || 19;
  const backThk = n(prev?.back_thk) || 9;
  const cutAllow = n(prev?.cut_allow) || 2;
  const rebate = n(prev?.rebate) || 10;
  const prevRows = prev?.rows ?? [];
  const prevAuto = prevRows.filter((r) => r.source === "auto");
  const manuals = prevRows.filter((r) => r.source === "manual");

  const rows: CutlistRow[] = [];
  const usedKeys = new Set<string>();

  units.forEach((u, i) => {
    const key = (u.sl || letter(i)).trim() || letter(i);
    usedKeys.add(key);
    const generated = explodeUnit(u, key, panelThk, backThk, cutAllow, rebate);
    for (const g of generated) {
      const old = prevAuto.find(
        (p) => p.unitKey === key && p.kind === g.kind && (g.kind === "unit" || p.partType === g.partType),
      );
      rows.push(keepUser(old, g));
    }
    rows.push(...manuals.filter((m) => m.unitKey === key));
  });

  rows.push(...manuals.filter((m) => !usedKeys.has(m.unitKey)));

  const qtySum = units.reduce((s, u) => s + Math.max(0, n(u.qty) || 0), 0);
  return {
    ...base,
    panel_thk: prev?.panel_thk || "19",
    back_thk: prev?.back_thk || "9",
    cut_allow: prev?.cut_allow || "2",
    rebate: prev?.rebate || "10",
    eb_code_a: prev?.eb_code_a || "22X1.5",
    eb_code_b: prev?.eb_code_b || "22X0.8",
    qty: qtySum ? String(qtySum) : prev?.qty || "",
    rows,
    template: prev?.template || defaultCutlistTemplate(),
  };
}

export function nextSr(rows: CutlistRow[], unitKey: string) {
  const nums = rows
    .filter((r) => r.unitKey === unitKey && r.kind === "part")
    .map((r) => Number(r.sr))
    .filter((x) => Number.isFinite(x) && x > 0);
  return String((nums.length ? Math.max(...nums) : 0) + 1);
}
