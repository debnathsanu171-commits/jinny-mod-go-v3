/** 2.5D packing. Rules live in packing-rules.ts. */

import {
  PREFERRED_KG,
  SOFT_MAX_KG,
  HARD_MAX_KG,
  BIG_PAIR_MAX_KG,
  OVERSIZE_MM,
  THIN_MAX_MM,
  canPairBig,
  canStackCarcass,
  fillTargetKg,
  fitsUnder,
  isBigPanel,
  isStripPanel,
  isThinPanel,
  shouldEqualize,
  sizeDelta,
  stackMatch,
  stackWaste,
  stripFitsHost,
  targetBoxCount,
  tightMatch,
  weightCap,
} from "./packing-rules.ts";

export {
  PREFERRED_KG,
  SOFT_MAX_KG,
  HARD_MAX_KG,
  BIG_PAIR_MAX_KG,
  OVERSIZE_MM,
  THIN_MAX_MM,
  targetBoxCount,
} from "./packing-rules.ts";
export { BIG_LEN_MM, SIZE_TOL_MM, COVER_MIN, MATCH_TIGHT_MM, TARGET_BOX_KG, MAX_BOX_KG } from "./packing-rules.ts";

export { layersForBox } from "./packing-rules.ts";
export const PACK_REV = 15;
const MOVE_LIMIT = 400;
const SWAP_LIMIT = 400;

export type PackPart = {
  id: number;
  unit: string;
  part_name: string;
  length_mm: number;
  width_mm: number;
  thickness_mm: number;
  material: string;
  qty: number;
  priority: string;
  notes: string | null;
  weight_kg: number;
};

export type PackedBox = {
  box_number: string;
  unit: string;
  seq: number;
  total_seq: number;
  total_weight_kg: number;
  partIds: { id: number; qty: number }[];
  oversize: boolean;
};

type Piece = {
  uid: string;
  id: number;
  name: string;
  length_mm: number;
  width_mm: number;
  thickness_mm: number;
  weight: number;
};

type Box = {
  pieces: Piece[];
  weight: number;
  length_mm: number;
  width_mm: number;
  hardSolo: boolean;
  oversize: boolean;
};

export function packParts(parts: PackPart[]): PackedBox[] {
  const unitOrder: string[] = [];
  const byUnit = new Map<string, PackPart[]>();
  for (const p of parts) {
    if (!byUnit.has(p.unit)) {
      unitOrder.push(p.unit);
      byUnit.set(p.unit, []);
    }
    byUnit.get(p.unit)!.push(p);
  }

  const all: Omit<PackedBox, "box_number" | "seq" | "total_seq">[] = [];

  for (const unit of unitOrder) {
    const pieces = explode(byUnit.get(unit)!);
    const boxes = packUnit(pieces);
    for (const b of boxes) {
      all.push({
        unit,
        total_weight_kg: round3(b.weight),
        partIds: collapse(b.pieces),
        oversize: b.oversize || (b.weight > boxCap(b) + 0.001 && b.pieces.length === 1),
      });
    }
  }

  const counted = new Map<string, number>();
  for (const b of all) counted.set(b.unit, (counted.get(b.unit) ?? 0) + 1);
  const seqs = new Map<string, number>();
  return all.map((b) => {
    const total = counted.get(b.unit) ?? 1;
    const seq = (seqs.get(b.unit) ?? 0) + 1;
    seqs.set(b.unit, seq);
    const token = sanitizeUnit(b.unit);
    return {
      ...b,
      seq,
      total_seq: total,
      box_number: `BOX ${token}-${seq}/${total}`,
    };
  });
}

function packUnit(pieces: Piece[]): Box[] {
  const solos: Box[] = [];
  const carcass: Piece[] = [];
  const thin: Piece[] = [];
  for (const p of sortDifficult(pieces)) {
    if (p.weight >= BIG_PAIR_MAX_KG) solos.push(makeBox(p, true));
    else if (p.weight > HARD_MAX_KG && !isBigPiece(p)) solos.push(makeBox(p, true));
    else if (p.thickness_mm < THIN_MAX_MM) thin.push(p);
    else carcass.push(p);
  }

  const { paired, rest } = pairBigPanels(carcass);
  const rest2: Piece[] = [];
  for (const p of rest) {
    if (isBigPiece(p) && p.weight > HARD_MAX_KG) solos.push(makeBox(p, true));
    else rest2.push(p);
  }

  const boxes = [...paired, ...packStack(rest2)];
  nestStrips(boxes);
  const leftoverThin: Piece[] = [];
  for (const t of sortDifficult(thin)) {
    if (!nestOne(boxes, t)) leftoverThin.push(t);
  }
  if (leftoverThin.length) boxes.push(...packStack(leftoverThin));
  nestThinStacks(boxes);
  nestStrips(boxes);

  return [...solos, ...boxes.filter((b) => b.pieces.length > 0)];
}

function pairBigPanels(pieces: Piece[]): { paired: Box[]; rest: Piece[] } {
  const big = sortDifficult(pieces.filter(isBigPiece));
  const rest: Piece[] = pieces.filter((p) => !isBigPiece(p));
  const used = new Set<string>();
  const paired: Box[] = [];

  for (let i = 0; i < big.length; i++) {
    if (used.has(big[i].uid)) continue;
    let best = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let j = i + 1; j < big.length; j++) {
      if (used.has(big[j].uid)) continue;
      const sum = big[i].weight + big[j].weight;
      if (!canPairBig(big[i], big[j], sum)) continue;
      const sim = stackMatch(big[i].length_mm, big[i].width_mm, big[j].length_mm, big[j].width_mm);
      const tight = tightMatch(big[i].length_mm, big[i].width_mm, big[j].length_mm, big[j].width_mm);
      const score =
        (tight ? 0 : 1_000) +
        (sim ? 0 : 2_000) +
        sizeDelta(big[i].length_mm, big[i].width_mm, big[j].length_mm, big[j].width_mm) +
        Math.abs(sum - PREFERRED_KG) * 0.01;
      if (score < bestScore) {
        bestScore = score;
        best = j;
      }
    }
    if (best < 0) continue;
    used.add(big[i].uid);
    used.add(big[best].uid);
    const box = makeBox(big[i], false);
    addPiece(box, big[best]);
    paired.push(box);
  }

  for (const p of big) {
    if (!used.has(p.uid)) rest.push(p);
  }
  return { paired, rest };
}

function isBigPiece(p: Piece): boolean {
  return isBigPanel(p.length_mm, p.width_mm, p.thickness_mm);
}

function bigCount(box: Box): number {
  return box.pieces.filter(isBigPiece).length;
}

function boxCap(box: Box): number {
  return weightCap({
    bigPair: bigCount(box) >= 2,
    similar: true,
    fillUnder: false,
  });
}

function capAfterAdd(box: Box, piece: Piece): number {
  const n = bigCount(box) + (isBigPiece(piece) ? 1 : 0);
  const floor = box.pieces.length ? { length_mm: box.length_mm, width_mm: box.width_mm } : piece;
  const similar = !box.pieces.length || canStackCarcass(piece, floor);
  return weightCap({
    bigPair: n >= 2,
    similar,
    fillUnder: !similar,
  });
}

function packStack(pieces: Piece[]): Box[] {
  if (!pieces.length) return [];
  const boxes: Box[] = [];
  for (const group of clusterTight(pieces)) {
    const total = group.reduce((s, p) => s + p.weight, 0);
    const fillTo = fillTargetKg(total, group.length);
    boxes.push(...bestFitStack(group, fillTo));
  }
  mergeUndersize(boxes);
  nestStrips(boxes);
  dumpLeftovers(boxes);
  rebalance(boxes);
  mergeUndersize(boxes);
  nestStrips(boxes);
  rebalance(boxes);
  return boxes.filter((b) => b.pieces.length > 0);
}

function clusterTight(pieces: Piece[]): Piece[][] {
  const clusters: Piece[][] = [];
  for (const p of sortDifficult(pieces)) {
    let best = -1;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (let i = 0; i < clusters.length; i++) {
      const floor = floorPiece(clusters[i]);
      if (!floor) continue;
      if (!tightMatch(floor.length_mm, floor.width_mm, p.length_mm, p.width_mm)) continue;
      const d = sizeDelta(floor.length_mm, floor.width_mm, p.length_mm, p.width_mm);
      if (d < bestDelta) {
        bestDelta = d;
        best = i;
      }
    }
    if (best >= 0) clusters[best].push(p);
    else clusters.push([p]);
  }
  return clusters;
}

function bestFitStack(pieces: Piece[], fillTo = PREFERRED_KG): Box[] {
  const boxes: Box[] = [];
  for (const piece of sortDifficult(pieces)) {
    let best: Box | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const b of boxes) {
      if (b.weight + 1e-9 >= fillTo) continue;
      if (!canPlace(b, piece, false)) continue;
      const sum = b.weight + piece.weight;
      const waste = stackWaste(b.length_mm, b.width_mm, piece.length_mm, piece.width_mm);
      const score =
        waste * 20_000 +
        sizeDelta(b.length_mm, b.width_mm, piece.length_mm, piece.width_mm) * 2 +
        Math.abs(sum - fillTo) +
        (sum > fillTo ? (sum - fillTo) * 0.3 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = b;
      }
    }
    if (best) addPiece(best, piece);
    else boxes.push(makeBox(piece, false));
  }
  return boxes;
}

function nestOne(boxes: Box[], piece: Piece): boolean {
  let best: Box | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const b of boxes) {
    if (b.hardSolo) continue;
    if (!canPlace(b, piece, true)) continue;
    const waste = stackWaste(b.length_mm, b.width_mm, piece.length_mm, piece.width_mm);
    const score = waste * 20_000 + Math.abs(b.weight + piece.weight - PREFERRED_KG) * 0.01;
    if (score < bestScore) {
      bestScore = score;
      best = b;
    }
  }
  if (!best) return false;
  addPiece(best, piece);
  return true;
}

function nestThinStacks(boxes: Box[]) {
  for (let guard = 0; guard < 200; guard++) {
    let moved = false;
    for (let i = 0; i < boxes.length; i++) {
      const src = boxes[i];
      if (src.hardSolo || !src.pieces.length || !isThinBox(src)) continue;
      let bestJ = -1;
      let bestScore = Number.POSITIVE_INFINITY;
      for (let j = 0; j < boxes.length; j++) {
        if (i === j) continue;
        const dst = boxes[j];
        if (dst.hardSolo || !dst.pieces.length) continue;
        if (!canAbsorb(dst, src, true)) continue;
        const waste = stackWaste(dst.length_mm, dst.width_mm, src.length_mm, src.width_mm);
        const score = waste * 20_000 + Math.abs(dst.weight + src.weight - PREFERRED_KG) * 0.01;
        if (score < bestScore) {
          bestScore = score;
          bestJ = j;
        }
      }
      if (bestJ < 0) continue;
      absorb(boxes[bestJ], src);
      boxes.splice(i, 1);
      moved = true;
      break;
    }
    if (!moved) break;
  }
}

function nestStrips(boxes: Box[]) {
  for (let guard = 0; guard < 200; guard++) {
    let moved = false;
    for (let i = 0; i < boxes.length; i++) {
      const src = boxes[i];
      if (src.hardSolo || !src.pieces.length) continue;
      const srcFloor = floorPiece(src.pieces);
      for (const piece of src.pieces.slice()) {
        if (!isStripPanel(piece.length_mm, piece.width_mm)) continue;
        if (
          srcFloor &&
          !isStripPanel(srcFloor.length_mm, srcFloor.width_mm) &&
          stripFitsHost(piece, srcFloor)
        ) {
          continue;
        }
        let bestJ = -1;
        let best = Number.POSITIVE_INFINITY;
        for (let j = 0; j < boxes.length; j++) {
          if (j === i) continue;
          const dst = boxes[j];
          if (dst.hardSolo || !dst.pieces.length) continue;
          const df = floorPiece(dst.pieces);
          if (!df || isStripPanel(df.length_mm, df.width_mm)) continue;
          if (!stripFitsHost(piece, df)) continue;
          if (!canPlace(dst, piece, true)) continue;
          const d = Math.abs(
            Math.max(df.length_mm, df.width_mm) - Math.max(piece.length_mm, piece.width_mm),
          );
          if (d < best) {
            best = d;
            bestJ = j;
          }
        }
        if (bestJ < 0) continue;
        applyMove(src, boxes[bestJ], piece);
        if (!src.pieces.length) boxes.splice(i, 1);
        moved = true;
        break;
      }
      if (moved) break;
    }
    if (!moved) break;
  }
}

function mergeUndersize(boxes: Box[]) {
  for (let guard = 0; guard < 200; guard++) {
    let bestI = -1;
    let bestJ = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let i = 0; i < boxes.length; i++) {
      const a = boxes[i];
      if (a.hardSolo || !a.pieces.length || a.weight + 1e-9 >= PREFERRED_KG) continue;
      for (let j = 0; j < boxes.length; j++) {
        if (i === j) continue;
        const b = boxes[j];
        if (b.hardSolo || !b.pieces.length) continue;
        const fill = a.weight + 1e-9 < PREFERRED_KG;
        if (!canAbsorb(b, a, fill)) continue;
        const sim = stackMatch(a.length_mm, a.width_mm, b.length_mm, b.width_mm);
        const waste = stackWaste(a.length_mm, a.width_mm, b.length_mm, b.width_mm);
        const sum = a.weight + b.weight;
        const score =
          (sim ? 0 : 800) +
          waste * (fill ? 40 : 8_000) +
          Math.abs(sum - PREFERRED_KG) * 0.2 +
          j * 1e-6;
        if (score < bestScore) {
          bestScore = score;
          bestI = i;
          bestJ = j;
        }
      }
    }
    if (bestI < 0) break;
    absorb(boxes[bestJ], boxes[bestI]);
    boxes.splice(bestI, 1);
  }
}

function dumpLeftovers(boxes: Box[]) {
  const live0 = boxes.filter((b) => !b.hardSolo && b.pieces.length);
  const total0 = live0.reduce((s, b) => s + b.weight, 0);
  const n0 = live0.reduce((s, b) => s + b.pieces.length, 0);
  const fillTo = fillTargetKg(total0, n0);
  const equalize = shouldEqualize(total0, targetBoxCount(total0, n0));
  for (let guard = 0; guard < 200; guard++) {
    const strayI = boxes.findIndex(
      (b) => !b.hardSolo && b.pieces.length && b.weight + 1e-9 < PREFERRED_KG,
    );
    if (strayI < 0) break;
    const stray = boxes[strayI];
    let bestJ = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let j = 0; j < boxes.length; j++) {
      if (j === strayI) continue;
      const sink = boxes[j];
      if (sink.hardSolo || !sink.pieces.length) continue;
      if (equalize && sink.weight + 1e-9 >= fillTo) continue;
      const fill = stray.weight + 1e-9 < PREFERRED_KG;
      if (!canAbsorb(sink, stray, fill)) continue;
      const waste = stackWaste(sink.length_mm, sink.width_mm, stray.length_mm, stray.width_mm);
      const sum = sink.weight + stray.weight;
      const sim = stackMatch(sink.length_mm, sink.width_mm, stray.length_mm, stray.width_mm);
      const strip =
        stray.pieces.every((p) => isStripPanel(p.length_mm, p.width_mm)) &&
        stray.pieces.every((p) =>
          stripFitsHost(p, { length_mm: sink.length_mm, width_mm: sink.width_mm }),
        );
      const alreadySink = sink.weight > PREFERRED_KG + 0.5 ? 0 : 1_000;
      const keepPref = sink.weight + 1e-9 >= PREFERRED_KG && sink.weight <= 27.5 ? 400 : 0;
      const score =
        (sim ? 0 : strip ? -3_000 : 2_000) +
        waste * (fill ? 40 : 20_000) +
        alreadySink +
        keepPref +
        Math.abs(sum - PREFERRED_KG) * 0.2 +
        j * 1e-6;
      if (score < bestScore) {
        bestScore = score;
        bestJ = j;
      }
    }
    if (bestJ < 0) break;
    absorb(boxes[bestJ], stray);
    boxes.splice(strayI, 1);
  }
}

function rebalance(boxes: Box[]) {
  const live = () => boxes.filter((b) => !b.hardSolo && b.pieces.length);
  let guard = 0;
  while (guard++ < MOVE_LIMIT) {
    const cur = scoreOf(live());
    let bestMove: { from: number; to: number; uid: string; score: number } | null = null;
    for (let i = 0; i < boxes.length; i++) {
      const src = boxes[i];
      if (src.hardSolo || src.pieces.length < 1) continue;
      for (const piece of src.pieces) {
        for (let j = 0; j < boxes.length; j++) {
          if (i === j) continue;
          const dst = boxes[j];
          if (dst.hardSolo) continue;
          if (!canMove(src, dst, piece)) continue;
          applyMove(src, dst, piece);
          const next = scoreOf(live());
          undoMove(src, dst, piece);
          if (next + 1e-9 < (bestMove ? bestMove.score : cur)) {
            bestMove = { from: i, to: j, uid: piece.uid, score: next };
          }
        }
      }
    }
    if (!bestMove) break;
    const piece = boxes[bestMove.from].pieces.find((p) => p.uid === bestMove.uid);
    if (!piece) break;
    applyMove(boxes[bestMove.from], boxes[bestMove.to], piece);
    if (!boxes[bestMove.from].pieces.length) boxes.splice(bestMove.from, 1);
  }

  guard = 0;
  while (guard++ < SWAP_LIMIT) {
    const cur = scoreOf(live());
    let best: { i: number; j: number; a: string; b: string; score: number } | null = null;
    for (let i = 0; i < boxes.length; i++) {
      const A = boxes[i];
      if (A.hardSolo || A.pieces.length < 1) continue;
      for (let j = i + 1; j < boxes.length; j++) {
        const B = boxes[j];
        if (B.hardSolo || B.pieces.length < 1) continue;
        for (const pa of A.pieces) {
          for (const pb of B.pieces) {
            if (!canSwap(A, B, pa, pb)) continue;
            applySwap(A, B, pa, pb);
            const next = scoreOf(live());
            applySwap(A, B, pb, pa);
            if (next + 1e-9 < (best ? best.score : cur)) {
              best = { i, j, a: pa.uid, b: pb.uid, score: next };
            }
          }
        }
      }
    }
    if (!best) break;
    const pa = boxes[best.i].pieces.find((p) => p.uid === best.a);
    const pb = boxes[best.j].pieces.find((p) => p.uid === best.b);
    if (!pa || !pb) break;
    applySwap(boxes[best.i], boxes[best.j], pa, pb);
  }
}

function canPlace(box: Box, piece: Piece, fillUnder: boolean): boolean {
  if (box.hardSolo) return false;
  if (isBigPiece(piece) && bigCount(box) >= 2) return false;
  if (box.weight + piece.weight > capAfterAdd(box, piece) + 1e-9) return false;
  const clone: Box = {
    pieces: box.pieces.concat(piece),
    weight: 0,
    length_mm: 0,
    width_mm: 0,
    hardSolo: false,
    oversize: box.oversize,
  };
  refresh(clone);
  return layoutValid(clone, fillUnder);
}

function layoutValid(box: Box, fillUnder = true): boolean {
  if (!box.pieces.length) return true;
  if (box.weight > boxCap(box) + 1e-9 && !box.hardSolo) return false;
  const floor = floorPiece(box.pieces);
  if (!floor) return true;
  for (const p of box.pieces) {
    if (p.uid === floor.uid) continue;
    const under = fitsUnder(p.length_mm, p.width_mm, floor.length_mm, floor.width_mm);
    if (isThinPanel(p.thickness_mm)) {
      if (!under) return false;
      continue;
    }
    if (isStripPanel(p.length_mm, p.width_mm)) {
      if (!stripFitsHost(p, floor)) return false;
      continue;
    }
    if (stackMatch(p.length_mm, p.width_mm, floor.length_mm, floor.width_mm)) continue;
    if (isBigPiece(p) && isBigPiece(floor)) return false;
    if (fillUnder && under) continue;
    return false;
  }
  return true;
}

function isThinBox(box: Box): boolean {
  return box.pieces.length > 0 && box.pieces.every((p) => p.thickness_mm < THIN_MAX_MM);
}

function floorPiece(pieces: Piece[]): Piece | null {
  if (!pieces.length) return null;
  const carcass = pieces.filter((p) => p.thickness_mm >= THIN_MAX_MM);
  const pool = carcass.length ? carcass : pieces;
  let best = pool[0];
  let bestArea = best.length_mm * best.width_mm;
  for (const p of pool) {
    const area = p.length_mm * p.width_mm;
    if (area > bestArea) {
      best = p;
      bestArea = area;
    }
  }
  return best;
}

function canAbsorb(target: Box, src: Box, fillUnder: boolean): boolean {
  if (target.hardSolo || src.hardSolo) return false;
  const nBig = bigCount(target) + src.pieces.filter(isBigPiece).length;
  if (src.pieces.some(isBigPiece) && bigCount(target) >= 2) return false;
  const similar = stackMatch(target.length_mm, target.width_mm, src.length_mm, src.width_mm);
  const cap = weightCap({ bigPair: nBig >= 2, similar, fillUnder: !similar && fillUnder });
  if (target.weight + src.weight > cap + 1e-9) return false;
  const clone: Box = {
    pieces: [...target.pieces],
    weight: target.weight,
    length_mm: target.length_mm,
    width_mm: target.width_mm,
    hardSolo: false,
    oversize: target.oversize,
  };
  for (const p of sortDifficult(src.pieces)) {
    if (!canPlace(clone, p, fillUnder)) return false;
    addPiece(clone, p);
  }
  return true;
}

function canMove(src: Box, dst: Box, piece: Piece): boolean {
  if (src.pieces.length === 1 && dst.pieces.length === 0) return false;
  if (isBigPiece(piece) && bigCount(src) === 2) return false;
  const fill = dst.weight + 1e-9 < PREFERRED_KG || src.weight + 1e-9 < PREFERRED_KG;
  const clone: Box = {
    pieces: dst.pieces.slice(),
    weight: dst.weight,
    length_mm: dst.length_mm,
    width_mm: dst.width_mm,
    hardSolo: dst.hardSolo,
    oversize: dst.oversize,
  };
  return canPlace(clone, piece, fill);
}

function canSwap(A: Box, B: Box, pa: Piece, pb: Piece): boolean {
  if (isBigPiece(pa) && bigCount(A) === 2) return false;
  if (isBigPiece(pb) && bigCount(B) === 2) return false;
  const fill = A.weight + 1e-9 < PREFERRED_KG || B.weight + 1e-9 < PREFERRED_KG;
  return canPlace(without(A, pa), pb, fill) && canPlace(without(B, pb), pa, fill);
}

function without(box: Box, piece: Piece): Box {
  const clone: Box = {
    pieces: box.pieces.filter((p) => p.uid !== piece.uid),
    weight: 0,
    length_mm: 0,
    width_mm: 0,
    hardSolo: box.hardSolo,
    oversize: box.oversize,
  };
  refresh(clone);
  return clone;
}

function applyMove(src: Box, dst: Box, piece: Piece) {
  src.pieces = src.pieces.filter((p) => p.uid !== piece.uid);
  dst.pieces.push(piece);
  refresh(src);
  refresh(dst);
}

function undoMove(src: Box, dst: Box, piece: Piece) {
  applyMove(dst, src, piece);
}

function applySwap(A: Box, B: Box, pa: Piece, pb: Piece) {
  A.pieces = A.pieces.filter((p) => p.uid !== pa.uid);
  B.pieces = B.pieces.filter((p) => p.uid !== pb.uid);
  A.pieces.push(pb);
  B.pieces.push(pa);
  refresh(A);
  refresh(B);
}

function absorb(target: Box, src: Box) {
  for (const p of src.pieces) addPiece(target, p);
}

function addPiece(box: Box, piece: Piece) {
  box.pieces.push(piece);
  refresh(box);
}

function makeBox(piece: Piece, hardSolo: boolean): Box {
  const box: Box = {
    pieces: [piece],
    weight: 0,
    length_mm: 0,
    width_mm: 0,
    hardSolo,
    oversize: false,
  };
  refresh(box);
  return box;
}

function refresh(box: Box) {
  box.weight = box.pieces.reduce((s, p) => s + p.weight, 0);
  const floor = floorPiece(box.pieces);
  if (floor) {
    box.length_mm = Math.max(floor.length_mm, floor.width_mm);
    box.width_mm = Math.min(floor.length_mm, floor.width_mm);
  } else {
    box.length_mm = 0;
    box.width_mm = 0;
  }
  box.oversize = box.pieces.some((p) => Math.max(p.length_mm, p.width_mm) >= OVERSIZE_MM);
}

function scoreOf(boxes: Box[]): number {
  if (!boxes.length) return 0;
  const total = boxes.reduce((s, b) => s + b.weight, 0);
  const n = boxes.reduce((s, b) => s + b.pieces.length, 0);
  const k = targetBoxCount(total, n);
  const equalize = shouldEqualize(total, k);
  let nPref = 0;
  let nUnder = 0;
  let nOver = 0;
  let waste = 0;
  let imb = 0;
  const avg = total / Math.max(boxes.length, 1);
  const underFloor = equalize ? Math.min(PREFERRED_KG, avg) - 0.75 : PREFERRED_KG;
  for (const b of boxes) {
    if (b.weight + 1e-9 < underFloor) nUnder += 1;
    else nPref += 1;
    if (b.weight > HARD_MAX_KG + 1e-9 && bigCount(b) < 2) nOver += 1;
    if (b.weight >= 24.9 && b.weight <= 27.5) nPref += 2;
    waste += 0;
    imb += Math.abs(b.weight - (equalize ? avg : PREFERRED_KG));
  }
  return (
    nUnder * 50_000 +
    nOver * 80_000 +
    Math.abs(boxes.length - k) * 8_000 +
    imb * (equalize ? 40 : 8) +
    waste * 2 +
    boxes.length * 20 -
    nPref * 400
  );
}

function explode(parts: PackPart[]): Piece[] {
  const out: Piece[] = [];
  for (const p of parts) {
    const q = Math.max(1, Math.round(p.qty || 1));
    const w = p.weight_kg / q;
    for (let i = 0; i < q; i++) {
      out.push({
        uid: `${p.id}-${i}`,
        id: p.id,
        name: p.part_name,
        length_mm: p.length_mm,
        width_mm: p.width_mm,
        thickness_mm: p.thickness_mm,
        weight: w,
      });
    }
  }
  return out;
}

function collapse(pieces: Piece[]): { id: number; qty: number }[] {
  const map = new Map<number, number>();
  for (const p of pieces) map.set(p.id, (map.get(p.id) ?? 0) + 1);
  return [...map.entries()].map(([id, qty]) => ({ id, qty }));
}

function sortDifficult(pieces: Piece[]): Piece[] {
  return [...pieces].sort((a, b) => {
    const aa = a.length_mm * a.width_mm;
    const ba = b.length_mm * b.width_mm;
    if (ba !== aa) return ba - aa;
    const al = Math.max(a.length_mm, a.width_mm);
    const bl = Math.max(b.length_mm, b.width_mm);
    if (bl !== al) return bl - al;
    return b.weight - a.weight;
  });
}

function sanitizeUnit(unit: string): string {
  const t = unit.replace(/[^A-Za-z0-9]+/g, "").slice(0, 8).toUpperCase();
  return t || "UNIT";
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
