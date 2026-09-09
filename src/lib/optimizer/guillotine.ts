import type {
  CutPartInput,
  StockSheetInput,
  PlacedPart,
  SheetLayout,
  Offcut,
  CutLine,
  OptimizerSettings,
  GrainDirection,
} from "./types";

export type FitRule = "BSSF" | "BAF" | "BLSF";
export type SplitRule = "SLAS" | "LLAS" | "MINAS" | "MAXAS" | "DIR_PREFER" | "STRIP_RIP" | "STRIP_CROSS";

export interface FreeRect {
  x: number;
  y: number;
  length: number; // along sheet X (length)
  width: number; // along sheet Y (width)
  depth?: number; // Phase 1, Phase 2, etc.
}

const PALETTE = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#14b8a6", // teal
  "#f97316", // orange
  "#6366f1", // indigo
  "#84cc16", // lime
  "#e11d48", // rose
  "#0284c7", // sky
];

export function assignPartColors(parts: CutPartInput[]): Map<string, string> {
  const map = new Map<string, string>();
  const unitColors = new Map<string, string>();
  let colorIdx = 0;

  for (const part of parts) {
    const key = part.unit || part.name;
    if (!unitColors.has(key)) {
      unitColors.set(key, PALETTE[colorIdx % PALETTE.length]);
      colorIdx++;
    }
    map.set(part.id, unitColors.get(key)!);
  }
  return map;
}

export function canRotatePart(
  part: CutPartInput,
  sheet: StockSheetInput,
  allowPartRotation: boolean,
): boolean {
  if (!allowPartRotation) return false;
  if (!part.canRotate) return false;

  // Grain rules:
  // If part grain is 'none' and sheet grain is 'none', rotation is 100% allowed
  if (part.grain === "none" && sheet.grain === "none") return true;

  // If both have no specific grain or matching rules
  if (part.grain === "none") return true;

  // If part has explicit grain (length or width), rotation would violate the woodgrain
  return false;
}

interface PlacementCandidate {
  freeRectIndex: number;
  rotated: boolean;
  score1: number;
  score2: number;
  placedLength: number;
  placedWidth: number;
}

export class GuillotineSheetPacker {
  public freeRects: FreeRect[] = [];
  public placedParts: PlacedPart[] = [];
  public cutLines: CutLine[] = [];
  private cutCount = 0;

  constructor(
    public stockSheet: StockSheetInput,
    public settings: OptimizerSettings,
    public fitRule: FitRule = "BSSF",
    public splitRule: SplitRule = "MAXAS",
    public sheetIndex: number = 0,
  ) {
    this.reset();
  }

  public reset() {
    const s = this.stockSheet;
    const startX = s.trimLeft;
    const startY = s.trimTop;
    const usableL = Math.max(0, s.length - s.trimLeft - s.trimRight);
    const usableW = Math.max(0, s.width - s.trimTop - s.trimBottom);

    this.freeRects = [{ x: startX, y: startY, length: usableL, width: usableW, depth: 1 }];
    this.placedParts = [];
    this.cutLines = [];
    this.cutCount = 0;
  }

  public tryPlace(
    part: CutPartInput,
    color: string,
  ): boolean {
    const candidate = this.findBestPlacement(part);
    if (!candidate) return false;

    const fr = this.freeRects[candidate.freeRectIndex];
    const { placedLength, placedWidth, rotated } = candidate;

    // Record placed part
    this.placedParts.push({
      id: `${part.id}_${this.placedParts.length}`,
      partId: part.id,
      name: part.name,
      material: part.material,
      unit: part.unit,
      x: fr.x,
      y: fr.y,
      length: placedLength,
      width: placedWidth,
      originalLength: part.length,
      originalWidth: part.width,
      rotated,
      grain: part.grain,
      sheetIndex: this.sheetIndex,
      color,
    });

    // Split the free rectangle (Strict Guillotine)
    this.splitFreeRect(candidate.freeRectIndex, placedLength, placedWidth);

    return true;
  }

  private findBestPlacement(part: CutPartInput): PlacementCandidate | null {
    let best: PlacementCandidate | null = null;
    const allowRotation = canRotatePart(part, this.stockSheet, this.settings.allowPartRotation);
    const pL = part.length;
    const pW = part.width;

    // Hot loop optimized for V8 (scales to 10k parts easily)
    for (let i = 0; i < this.freeRects.length; i++) {
      const fr = this.freeRects[i];
      const fL = fr.length;
      const fW = fr.width;

      // Normal orientation
      if (pL <= fL && pW <= fW) {
        const remL = fL - pL;
        const remW = fW - pW;
        const shortSide = remL < remW ? remL : remW;
        const longSide = remL > remW ? remL : remW;
        
        let s1 = 0, s2 = 0;
        if (this.fitRule === "BSSF") { s1 = shortSide; s2 = longSide; }
        else if (this.fitRule === "BLSF") { s1 = longSide; s2 = shortSide; }
        else { s1 = fL * fW - pL * pW; s2 = shortSide; }

        if (!best || s1 < best.score1 || (s1 === best.score1 && s2 < best.score2)) {
          best = { freeRectIndex: i, rotated: false, score1: s1, score2: s2, placedLength: pL, placedWidth: pW };
        }
      }

      // Rotated 90°
      if (allowRotation && pW <= fL && pL <= fW) {
        const remL = fL - pW;
        const remW = fW - pL;
        const shortSide = remL < remW ? remL : remW;
        const longSide = remL > remW ? remL : remW;
        
        let s1 = 0, s2 = 0;
        if (this.fitRule === "BSSF") { s1 = shortSide; s2 = longSide; }
        else if (this.fitRule === "BLSF") { s1 = longSide; s2 = shortSide; }
        else { s1 = fL * fW - pW * pL; s2 = shortSide; }

        if (!best || s1 < best.score1 || (s1 === best.score1 && s2 < best.score2)) {
          best = { freeRectIndex: i, rotated: true, score1: s1, score2: s2, placedLength: pW, placedWidth: pL };
        }
      }
    }

    return best;
  }

  private splitFreeRect(freeIdx: number, placedL: number, placedW: number) {
    const fr = this.freeRects.splice(freeIdx, 1)[0];
    const kerf = this.settings.kerfMm;

    const remL = fr.length - placedL;
    const remW = fr.width - placedW;

    const hasRightRect = remL > kerf;
    const hasBottomRect = remW > kerf;

    if (!hasRightRect && !hasBottomRect) return;

    let splitHorizontalFirst = false;
    
    if (this.splitRule === "STRIP_RIP") {
      splitHorizontalFirst = false;
    } else if (this.splitRule === "STRIP_CROSS") {
      splitHorizontalFirst = true;
    } else if (this.splitRule === "DIR_PREFER") {
      const pref = this.settings.cutPreference;
      splitHorizontalFirst = pref === "guillotine-cross";
    } else {
      const rL = Math.max(0, fr.length - placedL - kerf);
      const rW = Math.max(0, fr.width - placedW - kerf);
      if (this.splitRule === "SLAS") splitHorizontalFirst = fr.width <= fr.length;
      else if (this.splitRule === "LLAS") splitHorizontalFirst = fr.length <= fr.width;
      else if (this.splitRule === "MINAS") splitHorizontalFirst = rL * fr.width <= fr.length * rW;
      else splitHorizontalFirst = rL * fr.width >= fr.length * rW; // MAXAS
    }

    if (splitHorizontalFirst) {
      if (hasBottomRect) {
        this.cutCount++;
        this.cutLines.push({
          id: this.cutCount,
          orientation: "horizontal",
          x1: fr.x,
          y1: fr.y + placedW,
          x2: fr.x + (hasRightRect ? placedL : fr.length),
          y2: fr.y + placedW,
          kerf,
          stage: fr.depth ? fr.depth + 1 : 2,
        });
        this.freeRects.push({ x: fr.x, y: fr.y + placedW + kerf, length: placedL, width: remW - kerf, depth: fr.depth ? fr.depth + 1 : 2 });
      }
      if (hasRightRect) {
        this.cutCount++;
        this.cutLines.push({
          id: this.cutCount,
          orientation: "vertical",
          x1: fr.x + placedL,
          y1: fr.y,
          x2: fr.x + placedL,
          y2: fr.y + fr.width,
          kerf,
          stage: fr.depth || 1,
        });
        this.freeRects.push({ x: fr.x + placedL + kerf, y: fr.y, length: remL - kerf, width: fr.width, depth: fr.depth ? fr.depth + 1 : 2 });
      }
    } else {
      if (hasRightRect) {
        this.cutCount++;
        this.cutLines.push({
          id: this.cutCount,
          orientation: "vertical",
          x1: fr.x + placedL,
          y1: fr.y,
          x2: fr.x + placedL,
          y2: fr.y + placedW,
          kerf,
          stage: fr.depth ? fr.depth + 1 : 2,
        });
        this.freeRects.push({ x: fr.x + placedL + kerf, y: fr.y, length: remL - kerf, width: placedW, depth: fr.depth ? fr.depth + 1 : 2 });
      }
      if (hasBottomRect) {
        this.cutCount++;
        this.cutLines.push({
          id: this.cutCount,
          orientation: "horizontal",
          x1: fr.x,
          y1: fr.y + placedW,
          x2: fr.x + fr.length,
          y2: fr.y + placedW,
          kerf,
          stage: fr.depth || 1,
        });
        this.freeRects.push({ x: fr.x, y: fr.y + placedW + kerf, length: fr.length, width: remW - kerf, depth: fr.depth ? fr.depth + 1 : 2 });
      }
    }

    this.mergeFreeRects();
  }

  private mergeFreeRects() {
    const kerf = this.settings.kerfMm;
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = 0; i < this.freeRects.length; i++) {
        for (let j = i + 1; j < this.freeRects.length; j++) {
          const r1 = this.freeRects[i];
          const r2 = this.freeRects[j];

          // Vertical merge: same X and same Length, adjacent Y
          if (Math.abs(r1.x - r2.x) < 0.1 && Math.abs(r1.length - r2.length) < 0.1) {
            if (Math.abs(r1.y + r1.width + kerf - r2.y) < 0.1) {
              r1.width = r1.width + kerf + r2.width;
              this.freeRects.splice(j, 1);
              merged = true;
              break;
            }
            if (Math.abs(r2.y + r2.width + kerf - r1.y) < 0.1) {
              r2.width = r2.width + kerf + r1.width;
              this.freeRects.splice(i, 1);
              merged = true;
              break;
            }
          }

          // Horizontal merge: same Y and same Width, adjacent X
          if (Math.abs(r1.y - r2.y) < 0.1 && Math.abs(r1.width - r2.width) < 0.1) {
            if (Math.abs(r1.x + r1.length + kerf - r2.x) < 0.1) {
              r1.length = r1.length + kerf + r2.length;
              this.freeRects.splice(j, 1);
              merged = true;
              break;
            }
            if (Math.abs(r2.x + r2.length + kerf - r1.x) < 0.1) {
              r2.length = r2.length + kerf + r1.length;
              this.freeRects.splice(i, 1);
              merged = true;
              break;
            }
          }
        }
        if (merged) break;
      }
    }
  }

  public getLayout(): SheetLayout {
    const s = this.stockSheet;
    const totalAreaMm2 = s.length * s.width;
    const usedAreaMm2 = this.placedParts.reduce((acc, p) => acc + p.length * p.width, 0);
    const wasteAreaMm2 = Math.max(0, totalAreaMm2 - usedAreaMm2);

    const offcuts: Offcut[] = this.freeRects
      .filter((fr) => fr.length > 5 && fr.width > 5)
      .map((fr, idx) => ({
        id: `offcut_${this.sheetIndex}_${idx}`,
        x: fr.x,
        y: fr.y,
        length: fr.length,
        width: fr.width,
        areaMm2: fr.length * fr.width,
        isReusable:
          fr.length >= this.settings.minReusableLengthMm &&
          fr.width >= this.settings.minReusableWidthMm,
      }))
      .sort((a, b) => b.areaMm2 - a.areaMm2);

    const efficiencyPct = totalAreaMm2 > 0 ? (usedAreaMm2 / totalAreaMm2) * 100 : 0;
    const wastePct = 100 - efficiencyPct;

    return {
      sheetIndex: this.sheetIndex,
      stockSheet: this.stockSheet,
      placedParts: this.placedParts,
      offcuts,
      cutLines: this.cutLines,
      usedAreaMm2,
      totalAreaMm2,
      wasteAreaMm2,
      efficiencyPct,
      wastePct,
    };
  }
}
