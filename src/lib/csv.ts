export type CsvRow = {
  line: number;
  unit: string;
  partName: string;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  material: string;
  qty: number;
  priority: string;
  notes: string;
};

export type CsvIssue = { line: number; field: string; message: string };

const REQUIRED = [
  "unit",
  "part name",
  "length (mm)",
  "length",
  "width (mm)",
  "width",
  "thickness (mm)",
  "thickness",
  "material",
  "quantity",
];

export function parseCsv(text: string): { rows: CsvRow[]; issues: CsvIssue[]; headers: string[] } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim().length);
  const issues: CsvIssue[] = [];
  if (!lines.length) return { rows: [], issues: [{ line: 0, field: "file", message: "Empty CSV" }], headers: [] };

  const headers = splitLine(lines[0]).map((h) => h.trim());
  const idx = (names: string[]) => {
    const n = names.map((x) => x.toLowerCase());
    return headers.findIndex((h) => n.includes(h.toLowerCase()));
  };
  const iUnit = idx(["unit"]);
  const iPart = idx(["part name", "part", "description"]);
  const iL = idx(["length (mm)", "length", "l"]);
  const iW = idx(["width (mm)", "width", "w"]);
  const iT = idx(["thickness (mm)", "thickness", "t"]);
  const iMat = idx(["material"]);
  const iQty = idx(["quantity", "qty", "no. of boards", "boards"]);
  const iPri = idx(["priority"]);
  const iNotes = idx(["notes", "remarks"]);

  if (iUnit < 0 || iPart < 0 || iL < 0 || iW < 0 || iT < 0 || iMat < 0 || iQty < 0) {
    issues.push({
      line: 1,
      field: "headers",
      message: "Required columns: Unit, Part Name, Length (mm), Width (mm), Thickness (mm), Material, Quantity",
    });
    return { rows: [], issues, headers };
  }

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    const line = i + 1;
    const unit = (cols[iUnit] ?? "").trim();
    const partName = (cols[iPart] ?? "").trim();
    const material = (cols[iMat] ?? "").trim();
    const lengthMm = num(cols[iL]);
    const widthMm = num(cols[iW]);
    const thicknessMm = num(cols[iT]);
    const qty = Math.round(num(cols[iQty]));
    const priority = ((iPri >= 0 ? cols[iPri] : "") || "Normal").trim() || "Normal";
    const notes = (iNotes >= 0 ? cols[iNotes] : "")?.trim() ?? "";

    if (!unit && !partName && !material && !lengthMm && !qty) continue;
    if (!unit) issues.push({ line, field: "Unit", message: "Required" });
    if (!partName) issues.push({ line, field: "Part Name", message: "Required" });
    if (!material) issues.push({ line, field: "Material", message: "Required" });
    if (!(lengthMm > 0)) issues.push({ line, field: "Length", message: "Must be > 0" });
    if (!(widthMm > 0)) issues.push({ line, field: "Width", message: "Must be > 0" });
    if (!(thicknessMm > 0)) issues.push({ line, field: "Thickness", message: "Must be > 0" });
    if (!(qty >= 1)) issues.push({ line, field: "Quantity", message: "Must be ≥ 1" });
    const priOk = ["low", "normal", "high", "urgent"].includes(priority.toLowerCase());
    if (!priOk) issues.push({ line, field: "Priority", message: "Use Low, Normal, High, or Urgent" });

    rows.push({
      line,
      unit,
      partName,
      lengthMm,
      widthMm,
      thicknessMm,
      material,
      qty,
      priority: priOk ? cap(priority) : "Normal",
      notes,
    });
  }
  return { rows, issues, headers };
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
function num(v: string | undefined) {
  if (v == null || v.trim() === "") return 0;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}
function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (c === "," && !q) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

export const CSV_TEMPLATE = `Unit,Part Name,Length (mm),Width (mm),Thickness (mm),Material,Quantity,Priority,Notes
BED-01,Side Rail,2000,150,18,HDHMR,2,High,Handle with care
BED-01,Headboard,1600,900,25,HDHMR,1,Normal,
CAB-A,Door Left,720,296,18,MDF-WHITE,1,Normal,High gloss
CAB-A,Shelf,564,280,18,MDF-WHITE,3,Normal,
`;
