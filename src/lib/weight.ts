/**
 * LOCKED WEIGHT ENGINE
 * Do not change these constants or catalog kilograms.
 *
 * Sources (frozen):
 * - Action weight.xlsx  — kg per full board (VLOOKUP catalog)
 * - Measured 18 mm HDHMR 8×4:
 *     PLAIN core        = 46.081 kg  (L×W×T×861.13)
 *     Prelam BSL add    = 1.289 kg   → 47.37 kg
 *     Favicol 1 mm HPL  = PLAIN + 1.4 kg/m² HPL + 0.075 kg/m² dry Fevicol
 *       1 side  = 50.47 kg
 *       2 sides = 54.85 kg
 */
import { BOARD_CATALOG, type CatalogRow } from "./weight-catalog";

export const FT_TO_M = 0.3048;
export const HDHMR_PLAIN_DENSITY_KG_M3 = 861.13;
export const HPL_KG_PER_M2 = 1.4;
export const FEVICOL_DRY_KG_PER_M2 = 0.075;

export type LamMode = "prelam" | "favicol";
export type LamSides = 1 | 2;

export function boardAreaM2(lengthFt: number, widthFt: number): number {
  return lengthFt * FT_TO_M * widthFt * FT_TO_M;
}

export function panelAreaM2(lengthMm: number, widthMm: number): number {
  return (lengthMm / 1000) * (widthMm / 1000);
}

export function findBoard(family: string, sku: string): CatalogRow | undefined {
  return BOARD_CATALOG.find((r) => r.family === family && r.sku === sku);
}

export function findPlainBoard(
  laminatedFamily: string,
  th: number,
  grade: string,
  lft: number,
  wft: number,
): CatalogRow | undefined {
  const plainFamily = laminatedFamily.replace(/^LAMINATED_/, "PLAIN_");
  return BOARD_CATALOG.find(
    (r) =>
      r.family === plainFamily &&
      r.th === th &&
      r.grade === grade &&
      r.lft === lft &&
      r.wft === wft &&
      r.lam === "PLAIN",
  );
}

export function closestBoard(
  family: string,
  th: number,
  lam: string,
  lft = 8,
  wft = 4,
  grade: "I" | "E" = "E",
): CatalogRow | undefined {
  const exactSku =
    lam === "PLAIN" || lam === "RAW"
      ? `${th.toFixed(2)}-${grade}-${lft}x${wft}`
      : `${th.toFixed(2)}-${grade}-${lft}x${wft}-${lam}`;
  const exact = findBoard(family, exactSku);
  if (exact) return exact;
  const same = BOARD_CATALOG.filter((r) => r.family === family);
  if (!same.length) return undefined;
  return same.reduce((best, r) => {
    const d =
      Math.abs(r.th - th) * 10 +
      (r.lam === lam ? 0 : 2) +
      Math.abs(r.lft - lft) +
      Math.abs(r.wft - wft);
    const bd =
      Math.abs(best.th - th) * 10 +
      (best.lam === lam ? 0 : 2) +
      Math.abs(best.lft - lft) +
      Math.abs(best.wft - wft);
    return d < bd ? r : best;
  });
}

/** Favicol paste on a PLAIN board. LOCKED. */
export function favicolBoardKg(plainKg: number, areaM2: number, sides: LamSides): number {
  return plainKg + (HPL_KG_PER_M2 + FEVICOL_DRY_KG_PER_M2) * areaM2 * sides;
}

export function sidesFromLam(lam: string): LamSides {
  if (lam === "BSL" || lam === "BSB") return 2;
  return 1;
}

export function fullBoardKg(opts: {
  family: string;
  th: number;
  lam: string;
  mode: LamMode;
  lft?: number;
  wft?: number;
  grade?: "I" | "E";
}): { kg: number; sku: string; source: "catalog" | "favicol" | "density" } {
  const lft = opts.lft ?? 8;
  const wft = opts.wft ?? 4;
  const grade = opts.grade ?? "E";
  const lam = opts.lam === "RAW" ? "PLAIN" : opts.lam;
  const row = closestBoard(opts.family, opts.th, lam, lft, wft, grade);
  const area = boardAreaM2(lft, wft);

  if (opts.mode === "favicol") {
    const plain =
      findPlainBoard(opts.family, row?.th ?? opts.th, grade, lft, wft) ??
      findPlainBoard(opts.family, opts.th, grade, lft, wft);
    const sides = sidesFromLam(lam === "PLAIN" ? "OSL" : lam);
    if (plain) {
      return {
        kg: round3(favicolBoardKg(plain.kg, boardAreaM2(plain.lft, plain.wft), sides)),
        sku: plain.sku,
        source: "favicol",
      };
    }
    const core = area * (opts.th / 1000) * HDHMR_PLAIN_DENSITY_KG_M3;
    return { kg: round3(favicolBoardKg(core, area, sides)), sku: "DENSITY", source: "density" };
  }

  if (row) return { kg: row.kg, sku: row.sku, source: "catalog" };

  const core = area * (opts.th / 1000) * HDHMR_PLAIN_DENSITY_KG_M3;
  return { kg: round3(core), sku: "DENSITY", source: "density" };
}

export function cutPanelKg(opts: {
  family: string;
  boardTh: number;
  lam: string;
  mode: LamMode;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  qty: number;
}): { unitKg: number; lineKg: number; boardKg: number; sku: string; source: string } {
  const board = fullBoardKg({
    family: opts.family,
    th: opts.boardTh || opts.thicknessMm,
    lam: opts.lam,
    mode: opts.mode,
  });
  const row = closestBoard(opts.family, opts.boardTh || opts.thicknessMm, opts.lam);
  const bArea = row ? boardAreaM2(row.lft, row.wft) : boardAreaM2(8, 4);
  const pArea = panelAreaM2(opts.lengthMm, opts.widthMm);
  const unitKg = board.kg * (pArea / bArea);
  return {
    unitKg: round4(unitKg),
    lineKg: round4(unitKg * opts.qty),
    boardKg: board.kg,
    sku: board.sku,
    source: board.source,
  };
}

export const FAMILY_FROM_SHORT: Record<string, { family: string; lam: string }> = {
  "MDF-WHITE": { family: "LAMINATED_MDF", lam: "BSL" },
  "MDF-RAW": { family: "PLAIN_MDF", lam: "PLAIN" },
  "PLY-OAK": { family: "LAMINATED_HDHMR", lam: "BSL" },
  "HDHMR": { family: "LAMINATED_HDHMR", lam: "BSL" },
  "LAMINATED_HDHMR": { family: "LAMINATED_HDHMR", lam: "BSL" },
  "PART-GRY": { family: "LAMINATED_PARTICLE", lam: "BSL" },
  "PARTICLE": { family: "LAMINATED_PARTICLE", lam: "BSL" },
  "HMR": { family: "LAMINATED_HMR_PARTICLE", lam: "BSL" },
  "BOILO": { family: "LAMINATED_BOILO", lam: "BSL" },
};

export function resolveMaterial(shortName: string): { family: string; lam: string } {
  const key = shortName.trim().toUpperCase().replace(/\s+/g, "-");
  if (FAMILY_FROM_SHORT[key]) return FAMILY_FROM_SHORT[key];
  const hit = BOARD_CATALOG.find((r) => r.family.toUpperCase() === key);
  if (hit) return { family: hit.family, lam: hit.lam === "PLAIN" ? "PLAIN" : "BSL" };
  if (key.includes("HDHMR")) return { family: "LAMINATED_HDHMR", lam: "BSL" };
  if (key.includes("MDF")) return { family: "LAMINATED_MDF", lam: "BSL" };
  if (key.includes("PART")) return { family: "LAMINATED_PARTICLE", lam: "BSL" };
  return { family: "LAMINATED_HDHMR", lam: "BSL" };
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}
function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
