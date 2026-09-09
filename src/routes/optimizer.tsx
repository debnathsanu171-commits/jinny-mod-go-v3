import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Scissors,
  Layers,
  Sparkles,
  Plus,
  Trash2,
  RotateCcw,
  Printer,
  Download,
  Upload,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
} from "lucide-react";
import { Guard } from "@/components/guard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Kpi } from "@/components/kpi";
import { SheetCanvas } from "@/components/optimizer/sheet-canvas";
import {
  type CutPartInput,
  type StockSheetInput,
  type OptimizerSettings,
  type OptimizationResult,
  STANDARD_SHEET_PRESETS,
  DEFAULT_OPTIMIZER_SETTINGS,
} from "@/lib/optimizer/types";
import { runOptimizationTournament } from "@/lib/optimizer/tournament";
import { listProjects, getProject } from "@/lib/server";
import { ManualBuilder } from "@/components/optimizer/manual-builder";

export const Route = createFileRoute("/optimizer")({ component: OptimizerPage });

function OptimizerPage() {
  return (
    <Guard title="Cut-List Optimizer" perm="projects">
      <OptimizerView />
    </Guard>
  );
}

// Initial sample parts for demonstration
const INITIAL_DEMO_PARTS: CutPartInput[] = [
  { id: "p1", name: "Side Panel Left", length: 820, width: 560, qty: 2, material: "HDHMR", grain: "length", canRotate: false, unit: "Base Unit" },
  { id: "p2", name: "Side Panel Right", length: 820, width: 560, qty: 2, material: "HDHMR", grain: "length", canRotate: false, unit: "Base Unit" },
  { id: "p3", name: "Bottom Shelf", length: 864, width: 560, qty: 2, material: "HDHMR", grain: "none", canRotate: true, unit: "Base Unit" },
  { id: "p4", name: "Top Stretcher", length: 864, width: 100, qty: 4, material: "HDHMR", grain: "none", canRotate: true, unit: "Base Unit" },
  { id: "p5", name: "Adjustable Shelf", length: 860, width: 540, qty: 2, material: "HDHMR", grain: "none", canRotate: true, unit: "Base Unit" },
  { id: "p6", name: "Drawer Front", length: 440, width: 200, qty: 4, material: "HDHMR", grain: "length", canRotate: false, unit: "Drawer Box" },
  { id: "p7", name: "Drawer Side", length: 500, width: 180, qty: 8, material: "HDHMR", grain: "none", canRotate: true, unit: "Drawer Box" },
  { id: "p8", name: "Back Panel", length: 820, width: 890, qty: 1, material: "HDHMR", grain: "length", canRotate: false, unit: "Base Unit" },
];

function OptimizerView() {
  const [parts, setParts] = useState<CutPartInput[]>(INITIAL_DEMO_PARTS);
  const [selectedSheetPreset, setSelectedSheetPreset] = useState("sheet-8x4-18");
  const [stockSheet, setStockSheet] = useState<StockSheetInput>(STANDARD_SHEET_PRESETS[0]);
  const [settings, setSettings] = useState<OptimizerSettings>(DEFAULT_OPTIMIZER_SETTINGS);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [highlightPartId, setHighlightPartId] = useState<string | null>(null);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [showManualBuilder, setShowManualBuilder] = useState(false);
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  // Projects list for 1-click import
  const projectsQ = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });

  // Handle Preset Change
  const handlePresetChange = (presetId: string) => {
    setSelectedSheetPreset(presetId);
    const found = STANDARD_SHEET_PRESETS.find((p) => p.id === presetId);
    if (found) {
      setStockSheet({ ...found });
    }
  };

  // Run Optimization
  const handleRunOptimization = () => {
    if (parts.length === 0) {
      toast.error("Please add at least one part to optimize.");
      return;
    }

    try {
      const optResult = runOptimizationTournament(parts, stockSheet, settings);
      setResult(optResult);
      setActiveSheetIndex(0);
      toast.success(
        `Optimized! Used ${optResult.totalSheets} sheet(s) with ${optResult.overallEfficiencyPct}% yield.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Optimization failed.");
    }
  };

  // Import from an existing factory project
  const handleLoadProject = async (projectIdStr: string) => {
    if (!projectIdStr) return;
    try {
      const projData = await getProject({ data: Number(projectIdStr) });
      if (!projData || !projData.parts || projData.parts.length === 0) {
        toast.error("Project has no cutlist parts.");
        return;
      }

      const importedParts: CutPartInput[] = projData.parts.map((p, idx) => {
        const isWoodgrain = /wood|grain|veneer|oak|walnut|teak/i.test(p.material || "");
        return {
          id: `imp_${p.id || idx}`,
          name: p.part_name || `Part #${idx + 1}`,
          length: Number(p.length_mm) || 100,
          width: Number(p.width_mm) || 100,
          qty: p.qty || 1,
          material: p.material || "HDHMR",
          grain: isWoodgrain ? "length" : "none",
          canRotate: !isWoodgrain,
          unit: p.unit,
        };
      });

      setParts(importedParts);
      setSelectedProjectId(projectIdStr);
      toast.success(`Loaded ${importedParts.length} parts from ${projData.project.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load project parts.");
    }
  };

  // Quick Part Add
  const handleAddPart = () => {
    const newPart: CutPartInput = {
      id: `custom_${Date.now()}`,
      name: `Part ${parts.length + 1}`,
      length: 600,
      width: 400,
      qty: 1,
      material: stockSheet.material,
      grain: "none",
      canRotate: true,
      unit: "Custom",
    };
    setParts([...parts, newPart]);
  };

  // Update Part Field
  const handleUpdatePart = (id: string, updates: Partial<CutPartInput>) => {
    setParts((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const updated = { ...p, ...updates };
        if (updates.grain !== undefined) {
          updated.canRotate = updates.grain === "none";
        }
        return updated;
      }),
    );
  };

  // Remove Part
  const handleRemovePart = (id: string) => {
    setParts((prev) => prev.filter((p) => p.id !== id));
  };

  // Handle Cutlist Paste
  const handlePasteSubmit = () => {
    if (!pasteText.trim()) return;
    const lines = pasteText.trim().split("\n");
    const parsed: CutPartInput[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith("#") || line.toLowerCase().startsWith("length")) continue;

      const cols = line.split(/[,\t]+/).map((c) => c.trim());
      if (cols.length >= 2) {
        const l = Number(cols[0]);
        const w = Number(cols[1]);
        const qty = cols.length >= 3 ? Number(cols[2]) || 1 : 1;
        const name = cols.length >= 4 ? cols[3] : `Part ${parsed.length + 1}`;
        const grainVal = cols.length >= 5 ? cols[4].toLowerCase() : "none";
        const grain = grainVal === "length" || grainVal === "width" ? grainVal : "none";

        if (l > 0 && w > 0) {
          parsed.push({
            id: `pasted_${Date.now()}_${i}`,
            name,
            length: l,
            width: w,
            qty,
            material: stockSheet.material,
            grain,
            canRotate: grain === "none",
          });
        }
      }
    }

    if (parsed.length > 0) {
      setParts((prev) => [...prev, ...parsed]);
      toast.success(`Imported ${parsed.length} parts!`);
      setPasteModalOpen(false);
      setPasteText("");
    } else {
      toast.error("Could not parse cutlist. Use format: Length, Width, Qty, Name");
    }
  };

  // Active Sheet Layout
  const activeSheet = result?.sheets[activeSheetIndex] || null;

  // Print Cutting Plan
  const handlePrint = () => {
    window.print();
  };

  // Group parts on active sheet for cleaner display
  const groupedPlacedParts = useMemo(() => {
    if (!activeSheet) return [];
    const groups = new Map<string, any>();
    
    for (const p of activeSheet.placedParts) {
      const key = `${p.partId}_${p.rotated}`;
      if (groups.has(key)) {
        groups.get(key).qty += 1;
      } else {
        groups.set(key, { ...p, qty: 1 });
      }
    }
    return Array.from(groups.values());
  }, [activeSheet]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="grid size-9 place-items-center rounded-lg bg-primary text-on-primary">
              <Scissors className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Industrial Optimizer (Max-Yield)</h1>
              <p className="text-xs text-muted">
                True Guillotine Edge-to-Edge Logic · Massive Scale Engine (10k+ Panels)
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Project Selector */}
          <div className="flex items-center gap-1.5">
            <FolderOpen className="size-4 text-muted" />
            <select
              value={selectedProjectId}
              onChange={(e) => handleLoadProject(e.target.value)}
              className="h-9 rounded-md border border-outline bg-paper px-3 text-xs font-medium text-foreground outline-none transition-colors hover:border-primary/50"
            >
              <option value="">Load from Project…</option>
              {(projectsQ.data ?? []).map((proj) => (
                <option key={proj.id} value={String(proj.id)}>
                  {proj.code} · {proj.name} ({proj.parts} parts)
                </option>
              ))}
            </select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setPasteModalOpen(true)}
            title="Paste CSV or tab-separated cutlist"
          >
            <FileSpreadsheet className="size-4" />
            Paste CSV
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettingsDrawer(!showSettingsDrawer)}
            className={showSettingsDrawer ? "border-primary text-primary" : ""}
          >
            <Sliders className="size-4" />
            Saw Settings
          </Button>

          {result && (
            <Button variant="outline" size="sm" onClick={handlePrint} className="no-print">
              <Printer className="size-4" />
              Print Saw Plan
            </Button>
          )}

          <Button variant="outline" onClick={() => setShowManualBuilder(true)} className="gap-2">
            <Plus className="size-4" />
            Manual Builder
          </Button>

          <Button onClick={handleRunOptimization} className="gap-2 bg-ok text-white hover:bg-ok/90">
            <Sparkles className="size-4" />
            Optimize Cutlist
          </Button>
        </div>
      </div>

      {/* Optional Saw & Stock Settings Drawer */}
      {showSettingsDrawer && (
        <Card className="animate-fade-in border-info/30 bg-info/5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              Stock Sheet & Saw Parameters
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSettings(DEFAULT_OPTIMIZER_SETTINGS);
                toast.info("Reset to factory saw defaults.");
              }}
            >
              Reset Defaults
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <Label className="text-xs">Sheet Preset</Label>
              <select
                value={selectedSheetPreset}
                onChange={(e) => handlePresetChange(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-outline bg-paper px-2 text-xs"
              >
                {STANDARD_SHEET_PRESETS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-xs">Sheet Length (mm)</Label>
              <Input
                type="number"
                value={stockSheet.length}
                onChange={(e) =>
                  setStockSheet({ ...stockSheet, length: Number(e.target.value) || 2440 })
                }
                className="mt-1 h-9 font-mono text-xs"
              />
            </div>

            <div>
              <Label className="text-xs">Sheet Width (mm)</Label>
              <Input
                type="number"
                value={stockSheet.width}
                onChange={(e) =>
                  setStockSheet({ ...stockSheet, width: Number(e.target.value) || 1220 })
                }
                className="mt-1 h-9 font-mono text-xs"
              />
            </div>

            <div>
              <Label className="text-xs">Saw Kerf (mm)</Label>
              <Input
                type="number"
                step="0.1"
                value={settings.kerfMm}
                onChange={(e) =>
                  setSettings({ ...settings, kerfMm: Number(e.target.value) || 3.2 })
                }
                className="mt-1 h-9 font-mono text-xs"
                placeholder="e.g. 3.2"
              />
            </div>

            <div>
              <Label className="text-xs">Edge Trim (mm)</Label>
              <Input
                type="number"
                value={stockSheet.trimTop}
                onChange={(e) => {
                  const v = Number(e.target.value) || 0;
                  setStockSheet({
                    ...stockSheet,
                    trimTop: v,
                    trimBottom: v,
                    trimLeft: v,
                    trimRight: v,
                  });
                }}
                className="mt-1 h-9 font-mono text-xs"
                placeholder="e.g. 10"
              />
            </div>

            <div>
              <Label className="text-xs">Part Rotation</Label>
              <select
                value={settings.allowPartRotation ? "yes" : "no"}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    allowPartRotation: e.target.value === "yes",
                  })
                }
                className="mt-1 h-9 w-full rounded-md border border-outline bg-paper px-2 text-xs"
              >
                <option value="yes">Allowed (Rotational fit)</option>
                <option value="no">Locked (Strict Grain)</option>
              </select>
            </div>
          </div>
        </Card>
      )}

      {/* Results KPIs if optimized */}
      {result && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 animate-fade-in">
          <Kpi
            label="Sheets Required"
            value={`${result.totalSheets} Sheets`}
            icon={Layers}
            hint={`Total Area: ${result.totalSheetAreaM2} m²`}
            bar={100}
            barClass="bg-info"
          />
          <Kpi
            label="Material Yield"
            value={`${result.overallEfficiencyPct}%`}
            icon={CheckCircle2}
            hint={`Used: ${result.totalUsedAreaM2} m²`}
            bar={result.overallEfficiencyPct}
            barClass={result.overallEfficiencyPct > 85 ? "bg-ok" : "bg-warn"}
          />
          <Kpi
            label="Wastage"
            value={`${result.overallWastePct}%`}
            icon={Scissors}
            hint={`Waste Area: ${result.totalWasteAreaM2} m²`}
            bar={result.overallWastePct}
            barClass="bg-danger"
          />
          <Kpi
            label="Usable Offcuts"
            value={`${result.reusableOffcutAreaM2} m²`}
            icon={Sparkles}
            hint="Can be saved for future jobs"
            bar={
              result.totalWasteAreaM2 > 0
                ? (result.reusableOffcutAreaM2 / result.totalWasteAreaM2) * 100
                : 0
            }
            barClass="bg-ok"
          />
          <Kpi
            label="Total Parts"
            value={`${result.placedPartsCount} / ${result.totalPartsCount}`}
            icon={CheckCircle2}
            hint={
              result.unplacedParts.length === 0
                ? "All parts placed"
                : `${result.unplacedParts.length} parts unplaced!`
            }
          />
          <Kpi
            label="Engine Exec Time"
            value={`${result.executionTimeMs} ms`}
            icon={Sliders}
            hint={result.championHeuristic}
          />
        </div>
      )}

      {/* Unplaced Parts Alert if any */}
      {result && result.unplacedParts.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-danger/40 bg-danger/10 p-4 text-xs text-danger">
          <AlertTriangle className="size-5 shrink-0" />
          <div>
            <p className="font-bold">
              Warning: {result.unplacedParts.length} parts could not fit on the sheet!
            </p>
            <p className="mt-0.5 text-muted">
              These parts exceed the usable sheet dimensions ({stockSheet.length} × {stockSheet.width} mm) or stock limit.
            </p>
          </div>
        </div>
      )}

      {/* Main Content Area: Left/Top is Visualizer (if results), Right/Bottom is Cut-List */}
      {result && activeSheet ? (
        <div className="space-y-4">
          {/* Sheet Navigator */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={activeSheetIndex === 0}
                onClick={() => setActiveSheetIndex((i) => Math.max(0, i - 1))}
              >
                <ChevronLeft className="size-4" />
                Previous
              </Button>

              <div className="flex max-w-[50vw] overflow-x-auto items-center gap-1 scrollbar-hide py-1">
                {result.sheets.map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveSheetIndex(idx)}
                    className={`h-8 rounded px-3 text-xs font-medium whitespace-nowrap transition-all ${
                      idx === activeSheetIndex
                        ? "bg-primary text-on-primary shadow-sm"
                        : "bg-surface-container text-foreground hover:bg-surface-low"
                    }`}
                  >
                    Sheet {idx + 1}
                  </button>
                ))}
              </div>

              <Button
                variant="outline"
                size="sm"
                disabled={activeSheetIndex === result.sheets.length - 1}
                onClick={() =>
                  setActiveSheetIndex((i) => Math.min(result.sheets.length - 1, i + 1))
                }
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            </div>

            <div className="text-xs text-muted">
              Showing Sheet {activeSheetIndex + 1} of {result.totalSheets}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
            {/* Sheet Canvas Layout */}
            <Card className="p-4">
              <SheetCanvas
                layout={activeSheet}
                highlightPartId={highlightPartId}
                onSelectPart={(p) => setHighlightPartId(p ? p.id : null)}
              />
            </Card>

            {/* Parts on this Sheet Table */}
            <Card className="p-4 flex flex-col max-h-[682px]">
              <h3 className="mb-3 text-sm font-semibold">
                Parts on Sheet #{activeSheetIndex + 1} ({activeSheet.placedParts.length})
              </h3>
              <div className="overflow-y-auto flex-1 border rounded-md border-outline">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-paper border-b border-outline text-muted z-10">
                    <tr>
                      <th className="px-3 py-2 font-medium">Part Name</th>
                      <th className="px-3 py-2 font-medium">Qty</th>
                      <th className="px-3 py-2 font-medium">Size (L×W)</th>
                      <th className="px-3 py-2 font-medium">Orient.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline">
                    {groupedPlacedParts.map((p, i) => (
                      <tr
                        key={i}
                        onMouseEnter={() => setHighlightPartId(p.id)}
                        onMouseLeave={() => setHighlightPartId(null)}
                        className={`cursor-pointer transition-colors ${
                          highlightPartId === p.id ? "bg-info/15 font-semibold" : "hover:bg-surface-low"
                        }`}
                      >
                        <td className="px-3 py-2 flex items-center gap-2">
                          <span
                            className="size-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: p.color }}
                          />
                          <span className="truncate max-w-[120px]" title={p.name}>{p.name}</span>
                        </td>
                        <td className="px-3 py-2 font-bold">{p.qty}x</td>
                        <td className="px-3 py-2 font-mono whitespace-nowrap">
                          {p.length}×{p.width}
                        </td>
                        <td className="px-3 py-2">
                          {p.rotated ? (
                            <Badge tone="warn" className="text-[10px]">Rotated</Badge>
                          ) : (
                            <Badge tone="muted" className="text-[10px]">Normal</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {/* Cut-List Input Table Card */}
      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">
              Parts Cut-List ({parts.reduce((s, p) => s + (p.qty || 1), 0)} panels total)
            </h2>
            <p className="text-xs text-muted">
              Add panels, set dimensions in mm, specify grain or allow rotation to minimize wastage.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleAddPart}>
              <Plus className="size-4" />
              Add Panel
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setParts([]);
                setResult(null);
                toast.info("Cut-list cleared.");
              }}
              disabled={parts.length === 0}
            >
              <Trash2 className="size-4 text-danger" />
              Clear All
            </Button>
          </div>
        </div>

        {/* Parts Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-outline text-muted">
              <tr>
                <th className="pb-2 font-medium">#</th>
                <th className="pb-2 font-medium">Part Name</th>
                <th className="pb-2 font-medium">Unit / Cabinet</th>
                <th className="pb-2 font-medium">Length (mm)</th>
                <th className="pb-2 font-medium">Width (mm)</th>
                <th className="pb-2 font-medium">Qty</th>
                <th className="pb-2 font-medium">Material</th>
                <th className="pb-2 font-medium">Grain / Rotation</th>
                <th className="pb-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline">
              {parts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-muted">
                    No panels in cut-list. Click "Add Panel", "Paste CSV", or select a Project above!
                  </td>
                </tr>
              ) : (
                parts.map((p, idx) => (
                  <tr key={p.id} className="hover:bg-surface-low">
                    <td className="py-2 text-muted font-mono">{idx + 1}</td>
                    <td className="py-2">
                      <input
                        type="text"
                        value={p.name}
                        onChange={(e) => handleUpdatePart(p.id, { name: e.target.value })}
                        className="h-8 w-36 rounded border border-outline bg-transparent px-2 text-xs"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="text"
                        value={p.unit || ""}
                        placeholder="e.g. Unit 1"
                        onChange={(e) => handleUpdatePart(p.id, { unit: e.target.value })}
                        className="h-8 w-28 rounded border border-outline bg-transparent px-2 text-xs"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        value={p.length}
                        onChange={(e) =>
                          handleUpdatePart(p.id, { length: Number(e.target.value) || 0 })
                        }
                        className="h-8 w-20 rounded border border-outline bg-transparent px-2 font-mono text-xs"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        value={p.width}
                        onChange={(e) =>
                          handleUpdatePart(p.id, { width: Number(e.target.value) || 0 })
                        }
                        className="h-8 w-20 rounded border border-outline bg-transparent px-2 font-mono text-xs"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        min="1"
                        value={p.qty}
                        onChange={(e) =>
                          handleUpdatePart(p.id, {
                            qty: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                        className="h-8 w-16 rounded border border-outline bg-transparent px-2 font-mono text-xs"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="text"
                        value={p.material}
                        onChange={(e) => handleUpdatePart(p.id, { material: e.target.value })}
                        className="h-8 w-24 rounded border border-outline bg-transparent px-2 text-xs"
                      />
                    </td>
                    <td className="py-2">
                      <select
                        value={p.grain}
                        onChange={(e) =>
                          handleUpdatePart(p.id, {
                            grain: e.target.value as "none" | "length" | "width",
                          })
                        }
                        className="h-8 rounded border border-outline bg-transparent px-2 text-xs"
                      >
                        <option value="none">No Grain (Can Rotate)</option>
                        <option value="length">Along Length (Locked)</option>
                        <option value="width">Along Width (Locked)</option>
                      </select>
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemovePart(p.id)}
                        title="Remove panel"
                      >
                        <Trash2 className="size-3.5 text-danger" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Paste CSV Modal */}
      {pasteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/60 p-4">
          <Card className="w-full max-w-lg space-y-4 p-6 shadow-2xl">
            <h3 className="text-base font-bold">Paste Cut-List (Excel / CSV)</h3>
            <p className="text-xs text-muted leading-relaxed">
              Paste columns separated by commas or tabs. Format:
              <br />
              <code className="font-mono text-foreground font-bold">
                Length, Width, Qty, Part Name, Grain (none/length/width)
              </code>
            </p>

            <textarea
              rows={8}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={`820, 560, 2, Side Panel, length\n864, 560, 2, Bottom Shelf, none\n440, 200, 4, Drawer Front, length`}
              className="w-full rounded-md border border-outline bg-background p-3 font-mono text-xs leading-normal outline-none focus:border-primary"
            />

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPasteModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handlePasteSubmit}>Import Cutlist</Button>
            </div>
          </Card>
        </div>
      )}

      {showManualBuilder && (
        <ManualBuilder
          parts={parts}
          stockSheet={stockSheet}
          settings={settings}
          onClose={() => setShowManualBuilder(false)}
        />
      )}
    </div>
  );
}
