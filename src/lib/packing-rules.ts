/** Packing rule helper. Weight split, 2.5D floor fit, 2100+ same-size pairs. */

export const PREFERRED_KG = 25;
export const SOFT_MAX_KG = 31;
export const HARD_MAX_KG = 40;
export const BIG_PAIR_MAX_KG = 50;
export const BIG_LEN_MM = 2100;
export const TARGET_BOX_KG = PREFERRED_KG;
export const MAX_BOX_KG = HARD_MAX_KG;
export const OVERSIZE_MM = 2400;
export const THIN_MAX_MM = 12;
export const SIZE_TOL_MM = 300;
export const COVER_MIN = 0.8;
export const MATCH_TIGHT_MM = 50;
export const EQUAL_AVG_MAX = 28;
export const STRIP_MAX_MM = 100;
export const STRIP_LEN_OVER_MM = 20;

export type Size = { length_mm: number; width_mm: number; thickness_mm?: number; weight?: number };

export type LayerPanel = {
  id: number;
  name: string;
  length_mm: number;
  width_mm: number;
  thickness_mm: number;
  weight: number;
  qty?: number;
};

export function sides(l: number, w: number): [number, number] {
  return l <= w ? [l, w] : [w, l];
}

export function isThinPanel(thickness_mm: number): boolean {
  return thickness_mm < THIN_MAX_MM;
}

/** Skirting / patta / 50–75 mm strips nest on the host board. */
export function isStripPanel(length_mm: number, width_mm: number): boolean {
  return Math.min(length_mm, width_mm) <= STRIP_MAX_MM + 1e-9;
}

export function stripFitsHost(strip: Size, host: Size): boolean {
  if (!isStripPanel(strip.length_mm, strip.width_mm)) return false;
  const stripLen = Math.max(strip.length_mm, strip.width_mm);
  const hostLen = Math.max(host.length_mm, host.width_mm);
  return stripLen <= hostLen + STRIP_LEN_OVER_MM + 1e-9;
}

export function isBigPanel(length_mm: number, width_mm: number, thickness_mm: number): boolean {
  return thickness_mm >= THIN_MAX_MM && Math.max(length_mm, width_mm) >= BIG_LEN_MM;
}

export function sizeDelta(l1: number, w1: number, l2: number, w2: number): number {
  const [a1, a2] = sides(l1, w1);
  const [b1, b2] = sides(l2, w2);
  return Math.abs(a1 - b1) + Math.abs(a2 - b2);
}

export function stackWaste(l1: number, w1: number, l2: number, w2: number): number {
  const a = Math.max(l1 * w1, 1);
  const b = Math.max(l2 * w2, 1);
  return 1 - Math.min(a, b) / Math.max(a, b);
}

export function fitsUnder(panelL: number, panelW: number, baseL: number, baseW: number): boolean {
  const [ps, pl] = sides(panelL, panelW);
  const [bs, bl] = sides(baseL, baseW);
  return ps <= bs + 1e-9 && pl <= bl + 1e-9;
}

export function stackMatch(l1: number, w1: number, l2: number, w2: number): boolean {
  const [a1, a2] = sides(l1, w1);
  const [b1, b2] = sides(l2, w2);
  if (Math.abs(a1 - b1) > SIZE_TOL_MM || Math.abs(a2 - b2) > SIZE_TOL_MM) return false;
  const covS = Math.min(a1, b1) / Math.max(a1, b1);
  const covL = Math.min(a2, b2) / Math.max(a2, b2);
  return covS >= COVER_MIN - 1e-9 && covL >= COVER_MIN - 1e-9;
}

export function tightMatch(l1: number, w1: number, l2: number, w2: number): boolean {
  const [a1, a2] = sides(l1, w1);
  const [b1, b2] = sides(l2, w2);
  if (Math.abs(a1 - b1) > MATCH_TIGHT_MM || Math.abs(a2 - b2) > MATCH_TIGHT_MM) return false;
  const covS = Math.min(a1, b1) / Math.max(a1, b1);
  const covL = Math.min(a2, b2) / Math.max(a2, b2);
  return covS >= 0.92 && covL >= 0.92;
}

export function sameSizePanel(a: Size, b: Size): boolean {
  return tightMatch(a.length_mm, a.width_mm, b.length_mm, b.width_mm);
}

export function targetBoxCount(totalKg: number, nPieces: number): number {
  if (totalKg <= 0 || nPieces <= 0) return 1;
  const minK = Math.max(1, Math.ceil(totalKg / HARD_MAX_KG - 1e-9));
  const maxAt25 = Math.max(1, Math.floor((totalKg + 1e-9) / PREFERRED_KG));
  return Math.min(nPieces, Math.max(minK, maxAt25));
}

export function shouldEqualize(totalKg: number, boxCount: number): boolean {
  if (boxCount < 2) return false;
  const avg = totalKg / boxCount;
  if (avg > HARD_MAX_KG + 1e-9) return false;
  const canAll25 = totalKg + 1e-9 >= PREFERRED_KG * boxCount;
  if (!canAll25) return true;
  const extra = totalKg - PREFERRED_KG * boxCount;
  return extra / boxCount <= EQUAL_AVG_MAX - PREFERRED_KG;
}

export function fillTargetKg(totalKg: number, nPieces: number): number {
  const k = targetBoxCount(totalKg, nPieces);
  if (k <= 1) return Math.min(HARD_MAX_KG, Math.max(PREFERRED_KG, totalKg));
  if (shouldEqualize(totalKg, k)) return totalKg / k;
  return PREFERRED_KG;
}

export function weightCap(opts: { bigPair: boolean; similar: boolean; fillUnder: boolean }): number {
  if (opts.bigPair) return BIG_PAIR_MAX_KG;
  return HARD_MAX_KG;
}

export function canStackCarcass(panel: Size, floor: Size): boolean {
  return stackMatch(panel.length_mm, panel.width_mm, floor.length_mm, floor.width_mm);
}

export function canFillCarcass(panel: Size, floor: Size, boxKg: number): boolean {
  if (boxKg + 1e-9 >= PREFERRED_KG) return false;
  return fitsUnder(panel.length_mm, panel.width_mm, floor.length_mm, floor.width_mm);
}

export function canNestThin(panel: Size, floor: Size): boolean {
  if (!isThinPanel(panel.thickness_mm ?? 0)) return false;
  return fitsUnder(panel.length_mm, panel.width_mm, floor.length_mm, floor.width_mm);
}

export function canPairBig(a: Size, b: Size, sumKg: number): boolean {
  if (!isBigPanel(a.length_mm, a.width_mm, a.thickness_mm ?? 18)) return false;
  if (!isBigPanel(b.length_mm, b.width_mm, b.thickness_mm ?? 18)) return false;
  if (!sameSizePanel(a, b)) return false;
  return sumKg <= BIG_PAIR_MAX_KG + 1e-9;
}

export type LayerSlot = {
  panel: LayerPanel;
  role: "floor" | "stack" | "fill" | "thin";
  x: number;
  y: number;
  z: number;
  l: number;
  w: number;
};

export function layersForBox(panels: LayerPanel[]): LayerPanel[][] {
  const byZ = new Map<number, LayerPanel[]>();
  for (const s of layoutBoxLayers(panels)) {
    const arr = byZ.get(s.z) ?? [];
    arr.push(s.panel);
    byZ.set(s.z, arr);
  }
  return [...byZ.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
}

export function layoutBoxLayers(panels: LayerPanel[]): LayerSlot[] {
  const exploded: LayerPanel[] = [];
  for (const p of panels) {
    const q = Math.max(1, Math.round(p.qty ?? 1));
    const unit = p.weight / q;
    for (let i = 0; i < q; i++) exploded.push({ ...p, qty: 1, weight: unit });
  }
  if (!exploded.length) return [];
  const carcass = exploded
    .filter((p) => !isThinPanel(p.thickness_mm))
    .sort((a, b) => b.length_mm * b.width_mm - a.length_mm * a.width_mm);
  const thin = exploded
    .filter((p) => isThinPanel(p.thickness_mm))
    .sort((a, b) => b.length_mm * b.width_mm - a.length_mm * a.width_mm);
  const floor = carcass[0] ?? thin[0];
  if (!floor) return [];
  const fL = Math.max(floor.length_mm, floor.width_mm);
  const fW = Math.min(floor.length_mm, floor.width_mm);
  const slots: LayerSlot[] = [];
  let z = 0;

  const similar: LayerPanel[] = [];
  const fill: LayerPanel[] = [];
  if (carcass.length) {
    similar.push(carcass[0]);
    for (let i = 1; i < carcass.length; i++) {
      if (stackMatch(carcass[i].length_mm, carcass[i].width_mm, floor.length_mm, floor.width_mm)) {
        similar.push(carcass[i]);
      } else fill.push(carcass[i]);
    }
  }
  for (const p of similar) {
    slots.push({
      panel: p,
      role: slots.length ? "stack" : "floor",
      x: 0,
      y: 0,
      z,
      l: fL,
      w: fW,
    });
    z += p.thickness_mm;
  }
  const rest = [
    ...fill.map((p) => ({ panel: p, role: "fill" as const })),
    ...thin.map((p) => ({ panel: p, role: "thin" as const })),
  ];
  if (rest.length) slots.push(...shelfPack(rest, fL, fW, z));
  return slots;
}

function shelfPack(
  items: { panel: LayerPanel; role: "fill" | "thin" }[],
  binL: number,
  binW: number,
  z0: number,
): LayerSlot[] {
  const gap = 8;
  const ordered = [...items].sort(
    (a, b) => b.panel.length_mm * b.panel.width_mm - a.panel.length_mm * a.panel.width_mm,
  );
  const out: LayerSlot[] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  let z = z0;
  let layerT = 0;
  const fits = (L: number, W: number) => x + L <= binL + 1e-6 && y + W <= binW + 1e-6;
  const newLayer = () => {
    z += Math.max(layerT, 8);
    x = 0;
    y = 0;
    rowH = 0;
    layerT = 0;
  };
  for (const it of ordered) {
    const a = Math.max(it.panel.length_mm, it.panel.width_mm);
    const b = Math.min(it.panel.length_mm, it.panel.width_mm);
    const strip = b <= STRIP_MAX_MM + 1e-9;
    const opts = (
      strip
        ? [
            { L: a, W: b },
            { L: b, W: a },
          ]
        : [
            { L: b, W: a },
            { L: a, W: b },
          ]
    ).filter((o) => o.L <= binL + 1e-6 && o.W <= binW + 1e-6);
    const tryPlace = () => {
      for (const o of opts) if (fits(o.L, o.W)) return o;
      return null;
    };
    let o = tryPlace();
    if (!o) {
      x = 0;
      y += rowH + (rowH ? gap : 0);
      rowH = 0;
      o = tryPlace();
    }
    if (!o) {
      newLayer();
      o = tryPlace();
    }
    if (!o) o = opts[0] ?? { L: Math.min(a, binL), W: Math.min(b, binW) };
    out.push({ panel: it.panel, role: it.role, x, y, z, l: o.L, w: o.W });
    x += o.L + gap;
    rowH = Math.max(rowH, o.W);
    layerT = Math.max(layerT, it.panel.thickness_mm);
  }
  return out;
}
