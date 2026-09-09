import type {
  CutPartInput,
  StockSheetInput,
  OptimizationResult,
  OptimizerSettings,
  SheetLayout,
} from "./types";
import {
  GuillotineSheetPacker,
  assignPartColors,
  type FitRule,
  type SplitRule,
} from "./guillotine";

type SortStrategy =
  | "AREA_DESC"
  | "MAX_DIM_DESC"
  | "LENGTH_DESC"
  | "PERIMETER_DESC"
  | "LONGER_SIDE_FIRST"
  | "ASPECT_RATIO_DESC"
  | "STRIP_CLUSTER_H"   // Smart greedy cluster on width  → horizontal strips
  | "STRIP_CLUSTER_V";  // Smart greedy cluster on length → vertical strips

interface StrategyCombo {
  name: string;
  sort: SortStrategy;
  fit: FitRule;
  split: SplitRule;
}

const TOURNAMENT_STRATEGIES: StrategyCombo[] = [
  // ── STRIP-CLUSTER (industrial beam-saw phases) ──────────────────────────────
  { name: "Jinny Cluster-H (Strip by width + BSSF + StripRip)", sort: "STRIP_CLUSTER_H", fit: "BSSF", split: "STRIP_RIP" },
  { name: "Jinny Cluster-V (Strip by length + BSSF + StripCross)", sort: "STRIP_CLUSTER_V", fit: "BSSF", split: "STRIP_CROSS" },
  // ── CLASSIC AREA-FIRST ───────────────────────────────────────────────────────
  { name: "Jinny Classic (Area + BSSF + MaxAS)", sort: "AREA_DESC", fit: "BSSF", split: "MAXAS" },
  { name: "b_Opti MaxDim (MaxDim + BAF + StripRip)", sort: "MAX_DIM_DESC", fit: "BAF", split: "STRIP_RIP" },
  { name: "Woodwize LongerSide (LongerSide + BSSF + MaxAS)", sort: "LONGER_SIDE_FIRST", fit: "BSSF", split: "MAXAS" },
  { name: "SketchCut Perimeter (Perimeter + BLSF + MaxAS)", sort: "PERIMETER_DESC", fit: "BLSF", split: "MAXAS" },
  { name: "Compact (Area + BAF + MinAS)", sort: "AREA_DESC", fit: "BAF", split: "MINAS" },
  { name: "Length-First (Length + BSSF + LLAS)", sort: "LENGTH_DESC", fit: "BSSF", split: "LLAS" },
];

function expandParts(inputs: CutPartInput[]): CutPartInput[] {
  const expanded: CutPartInput[] = [];
  for (const part of inputs) {
    const qty = Math.max(1, Math.floor(part.qty || 1));
    for (let i = 0; i < qty; i++) {
      expanded.push({
        ...part,
        id: `${part.id}_${i}`,
        qty: 1,
      });
    }
  }
  return expanded;
}

function sortParts(parts: CutPartInput[], strategy: SortStrategy): CutPartInput[] {
  const list = [...parts];
  switch (strategy) {
    case "AREA_DESC":
      return list.sort((a, b) => b.length * b.width - a.length * a.width);
    case "MAX_DIM_DESC":
      return list.sort(
        (a, b) => Math.max(b.length, b.width) - Math.max(a.length, a.width),
      );
    case "LENGTH_DESC":
      return list.sort((a, b) => b.length - a.length || b.width - a.width);
    case "PERIMETER_DESC":
      return list.sort(
        (a, b) => 2 * (b.length + b.width) - 2 * (a.length + a.width),
      );
    case "LONGER_SIDE_FIRST":
      return list.sort(
        (a, b) =>
          Math.max(b.length, b.width) * 10000 +
          Math.min(b.length, b.width) -
          (Math.max(a.length, a.width) * 10000 + Math.min(a.length, a.width)),
      );
    case "ASPECT_RATIO_DESC":
      return list.sort((a, b) => {
        const rB = Math.max(b.length, b.width) / Math.max(1, Math.min(b.length, b.width));
        const rA = Math.max(a.length, a.width) / Math.max(1, Math.min(a.length, a.width));
        return rB - rA;
      });

    // ── SMART STRIP CLUSTERING ─────────────────────────────────────────────────
    // Industrial beam-saw logic (Biesse / Holzma / OptiCut):
    //   Phase 1 – Head cut: one horizontal cut across full sheet → creates a strip
    //   Phase 2 – Rip  cut: cuts strip into individual parts along length
    //   Phase 3 – Cross cut: final trim / second rip if needed
    //   Phase 4 – Z1: tertiary sub-cuts for complex shapes
    //
    // Strategy: greedily cluster parts whose widths are close enough that they
    // can share the same strip (within kerfTolerance). Tallest clusters go first
    // so the head cuts create the fewest, largest strips. NOT forced — the
    // tournament scores all strategies and picks the actual winner.
    case "STRIP_CLUSTER_H": {
      // Greedy clustering on part WIDTH (→ horizontal strips after head cut)
      return stripCluster(list, "width");
    }
    case "STRIP_CLUSTER_V": {
      // Greedy clustering on part LENGTH (→ vertical strips after rip cut)
      return stripCluster(list, "length");
    }
  }
}

/**
 * Greedy strip-cluster sort.
 * 1. Sort all parts by the cluster dimension descending (largest first).
 * 2. Open a "strip" at the tallest part's size.
 * 3. For every subsequent part, if its dimension is within TOLERANCE of the
 *    current strip, add it to the strip (sorted by the other dimension desc).
 * 4. Otherwise, open a new strip.
 * 5. Output strips in order: within each strip, longest part first.
 *
 * This naturally groups same-height parts together without forcing it —
 * any part that doesn't fit a strip starts a new one.
 */
function stripCluster(
  parts: CutPartInput[],
  dim: "width" | "length",
): CutPartInput[] {
  const TOLERANCE = 15; // mm — parts within ±15 mm can share a strip
  const other = dim === "width" ? "length" : "width";

  // Sort by the clustering dimension descending first
  const sorted = [...parts].sort((a, b) => b[dim] - a[dim]);

  // Build clusters greedily
  const clusters: { stripHeight: number; parts: CutPartInput[] }[] = [];
  for (const part of sorted) {
    const h = part[dim];
    // Find existing cluster whose height is within tolerance
    let found = clusters.find(
      (c) => Math.abs(c.stripHeight - h) <= TOLERANCE,
    );
    if (!found) {
      found = { stripHeight: h, parts: [] };
      clusters.push(found);
    }
    found.parts.push(part);
  }

  // Within each cluster, sort by the other dimension descending (longest first
  // → fills the strip left-to-right with less remainder)
  for (const c of clusters) {
    c.parts.sort((a, b) => b[other] - a[other]);
  }

  // Output clusters tallest first (biggest head-cut strip first)
  clusters.sort((a, b) => b.stripHeight - a.stripHeight);

  return clusters.flatMap((c) => c.parts);
}

function packSequence(
  sequence: CutPartInput[],
  stockSheet: StockSheetInput,
  settings: OptimizerSettings,
  fit: FitRule,
  split: SplitRule,
  colorMap: Map<string, string>,
): {
  sheets: SheetLayout[];
  unplaced: CutPartInput[];
} {
  const remaining = [...sequence];
  const sheets: SheetLayout[] = [];

  const maxAllowedSheets = stockSheet.qty ?? 1000;
  let sheetIdx = 0;

  while (remaining.length > 0 && sheetIdx < maxAllowedSheets) {
    const packer = new GuillotineSheetPacker(
      stockSheet,
      settings,
      fit,
      split,
      sheetIdx,
    );

    let placedAnyInPass = false;
    for (let i = 0; i < remaining.length; i++) {
      const part = remaining[i];
      const color = colorMap.get(part.id.split("_")[0]) || "#3b82f6";
      const success = packer.tryPlace(part, color);
      if (success) {
        remaining.splice(i, 1);
        i--;
        placedAnyInPass = true;
      }
    }

    if (!placedAnyInPass) {
      break;
    }

    sheets.push(packer.getLayout());
    sheetIdx++;
  }

  return { sheets, unplaced: remaining };
}

function packSingleStrategy(
  parts: CutPartInput[],
  stockSheet: StockSheetInput,
  settings: OptimizerSettings,
  combo: StrategyCombo,
  colorMap: Map<string, string>,
): {
  sheets: SheetLayout[];
  unplaced: CutPartInput[];
} {
  const sorted = sortParts(parts, combo.sort);
  return packSequence(sorted, stockSheet, settings, combo.fit, combo.split, colorMap);
}

/** Score a candidate layout. Lower = better. */
function scoreLayout(
  sheets: SheetLayout[],
  unplaced: CutPartInput[],
): number {
  const unplacedPenalty = unplaced.length * 1_000_000;
  const sheetCountPenalty = sheets.length * 10_000;
  const totalWasteArea = sheets.reduce((acc, s) => acc + s.wasteAreaMm2, 0);
  const lastSheetUsed = sheets.length > 0 ? sheets[sheets.length - 1].usedAreaMm2 : 0;

  // Reward the largest single reusable offcut (big offcut = useful residual panel)
  let largestOffcutArea = 0;
  for (const s of sheets) {
    for (const off of s.offcuts) {
      if (off.isReusable && off.areaMm2 > largestOffcutArea) {
        largestOffcutArea = off.areaMm2;
      }
    }
  }

  // Strip-diversity penalty: penalize layouts with many distinct Y-row heights
  // (fewer distinct cut depths = fewer head cuts = cleaner phase sequence).
  // We measure it as the number of distinct cut stages used per sheet, averaged.
  let stripDiversityPenalty = 0;
  for (const s of sheets) {
    const uniqueStages = new Set(s.cutLines.map((c) => c.stage)).size;
    stripDiversityPenalty += uniqueStages * 0.5; // small soft penalty
  }

  return (
    unplacedPenalty
    + sheetCountPenalty
    + totalWasteArea * 0.000001
    + lastSheetUsed * 0.0001
    - largestOffcutArea * 0.000005
    + stripDiversityPenalty
  );
}

export function runOptimizationTournament(
  inputParts: CutPartInput[],
  stockSheet: StockSheetInput,
  settings: OptimizerSettings,
): OptimizationResult {
  const startTime = performance.now();
  const allParts = expandParts(inputParts);
  const colorMap = assignPartColors(inputParts);

  if (allParts.length === 0) {
    return {
      sheets: [],
      unplacedParts: [],
      totalSheets: 0,
      totalPartsCount: 0,
      placedPartsCount: 0,
      totalSheetAreaM2: 0,
      totalUsedAreaM2: 0,
      totalWasteAreaM2: 0,
      reusableOffcutAreaM2: 0,
      overallEfficiencyPct: 0,
      overallWastePct: 0,
      totalCutLengthM: 0,
      executionTimeMs: 0,
      championHeuristic: "None",
    };
  }

  let championCombo: StrategyCombo = TOURNAMENT_STRATEGIES[0];
  let championSheets: SheetLayout[] = [];
  let championUnplaced: CutPartInput[] = [];
  let bestScore = Infinity;

  // 1. FAST DETERMINISTIC PHASE (Base Heuristics)
  let strategiesToRun = TOURNAMENT_STRATEGIES;
  if (allParts.length > 5000) {
    strategiesToRun = [TOURNAMENT_STRATEGIES[0]]; 
  } else if (allParts.length > 1500) {
    strategiesToRun = [TOURNAMENT_STRATEGIES[0], TOURNAMENT_STRATEGIES[1], TOURNAMENT_STRATEGIES[7]];
  }

  for (const combo of strategiesToRun) {
    const { sheets, unplaced } = packSingleStrategy(
      allParts,
      stockSheet,
      settings,
      combo,
      colorMap,
    );

    const score = scoreLayout(sheets, unplaced);

    if (score < bestScore) {
      bestScore = score;
      championCombo = combo;
      championSheets = sheets;
      championUnplaced = unplaced;
    }
  }

  // 2. ENTERPRISE DEEP SEARCH PHASE (Jinny Genetic Algorithm / JDS)
  // Mimics top-tier software and advanced repos (like freecut's population pipeline)
  // by maintaining a population of sequences and applying Order Crossover (OX1) + Mutation.
  if (allParts.length > 0 && allParts.length <= 1000 && bestScore < Infinity) {
    const timeLimitMs = Math.min(1000, Math.max(300, 150000 / allParts.length)); 
    const startDeepSearch = performance.now();
    let deepSearchGenerations = 0;
    
    // Initialize Population with the best deterministic sequence
    let eliteSequence = sortParts(allParts, championCombo.sort);
    const populationSize = 10;
    let population: CutPartInput[][] = [eliteSequence];
    
    // Seed the initial population with mutated versions of the elite
    for (let i = 1; i < populationSize; i++) {
      const mutant = [...eliteSequence];
      const idx1 = Math.floor(Math.random() * mutant.length);
      const idx2 = Math.floor(Math.random() * mutant.length);
      [mutant[idx1], mutant[idx2]] = [mutant[idx2], mutant[idx1]];
      population.push(mutant);
    }
    
    while (performance.now() - startDeepSearch < timeLimitMs) {
      deepSearchGenerations++;
      
      // Select two parents randomly (bias towards the first few which are elites)
      const p1Idx = Math.floor(Math.random() * (populationSize / 2));
      const p2Idx = Math.floor(Math.random() * populationSize);
      const parent1 = population[p1Idx];
      const parent2 = population[p2Idx];
      
      let child = [...parent1];
      
      const rand = Math.random();
      if (rand < 0.5) {
        // Crossover: Order Crossover (OX1)
        // Inherit a chunk from parent1, fill the rest from parent2 in order
        const start = Math.floor(Math.random() * parent1.length);
        const end = start + Math.floor(Math.random() * (parent1.length - start));
        const inherited = new Set(parent1.slice(start, end).map(p => p.id));
        
        child = [];
        let p2Ptr = 0;
        for (let i = 0; i < parent1.length; i++) {
          if (i >= start && i < end) {
            child.push(parent1[i]);
          } else {
            while (inherited.has(parent2[p2Ptr].id)) {
              p2Ptr++;
            }
            child.push(parent2[p2Ptr]);
            p2Ptr++;
          }
        }
      } else {
        // Mutation only (Swap, Reverse chunk, or Shift)
        child = [...parent1];
        if (Math.random() < 0.4) {
          const idx1 = Math.floor(Math.random() * child.length);
          const idx2 = Math.floor(Math.random() * child.length);
          [child[idx1], child[idx2]] = [child[idx2], child[idx1]];
        } else if (Math.random() < 0.7) {
          const start = Math.floor(Math.random() * (child.length - 1));
          const len = Math.floor(Math.random() * Math.min(8, child.length - start));
          const chunk = child.splice(start, len);
          chunk.reverse();
          child.splice(start, 0, ...chunk);
        } else {
          const idx1 = Math.floor(Math.random() * child.length);
          const part = child.splice(idx1, 1)[0];
          const insertIdx = Math.floor(Math.random() * Math.max(1, idx1)); 
          child.splice(insertIdx, 0, part);
        }
      }
      
      const { sheets, unplaced } = packSequence(
        child,
        stockSheet,
        settings,
        championCombo.fit,
        championCombo.split,
        colorMap
      );
      
      const score = scoreLayout(sheets, unplaced);

      // If child is better than our global best, it becomes the new elite!
      if (score < bestScore) {
        bestScore = score;
        const baseName = championCombo.name.includes("Deep Search") 
          ? championCombo.name.split(" |")[0] 
          : championCombo.name;
        championCombo = { ...championCombo, name: `${baseName} | Jinny Deep Search (JDS) Gen #${deepSearchGenerations}` };
        championSheets = sheets;
        championUnplaced = unplaced;
        eliteSequence = child;
        
        // Inject into population at the top
        population.unshift(child);
        population.pop(); // keep size constant
      } else {
        // Occasionally keep mediocre children to maintain genetic diversity
        if (Math.random() < 0.2) {
          population[Math.floor(Math.random() * (populationSize - 1)) + 1] = child;
        }
      }
    }
  }

  const executionTimeMs = Math.round(performance.now() - startTime);

  // Compute aggregated statistics
  const totalSheetAreaMm2 = championSheets.reduce((acc, s) => acc + s.totalAreaMm2, 0);
  const totalUsedAreaMm2 = championSheets.reduce((acc, s) => acc + s.usedAreaMm2, 0);
  const totalWasteAreaMm2 = Math.max(0, totalSheetAreaMm2 - totalUsedAreaMm2);

  const reusableOffcutAreaMm2 = championSheets.reduce(
    (acc, s) =>
      acc +
      s.offcuts
        .filter((o) => o.isReusable)
        .reduce((sum, o) => sum + o.areaMm2, 0),
    0,
  );

  const totalCutLengthMm = championSheets.reduce(
    (acc, s) =>
      acc +
      s.cutLines.reduce(
        (sum, c) => sum + Math.abs(c.x2 - c.x1) + Math.abs(c.y2 - c.y1),
        0,
      ),
    0,
  );

  const placedPartsCount = championSheets.reduce((acc, s) => acc + s.placedParts.length, 0);
  const overallEfficiencyPct =
    totalSheetAreaMm2 > 0 ? (totalUsedAreaMm2 / totalSheetAreaMm2) * 100 : 0;
  const overallWastePct = 100 - overallEfficiencyPct;

  return {
    sheets: championSheets,
    unplacedParts: championUnplaced,
    totalSheets: championSheets.length,
    totalPartsCount: allParts.length,
    placedPartsCount,
    totalSheetAreaM2: Number((totalSheetAreaMm2 / 1_000_000).toFixed(2)),
    totalUsedAreaM2: Number((totalUsedAreaMm2 / 1_000_000).toFixed(2)),
    totalWasteAreaM2: Number((totalWasteAreaMm2 / 1_000_000).toFixed(2)),
    reusableOffcutAreaM2: Number((reusableOffcutAreaMm2 / 1_000_000).toFixed(2)),
    overallEfficiencyPct: Number(overallEfficiencyPct.toFixed(1)),
    overallWastePct: Number(overallWastePct.toFixed(1)),
    totalCutLengthM: Number((totalCutLengthMm / 1000).toFixed(1)),
    executionTimeMs,
    championHeuristic: championCombo.name,
  };
}
