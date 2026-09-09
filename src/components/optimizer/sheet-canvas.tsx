import { useState, useRef, useEffect } from "react";
import type { SheetLayout, PlacedPart, Offcut, CutLine } from "@/lib/optimizer/types";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Eye,
  Layers,
  Scissors,
  Settings2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  FastForward,
  CheckCircle2,
  Disc,
  Box,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface SheetCanvasProps {
  layout: SheetLayout;
  highlightPartId?: string | null;
  onSelectPart?: (part: PlacedPart | null) => void;
}

export function SheetCanvas({
  layout,
  highlightPartId,
  onSelectPart,
}: SheetCanvasProps) {
  const [zoom, setZoom] = useState(1);
  const [showDimensions, setShowDimensions] = useState(true);
  const [showCutLines, setShowCutLines] = useState(true);
  const [showOffcutLabels, setShowOffcutLabels] = useState(true);
  const [is3D, setIs3D] = useState(false);

  // Manual Optimization State
  const [manualMode, setManualMode] = useState(false);
  const [manualParts, setManualParts] = useState<PlacedPart[] | null>(null);

  // ── Biesse Beam Saw Simulation State ──────────────────────────────────────────
  const [isSimulating, setIsSimulating] = useState(false);
  const [simStep, setSimStep] = useState(0); // 0 = start (uncut sheet), up to layout.cutLines.length
  const [simPlaying, setSimPlaying] = useState(false);
  const [simSpeed, setSimSpeed] = useState<1 | 2 | 4>(1);

  // Smooth blade animation state
  const [bladePos, setBladePos] = useState<{ x: number; y: number; animate: boolean } | null>(null);

  const totalCutCount = layout.cutLines.length;

  useEffect(() => {
    if (!manualMode) {
      setManualParts(null);
    } else if (!manualParts) {
      setManualParts(JSON.parse(JSON.stringify(layout.placedParts)));
    }
  }, [manualMode, layout.placedParts]);

  const activeParts = manualMode && manualParts ? manualParts : layout.placedParts;

  // Sorted cut lines by stage and sequence order
  const orderedCuts = [...layout.cutLines].sort((a, b) => {
    const stageA = a.stage || 1;
    const stageB = b.stage || 1;
    if (stageA !== stageB) return stageA - stageB;
    return a.id - b.id;
  });

  // Active cut line being processed in current simulation step
  const currentCut: CutLine | null =
    isSimulating && simStep > 0 && simStep <= orderedCuts.length
      ? orderedCuts[simStep - 1]
      : null;

  const simInterval = simSpeed === 1 ? 800 : simSpeed === 2 ? 400 : 150;

  // Auto-play timer for simulation
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isSimulating && simPlaying) {
      if (simStep < totalCutCount) {
        timer = setTimeout(() => {
          setSimStep((prev) => prev + 1);
        }, simInterval + 150); // slight pause between cuts
      } else {
        setSimPlaying(false);
      }
    }
    return () => clearTimeout(timer);
  }, [isSimulating, simPlaying, simStep, totalCutCount, simInterval]);

  // Blade movement logic: Snap to start, then animate to end
  useEffect(() => {
    if (isSimulating && currentCut) {
      // 1. Snap instantly to start of cut
      setBladePos({ x: currentCut.x1, y: currentCut.y1, animate: false });
      
      // 2. Wait a tiny frame, then animate to end of cut
      const t = setTimeout(() => {
        setBladePos({ x: currentCut.x2, y: currentCut.y2, animate: true });
      }, 50);
      return () => clearTimeout(t);
    } else {
      setBladePos(null);
    }
  }, [currentCut, isSimulating]);

  const startSimulation = () => {
    setManualMode(false);
    setIsSimulating(true);
    setSimStep(0);
    setSimPlaying(true);
    setIs3D(true); // Auto-switch to 3D for maximum wow factor!
  };

  const stopSimulation = () => {
    setIsSimulating(false);
    setSimPlaying(false);
    setSimStep(0);
  };

  const handleRotatePart = (partId: string) => {
    if (!manualParts) return;
    setManualParts(
      manualParts.map((p) => {
        if (p.id === partId) {
          return {
            ...p,
            length: p.width,
            width: p.length,
            rotated: !p.rotated,
          };
        }
        return p;
      }),
    );
  };

  const [hoveredItem, setHoveredItem] = useState<{
    part?: PlacedPart;
    offcut?: Offcut;
    clientX: number;
    clientY: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const s = layout.stockSheet;

  const pad = 80;
  const viewBoxW = s.length + pad * 2;
  const viewBoxH = s.width + pad * 2;

  // Auto-scale to fit container gracefully
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    
    const updateScale = () => {
      const cw = container.clientWidth - 40;
      const ch = container.clientHeight - 40;
      
      if (is3D) {
        const isoW = (viewBoxW + viewBoxH) * 0.707;
        const isoH = (viewBoxW + viewBoxH) * 0.35;
        // In the inline style, we do `scale(zoom * 0.55)` for 3D.
        const fitZoom = Math.min(cw / isoW, ch / isoH) / 0.55;
        setZoom(Number((fitZoom * 0.95).toFixed(2)));
      } else {
        const fitZoom = Math.min(cw / viewBoxW, ch / viewBoxH);
        setZoom(Number((fitZoom * 0.98).toFixed(2)));
      }
    };

    updateScale();
    
    // Debounce resize
    let timeoutId: any;
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(updateScale, 100);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(timeoutId);
    };
  }, [viewBoxW, viewBoxH, is3D, layout.sheetIndex]);

  const handleZoomIn = () => setZoom((z) => Math.min(3, Number((z + 0.15).toFixed(2))));
  const handleZoomOut = () => setZoom((z) => Math.max(0.1, Number((z - 0.15).toFixed(2))));
  const handleResetZoom = () => {
    // Triggers a refit by toggling state or just relying on a manual calc
    if (containerRef.current) {
      const cw = containerRef.current.clientWidth - 40;
      const ch = containerRef.current.clientHeight - 40;
      if (is3D) {
        const isoW = (viewBoxW + viewBoxH) * 0.707;
        const isoH = (viewBoxW + viewBoxH) * 0.35;
        setZoom(Number((Math.min(cw / isoW, ch / isoH) / 0.55 * 0.95).toFixed(2)));
      } else {
        setZoom(Number((Math.min(cw / viewBoxW, ch / viewBoxH) * 0.98).toFixed(2)));
      }
    }
  };

  function getStageBadge(stage?: number) {
    switch (stage) {
      case 1:
        return { name: "1: Head cut", color: "bg-indigo-600 text-white", border: "#4f46e5" };
      case 2:
        return { name: "4: Rip cut", color: "bg-blue-600 text-white", border: "#2563eb" };
      case 3:
        return { name: "5: Cross cut", color: "bg-cyan-600 text-white", border: "#06b6d4" };
      default:
        return { name: "Z1: Third phase cut", color: "bg-emerald-600 text-white", border: "#10b981" };
    }
  }

  const visibleCuts = isSimulating
    ? orderedCuts.slice(0, simStep)
    : showCutLines
    ? layout.cutLines
    : [];

  return (
    <div className="flex flex-col gap-3 animate-in fade-in-50 duration-500">
      {/* Canvas Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-lg border-b border-outline bg-surface p-2 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground text-sm">
              Sheet #{layout.sheetIndex + 1}
            </span>
            <span className="text-xs text-muted">
              {s.length} × {s.width} × {s.thickness} mm ({s.material})
            </span>
          </div>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <div className="hidden sm:flex items-center gap-2">
            <span className="rounded bg-surface-container px-2 py-0.5 font-mono text-[11px] font-medium text-foreground">
              Yield: {layout.efficiencyPct.toFixed(1)}%
            </span>
            <span className="rounded bg-surface-container px-2 py-0.5 font-mono text-[11px] font-medium text-muted">
              {activeParts.length} parts
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant={isSimulating ? "default" : "outline"}
            size="sm"
            className="h-7 px-2.5 font-medium"
            onClick={isSimulating ? stopSimulation : startSimulation}
            title="Biesse Beam Saw Cutting Process Simulation"
          >
            <Scissors className="mr-1.5 size-3.5" />
            {isSimulating ? "Close Simulation" : "Simulate Beam Saw"}
          </Button>

          <div className="mx-1 h-4 w-px bg-border" />
          <Button
            variant={manualMode ? "default" : "outline"}
            size="sm"
            className="h-7 px-2"
            onClick={() => {
              setIsSimulating(false);
              setManualMode(!manualMode);
            }}
            title="Manual Override Mode"
          >
            <Settings2 className="mr-1 size-3" />
            {manualMode ? "Save Manual" : "Manual Edit"}
          </Button>

          <div className="mx-1 h-4 w-px bg-border" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDimensions(!showDimensions)}
            className={showDimensions ? "text-primary" : "text-muted"}
            title="Toggle part dimensions"
          >
            <Eye className="size-3.5" />
            <span className="hidden sm:inline">Dims</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCutLines(!showCutLines)}
            className={showCutLines ? "text-primary" : "text-muted"}
            title="Toggle saw cut lines"
          >
            <Scissors className="size-3.5" />
            <span className="hidden sm:inline">Cuts</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowOffcutLabels(!showOffcutLabels)}
            className={showOffcutLabels ? "text-primary" : "text-muted"}
            title="Toggle offcut labels"
          >
            <Layers className="size-3.5" />
            <span className="hidden sm:inline">Offcuts</span>
          </Button>

          <div className="mx-1 h-4 w-px bg-outline" />

          {/* 3D Toggle */}
          <Button
            variant={is3D ? "default" : "ghost"}
            size="sm"
            className="h-7 px-2 gap-1"
            onClick={() => setIs3D(!is3D)}
            title="Toggle isometric 3D view"
          >
            <Box className="size-3.5" />
            <span className="hidden sm:inline">{is3D ? "3D On" : "3D"}</span>
          </Button>

          <div className="mx-1 h-4 w-px bg-outline" />

          <Button variant="ghost" size="icon" onClick={handleZoomOut} title="Zoom out">
            <ZoomOut className="size-3.5" />
          </Button>
          <span className="font-mono text-[11px] text-muted w-10 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <Button variant="ghost" size="icon" onClick={handleZoomIn} title="Zoom in">
            <ZoomIn className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleResetZoom} title="Reset zoom">
            <RotateCcw className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* ── BIESSE BEAM SAW SIMULATION INDUSTRIAL CONTROL PANEL ──────────────── */}
      {isSimulating && (
        <div className="rounded-lg border border-indigo-950/40 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 p-3 shadow-xl text-white animate-in slide-in-from-top-3 duration-300">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Disc className="size-4 animate-spin text-cyan-400" />
                <span className="font-bold text-sm tracking-wide text-cyan-300">
                  BIESSE WN BEAM SAW SIMULATION
                </span>
              </div>

              {currentCut && (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold shadow-sm ${
                    getStageBadge(currentCut.stage).color
                  }`}
                >
                  {getStageBadge(currentCut.stage).name}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
              <span>
                Cut Step: <strong className="text-white">{simStep}</strong> / {totalCutCount}
              </span>
              <span>•</span>
              <span>
                {simStep === totalCutCount ? (
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="size-3.5" /> Cutting Complete
                  </span>
                ) : currentCut ? (
                  <span className="text-cyan-300 font-medium">
                    {currentCut.orientation.toUpperCase()} CUT @{" "}
                    {currentCut.orientation === "horizontal"
                      ? `Y=${Math.round(currentCut.y1)}mm`
                      : `X=${Math.round(currentCut.x1)}mm`}
                  </span>
                ) : (
                  <span>Ready to start cut sequence</span>
                )}
              </span>
            </div>
          </div>

          {/* Interactive Telemetry & Controls */}
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-slate-300 hover:text-white hover:bg-slate-800"
                onClick={() => setSimStep(0)}
                title="Reset to Start"
              >
                <SkipBack className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-slate-300 hover:text-white hover:bg-slate-800"
                onClick={() => setSimStep((prev) => Math.max(0, prev - 1))}
                title="Step Backward"
              >
                <RotateCcw className="size-3.5" />
              </Button>

              <Button
                variant="default"
                size="sm"
                className="h-7 px-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold"
                onClick={() => setSimPlaying(!simPlaying)}
              >
                {simPlaying ? (
                  <>
                    <Pause className="mr-1 size-3.5 fill-current" /> Pause
                  </>
                ) : (
                  <>
                    <Play className="mr-1 size-3.5 fill-current" /> Play Saw
                  </>
                )}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-slate-300 hover:text-white hover:bg-slate-800"
                onClick={() => setSimStep((prev) => Math.min(totalCutCount, prev + 1))}
                title="Step Forward"
              >
                <SkipForward className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-slate-300 hover:text-white hover:bg-slate-800"
                onClick={() => {
                  setSimStep(totalCutCount);
                  setSimPlaying(false);
                }}
                title="Skip to End"
              >
                <FastForward className="size-3.5" />
              </Button>
            </div>

            <div className="flex-1 max-w-md flex items-center gap-2 px-2">
              <span className="text-[11px] font-mono text-slate-400">0</span>
              <input
                type="range"
                min={0}
                max={totalCutCount}
                value={simStep}
                onChange={(e) => setSimStep(Number(e.target.value))}
                className="w-full h-1.5 accent-cyan-400 bg-slate-800 rounded-lg cursor-pointer"
              />
              <span className="text-[11px] font-mono text-slate-400">{totalCutCount}</span>
            </div>

            <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-md border border-slate-800 text-xs">
              <span className="text-slate-400 text-[10px] uppercase font-bold px-1">Speed</span>
              {[1, 2, 4].map((spd) => (
                <button
                  key={spd}
                  onClick={() => setSimSpeed(spd as 1 | 2 | 4)}
                  className={`px-1.5 py-0.5 rounded text-[11px] font-bold transition-all ${
                    simSpeed === spd
                      ? "bg-cyan-500 text-slate-950 shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 3D CSS SCENE WRAPPER & CANVAS ────────────────────────────────────── */}
      <div
        ref={containerRef}
        className={`relative w-full overflow-hidden rounded-lg border border-outline transition-colors duration-700 ${
          is3D
            ? "bg-slate-900 perspective-[2000px] shadow-2xl min-h-[500px] max-h-[800px]"
            : "bg-white min-h-[420px] max-h-[650px] shadow-inner"
        }`}
      >
        <div
          className="absolute top-1/2 left-1/2"
          style={{
            width: viewBoxW,
            height: viewBoxH,
            // Core isometric magic: translate centers it, then scale & rotate
            transform: `translate(-50%, -50%) ${
              is3D
                ? `scale(${zoom * 0.55}) rotateX(60deg) rotateZ(45deg)`
                : `scale(${zoom}) rotateX(0deg) rotateZ(0deg)`
            }`,
            transformOrigin: "center center",
            transformStyle: "preserve-3d",
            transition: "transform 0.7s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          {/* 3D Board Base Thickness (Shadow Box) */}
          {is3D && (
            <div
              className="absolute bg-slate-400 shadow-[0_30px_60px_rgba(0,0,0,0.8)] pointer-events-none"
              style={{
                left: pad,
                top: pad,
                width: s.length,
                height: s.width,
                transform: "translateZ(-8px)",
                borderRight: "8px solid #94a3b8",
                borderBottom: "8px solid #64748b",
                borderRadius: "2px",
              }}
            />
          )}

          {/* 2D SVG Plane containing the layout graphics */}
          <svg
            width={viewBoxW}
            height={viewBoxH}
            viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}
            className="absolute inset-0 select-none"
            style={{ transform: "translateZ(0px)", overflow: "visible" }}
          >
            <g transform={`translate(${pad}, ${pad})`}>
              {/* Background Sheet Surface */}
              <rect
                x="0"
                y="0"
                width={s.length}
                height={s.width}
                fill={is3D ? "#f8fafc" : "#f8fafc"}
                stroke="#0f172a"
                strokeWidth="2"
                rx="2"
              />

              {/* Trim Lines / Trim Margin */}
              {(s.trimLeft > 0 || s.trimRight > 0 || s.trimTop > 0 || s.trimBottom > 0) && (
                <rect
                  x={s.trimLeft}
                  y={s.trimTop}
                  width={Math.max(0, s.length - s.trimLeft - s.trimRight)}
                  height={Math.max(0, s.width - s.trimTop - s.trimBottom)}
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="1.5"
                  strokeDasharray="6 4"
                />
              )}

              {/* Offcuts / Waste Areas */}
              {layout.offcuts.map((offcut) => {
                const isLargeEnough = offcut.length > 80 && offcut.width > 50;
                return (
                  <g
                    key={offcut.id}
                    onPointerMove={(e) => {
                      setHoveredItem({
                        offcut,
                        clientX: e.clientX,
                        clientY: e.clientY,
                      });
                    }}
                    onPointerLeave={() => setHoveredItem(null)}
                    className="cursor-pointer"
                  >
                    <rect
                      x={offcut.x}
                      y={offcut.y}
                      width={offcut.length}
                      height={offcut.width}
                      fill={offcut.isReusable ? "#dcfce7" : "#f1f5f9"}
                      stroke={offcut.isReusable ? "#10b981" : "#475569"}
                      strokeWidth={offcut.isReusable ? "2" : "1"}
                      strokeDasharray={offcut.isReusable ? "none" : "3 3"}
                      opacity={offcut.isReusable ? 0.85 : 0.6}
                    />

                    {showOffcutLabels && isLargeEnough && !is3D && (
                      <g pointerEvents="none">
                        <text
                          x={offcut.x + offcut.length / 2}
                          y={offcut.y + offcut.width / 2 - 4}
                          textAnchor="middle"
                          fill={offcut.isReusable ? "#047857" : "#64748b"}
                          fontSize="13"
                          fontWeight="700"
                          fontFamily="sans-serif"
                        >
                          {offcut.isReusable ? "OFFCUT" : "WASTE"}
                        </text>
                        <text
                          x={offcut.x + offcut.length / 2}
                          y={offcut.y + offcut.width / 2 + 12}
                          textAnchor="middle"
                          fill={offcut.isReusable ? "#065f46" : "#94a3b8"}
                          fontSize="11"
                          fontWeight="600"
                          fontFamily="monospace"
                        >
                          {Math.round(offcut.length)} × {Math.round(offcut.width)}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Placed Parts */}
              {activeParts.map((part) => {
                const isHighlighted =
                  highlightPartId &&
                  (part.id === highlightPartId || part.partId === highlightPartId);
                const isLarge = part.length >= 140 && part.width >= 70;
                const isMedium = part.length >= 80 && part.width >= 40;

                return (
                  <g
                    key={part.id}
                    className={`transition-opacity duration-200 ${
                      highlightPartId && !isHighlighted ? "opacity-30" : "opacity-100"
                    } ${manualMode ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
                    onPointerMove={(e) => {
                      setHoveredItem({
                        part,
                        clientX: e.clientX,
                        clientY: e.clientY,
                      });
                    }}
                    onPointerLeave={() => setHoveredItem(null)}
                    onClick={() => {
                      if (manualMode) handleRotatePart(part.id);
                      if (onSelectPart) onSelectPart(part);
                    }}
                  >
                    <rect
                      x={part.x}
                      y={part.y}
                      width={part.length}
                      height={part.width}
                      fill={part.color || "#e2e8f0"}
                      stroke="#0f172a"
                      strokeWidth={is3D ? "2" : "1.5"}
                      className="transition-all duration-200"
                    />

                    {/* Rotation Badge */}
                    {part.rotated && part.length > 50 && part.width > 35 && !is3D && (
                      <g transform={`translate(${part.x + part.length - 24}, ${part.y + 4})`}>
                        <rect width="20" height="18" rx="3" fill="#0f172a" fillOpacity="0.75" />
                        <text x="10" y="13" textAnchor="middle" fill="#fef08a" fontSize="12" fontWeight="800">↺</text>
                      </g>
                    )}

                    {/* Part Text & Labels */}
                    {!is3D && isLarge ? (
                      <g pointerEvents="none">
                        <text
                          x={part.x + part.length / 2}
                          y={part.y + part.width / 2 - 8}
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize={Math.min(22, Math.max(14, part.length / 14))}
                          fontWeight="700"
                          fontFamily="sans-serif"
                        >
                          {part.name}
                        </text>

                        {showDimensions && (
                          <text
                            x={part.x + part.length / 2}
                            y={part.y + part.width / 2 + 14}
                            textAnchor="middle"
                            fill="#f1f5f9"
                            fontSize={Math.min(18, Math.max(12, part.length / 16))}
                            fontWeight="600"
                            fontFamily="monospace"
                          >
                            {Math.round(part.originalLength)} × {Math.round(part.originalWidth)} mm
                            {part.rotated ? " (rot)" : ""}
                          </text>
                        )}
                      </g>
                    ) : !is3D && isMedium ? (
                      <g pointerEvents="none">
                        <text
                          x={part.x + part.length / 2}
                          y={part.y + part.width / 2 + 4}
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize="14"
                          fontWeight="700"
                          fontFamily="sans-serif"
                        >
                          {part.name.length > 12 ? `${part.name.slice(0, 10)}…` : part.name}
                        </text>
                      </g>
                    ) : null}
                  </g>
                );
              })}

              {/* Saw Kerf Cut Lines (Rendered up to current simulation step) */}
              {visibleCuts.map((cut) => {
                let strokeColor = "#10b981"; // Green (Z1/Phase 4)
                let strokeDash = "2 2";
                if (cut.stage === 1) {
                  strokeColor = "#4f46e5"; // Indigo (1: Head Cut)
                  strokeDash = "none";
                } else if (cut.stage === 2) {
                  strokeColor = "#2563eb"; // Blue (4: Rip Cut)
                  strokeDash = "8 3";
                } else if (cut.stage === 3) {
                  strokeColor = "#06b6d4"; // Cyan (5: Cross Cut)
                  strokeDash = "4 2";
                }

                return (
                  <g key={cut.id}>
                    <line
                      x1={cut.x1}
                      y1={cut.y1}
                      x2={cut.x2}
                      y2={cut.y2}
                      stroke={strokeColor}
                      strokeWidth={is3D ? Math.max(4, cut.kerf * 1.5) : Math.max(2.5, cut.kerf)}
                      strokeOpacity="0.95"
                      strokeDasharray={strokeDash}
                    />
                  </g>
                );
              })}
            </g>
          </svg>

          {/* ── BIESSE ANIMATED SAW CARRIAGE (3D HTML Overlay) ─────────────── */}
          {isSimulating && bladePos && currentCut && (
            <div
              className="absolute z-50 pointer-events-none"
              style={{
                left: bladePos.x + pad,
                top: bladePos.y + pad,
                marginLeft: -40, // center 80x80 box
                marginTop: -40,
                width: 80,
                height: 80,
                // In 3D: stand the blade up perpendicular to the cut direction
                transform: is3D
                  ? currentCut.orientation === "horizontal"
                    ? "translateZ(10px) rotateX(-90deg)" // Stand up in XZ plane
                    : "translateZ(10px) rotateZ(90deg) rotateX(-90deg)" // Stand up in YZ plane
                  : "translateZ(0px)",
                // Transition animates the blade gliding along the cut!
                transition: bladePos.animate
                  ? `left ${simInterval}ms linear, top ${simInterval}ms linear, transform 0.4s`
                  : "transform 0.4s",
                transformStyle: "preserve-3d",
              }}
            >
              <div className="relative w-full h-full flex items-center justify-center">
                {/* Spinning Saw Blade Disc */}
                <div
                  className="absolute inset-1 rounded-full border-[5px] border-slate-300 animate-[spin_0.05s_linear_infinite]"
                  style={{
                    background: "radial-gradient(circle, #f1f5f9 20%, #94a3b8 70%, #475569 100%)",
                    borderStyle: "dashed",
                    boxShadow: "0 0 25px rgba(239, 68, 68, 0.9), inset 0 0 10px rgba(0,0,0,0.5)",
                  }}
                >
                  <div className="absolute inset-0 m-auto w-4 h-4 bg-slate-900 rounded-full border-2 border-slate-400" />
                </div>

                {/* Biesse Carriage Shield */}
                <div className="absolute top-0 w-[60px] h-[40px] bg-yellow-500 border-2 border-yellow-700 rounded-t-xl flex flex-col items-center justify-start pt-1 shadow-2xl">
                  <span className="text-[10px] font-black text-yellow-950 tracking-widest drop-shadow-sm">
                    BIESSE
                  </span>
                  <div className="w-[40px] h-1.5 mt-1 bg-yellow-600 rounded-full" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating Tooltip — fixed at cursor position */}
      {hoveredItem && (
        <div
          className="pointer-events-none fixed z-50 min-w-[200px] rounded-lg border border-outline bg-popover shadow-2xl backdrop-blur-md"
          style={{
            left: hoveredItem.clientX + 14,
            top: hoveredItem.clientY - 8,
            transform: "translateY(-100%)",
          }}
        >
          {hoveredItem.part ? (
            <div className="p-3 space-y-1.5">
              <p className="font-bold text-foreground text-sm border-b border-outline pb-1.5 mb-1.5">
                {hoveredItem.part.name}
              </p>
              {hoveredItem.part.unit && (
                <p className="text-xs text-muted">
                  📦 Unit: <span className="text-foreground font-medium">{hoveredItem.part.unit}</span>
                </p>
              )}
              <p className="font-mono text-xs text-foreground">
                Cut:{" "}
                <span className="font-bold">
                  {Math.round(hoveredItem.part.length)} × {Math.round(hoveredItem.part.width)} mm
                </span>
              </p>
              <p className="font-mono text-xs text-muted">
                Original: {hoveredItem.part.originalLength} × {hoveredItem.part.originalWidth} mm
              </p>
              <p className="text-xs text-muted">
                Grain: <span className="text-foreground">{hoveredItem.part.grain}</span>
                {" · "}
                <span className={hoveredItem.part.rotated ? "text-amber-500 font-semibold" : "text-muted"}>
                  {hoveredItem.part.rotated ? "↺ Rotated 90°" : "→ Normal 0°"}
                </span>
              </p>
              <p className="text-xs text-muted">
                Pos: X={Math.round(hoveredItem.part.x)}, Y={Math.round(hoveredItem.part.y)} mm
              </p>
            </div>
          ) : hoveredItem.offcut ? (
            <div className="p-3 space-y-1.5">
              <p className="font-bold text-foreground text-sm border-b border-outline pb-1.5 mb-1.5">
                {hoveredItem.offcut.isReusable ? "♻ Usable Offcut" : "🗑 Waste Offcut"}
              </p>
              <p className="font-mono text-xs text-foreground font-bold">
                {Math.round(hoveredItem.offcut.length)} × {Math.round(hoveredItem.offcut.width)} mm
              </p>
              <p className="font-mono text-xs text-muted">
                Area: {(hoveredItem.offcut.areaMm2 / 1_000_000).toFixed(4)} m²
              </p>
              <p className={`text-xs font-semibold ${hoveredItem.offcut.isReusable ? "text-ok" : "text-warn"}`}>
                {hoveredItem.offcut.isReusable ? "✓ Can be saved for future jobs" : "Saw trim waste"}
              </p>
            </div>
          ) : null}
        </div>
      )}

      {/* Industrial Cut Legend & Stats under sheet */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5 font-semibold text-[#4f46e5]">
            <span className="h-1 w-4 bg-[#4f46e5]" />
            <span>1: Head cut</span>
          </div>
          <div className="flex items-center gap-1.5 font-semibold text-[#2563eb]">
            <span className="h-1 w-4 bg-[#2563eb] border-dashed border-b" />
            <span>4: Rip cut</span>
          </div>
          <div className="flex items-center gap-1.5 font-semibold text-[#06b6d4]">
            <span className="h-1 w-4 bg-[#06b6d4] border-dashed border-b" />
            <span>5: Cross cut</span>
          </div>
          <div className="flex items-center gap-1.5 font-semibold text-[#10b981]">
            <span className="h-1 w-4 bg-[#10b981] border-dotted border-b" />
            <span>Z1: Third phase cut</span>
          </div>
        </div>

        <div className="font-mono">
          Used: {(layout.usedAreaMm2 / 1_000_000).toFixed(2)} m² · Waste:{" "}
          {(layout.wasteAreaMm2 / 1_000_000).toFixed(2)} m²
        </div>
      </div>
    </div>
  );
}
