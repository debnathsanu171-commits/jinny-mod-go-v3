import { useEffect, useRef, useState, useMemo } from "react";
import {
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Eye,
  EyeOff,
  Layers,
  Maximize2,
  Sparkles,
  Sliders,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export interface Cabinet3DProps {
  width: number; // mm
  depth: number; // mm
  height: number; // mm
  outerThickness: number; // mm (e.g. 18, 25)
  innerThickness: number; // mm (e.g. 18, 16)
  backThickness: number; // mm (e.g. 8)
  topType: "solid" | "stretchers";
  shelvesCount: number;
  verticalDividers: number; // 0, 1 (2-bay), 2 (3-bay)
  hasHangingRod?: boolean;
  doorType: "none" | "single" | "double" | "sliding-2" | "sliding-3" | "drawers";
  plinthHeight: number; // mm
  outerColor?: string;
  innerColor?: string;
  shutterColor?: string;
}

interface Point3D {
  x: number; // -W/2 to W/2
  y: number; // 0 to H
  z: number; // -D/2 to D/2
}

interface Panel3D {
  id: string;
  name: string;
  min: Point3D;
  max: Point3D;
  color: string;
  isTransparent?: boolean;
  isShutter?: boolean;
  isBack?: boolean;
  isStretcher?: boolean;
  isShelf?: boolean;
  isDivider?: boolean;
  isRod?: boolean;
  explodeVec: Point3D; // direction to explode
}

export function Cabinet3DCanvas({
  width,
  depth,
  height,
  outerThickness = 18,
  innerThickness = 18,
  backThickness = 8,
  topType = "solid",
  shelvesCount = 1,
  verticalDividers = 0,
  hasHangingRod = false,
  doorType = "double",
  plinthHeight = 100,
  outerColor = "#38bdf8",
  innerColor = "#f59e0b",
  shutterColor = "#94a3b8",
}: Cabinet3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Interaction State
  const [yaw, setYaw] = useState(-0.65); // rotation around vertical axis (radians)
  const [pitch, setPitch] = useState(0.38); // vertical tilt
  const [zoom, setZoom] = useState(1);
  const [explode, setExplode] = useState(0); // 0 (assembled) to 1 (fully exploded)
  const [viewMode, setViewMode] = useState<"shaded-transparent" | "wireframe" | "solid">("shaded-transparent");
  const [showShutters, setShowShutters] = useState(true);
  const [showGrooves, setShowGrooves] = useState(true);
  const [showDims, setShowDims] = useState(true);

  const isDragging = useRef(false);
  const lastMousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Generate 3D Panels Geometry
  const panels: Panel3D[] = useMemo(() => {
    const list: Panel3D[] = [];
    const W = width;
    const D = depth;
    const H = height;
    const oT = outerThickness;
    const iT = innerThickness;
    const bT = backThickness;
    const pY = plinthHeight; // Plinth / base offset

    const halfW = W / 2;
    const halfD = D / 2;

    // 1. Plinth / Skirting Base (if plinth > 0)
    if (pY > 0) {
      list.push({
        id: "plinth",
        name: "Plinth Skirting",
        min: { x: -halfW + 20, y: 0, z: -halfD + 40 },
        max: { x: halfW - 20, y: pY, z: halfD - 20 },
        color: "#475569",
        explodeVec: { x: 0, y: -1, z: 0 },
      });
    }

    const startY = pY;
    const endY = H;
    const carcassH = endY - startY;

    // 2. Left Gable (Outer side panel)
    list.push({
      id: "left-gable",
      name: "Left Side Gable",
      min: { x: -halfW, y: startY, z: -halfD },
      max: { x: -halfW + oT, y: endY, z: halfD },
      color: outerColor,
      explodeVec: { x: -1, y: 0, z: 0 },
    });

    // 3. Right Gable (Outer side panel)
    list.push({
      id: "right-gable",
      name: "Right Side Gable",
      min: { x: halfW - oT, y: startY, z: -halfD },
      max: { x: halfW, y: endY, z: halfD },
      color: outerColor,
      explodeVec: { x: 1, y: 0, z: 0 },
    });

    // 4. Bottom Panel
    list.push({
      id: "bottom-panel",
      name: "Bottom Panel",
      min: { x: -halfW + oT, y: startY, z: -halfD },
      max: { x: halfW - oT, y: startY + oT, z: halfD },
      color: outerColor,
      explodeVec: { x: 0, y: -0.8, z: 0 },
    });

    // 5. Top Panel or Stretchers
    if (topType === "solid") {
      list.push({
        id: "top-panel",
        name: "Top Panel (Solid)",
        min: { x: -halfW + oT, y: endY - oT, z: -halfD },
        max: { x: halfW - oT, y: endY, z: halfD },
        color: outerColor,
        explodeVec: { x: 0, y: 1, z: 0 },
      });
    } else {
      // Front Stretcher (100mm)
      list.push({
        id: "front-stretcher",
        name: "Front Top Stretcher",
        min: { x: -halfW + oT, y: endY - oT, z: halfD - 100 },
        max: { x: halfW - oT, y: endY, z: halfD },
        color: outerColor,
        isStretcher: true,
        explodeVec: { x: 0, y: 1, z: 0.5 },
      });
      // Rear Stretcher (100mm)
      list.push({
        id: "rear-stretcher",
        name: "Rear Top Stretcher",
        min: { x: -halfW + oT, y: endY - oT, z: -halfD },
        max: { x: halfW - oT, y: endY, z: -halfD + 100 },
        color: outerColor,
        isStretcher: true,
        explodeVec: { x: 0, y: 1, z: -0.5 },
      });
    }

    // 6. Back Panel (8mm in groove, 20mm from rear edge)
    const grooveOffset = -halfD + 18;
    list.push({
      id: "back-panel",
      name: "Back Panel (Grooved)",
      min: { x: -halfW + oT - 8, y: startY + oT - 8, z: grooveOffset },
      max: { x: halfW - oT + 8, y: endY - oT + 8, z: grooveOffset + bT },
      color: "#64748b",
      isBack: true,
      explodeVec: { x: 0, y: 0, z: -1.2 },
    });

    // Internal Carcass Bounds
    const innerLeftX = -halfW + oT;
    const innerRightX = halfW - oT;
    const innerWidth = innerRightX - innerLeftX;
    const innerBottomY = startY + oT;
    const innerTopY = endY - oT;
    const innerHeight = innerTopY - innerBottomY;

    // 7. Vertical Dividers (for wardrobes & multi-bay cabinets)
    const baysCount = verticalDividers + 1;
    const bayWidth = (innerWidth - verticalDividers * iT) / baysCount;

    for (let d = 0; d < verticalDividers; d++) {
      const divX = innerLeftX + (d + 1) * bayWidth + d * iT;
      list.push({
        id: `vertical-divider-${d}`,
        name: `Vertical Divider #${d + 1}`,
        min: { x: divX, y: innerBottomY, z: -halfD + 25 },
        max: { x: divX + iT, y: innerTopY, z: halfD - 20 },
        color: innerColor,
        isDivider: true,
        explodeVec: { x: d === 0 ? -0.3 : 0.3, y: 0, z: 0 },
      });
    }

    // 8. Shelves
    if (verticalDividers === 0) {
      // Single bay shelves across entire width
      for (let s = 0; s < shelvesCount; s++) {
        const shelfY = innerBottomY + (innerHeight / (shelvesCount + 1)) * (s + 1);
        list.push({
          id: `shelf-${s}`,
          name: `Shelf #${s + 1}`,
          min: { x: innerLeftX + 2, y: shelfY - iT / 2, z: -halfD + 25 },
          max: { x: innerRightX - 2, y: shelfY + iT / 2, z: halfD - 20 },
          color: innerColor,
          isShelf: true,
          explodeVec: { x: 0, y: (s - shelvesCount / 2) * 0.4, z: 0.2 },
        });
      }
    } else {
      // Multi-bay: Shelves in right bay, Hanging Rod in left bay!
      const rightBayLeft = innerLeftX + bayWidth + iT;
      for (let s = 0; s < shelvesCount; s++) {
        const shelfY = innerBottomY + (innerHeight / (shelvesCount + 1)) * (s + 1);
        list.push({
          id: `shelf-bay2-${s}`,
          name: `Right Bay Shelf #${s + 1}`,
          min: { x: rightBayLeft + 2, y: shelfY - iT / 2, z: -halfD + 25 },
          max: { x: innerRightX - 2, y: shelfY + iT / 2, z: halfD - 20 },
          color: innerColor,
          isShelf: true,
          explodeVec: { x: 0.2, y: (s - shelvesCount / 2) * 0.4, z: 0.2 },
        });
      }

      // Top shelf across left bay
      const topShelfY = innerTopY - 240;
      list.push({
        id: "shelf-bay1-top",
        name: "Left Bay Hat Shelf",
        min: { x: innerLeftX + 2, y: topShelfY - iT / 2, z: -halfD + 25 },
        max: { x: innerLeftX + bayWidth - 2, y: topShelfY + iT / 2, z: halfD - 20 },
        color: innerColor,
        isShelf: true,
        explodeVec: { x: -0.2, y: 0.2, z: 0.2 },
      });

      // Hanging Rod in left bay
      if (hasHangingRod || doorType.startsWith("sliding")) {
        const rodY = topShelfY - 60;
        list.push({
          id: "hanging-rod",
          name: "Chrome Hanging Wardrobe Rod",
          min: { x: innerLeftX + 10, y: rodY - 12, z: -12 },
          max: { x: innerLeftX + bayWidth - 10, y: rodY + 12, z: 12 },
          color: "#cbd5e1",
          isRod: true,
          explodeVec: { x: -0.2, y: 0, z: 0.4 },
        });
      }
    }

    // 9. Shutters / Doors / Sliding Tracks
    if (showShutters && doorType !== "none") {
      const frontZ = halfD + 2;

      if (doorType === "single") {
        list.push({
          id: "shutter-single",
          name: "Single Shutter Door",
          min: { x: -halfW + 2, y: startY + 2, z: frontZ },
          max: { x: halfW - 2, y: endY - 2, z: frontZ + 18 },
          color: shutterColor,
          isShutter: true,
          explodeVec: { x: 0, y: 0, z: 1.5 },
        });
      } else if (doorType === "double") {
        // Left Door
        list.push({
          id: "shutter-left",
          name: "Left Shutter Door",
          min: { x: -halfW + 2, y: startY + 2, z: frontZ },
          max: { x: -2, y: endY - 2, z: frontZ + 18 },
          color: shutterColor,
          isShutter: true,
          explodeVec: { x: -0.4, y: 0, z: 1.5 },
        });
        // Right Door
        list.push({
          id: "shutter-right",
          name: "Right Shutter Door",
          min: { x: 2, y: startY + 2, z: frontZ },
          max: { x: halfW - 2, y: endY - 2, z: frontZ + 18 },
          color: shutterColor,
          isShutter: true,
          explodeVec: { x: 0.4, y: 0, z: 1.5 },
        });
      } else if (doorType === "sliding-2" || doorType === "sliding-3") {
        // Sliding Wardrobe Aluminum Tracks (Top & Bottom)
        list.push({
          id: "sliding-top-track",
          name: "Aluminum Top Sliding Track",
          min: { x: -halfW, y: endY - 8, z: frontZ - 5 },
          max: { x: halfW, y: endY, z: frontZ + 45 },
          color: "#94a3b8",
          explodeVec: { x: 0, y: 0.3, z: 0.8 },
        });
        list.push({
          id: "sliding-bottom-track",
          name: "Aluminum Bottom Sliding Track",
          min: { x: -halfW, y: startY, z: frontZ - 5 },
          max: { x: halfW, y: startY + 8, z: frontZ + 45 },
          color: "#94a3b8",
          explodeVec: { x: 0, y: -0.3, z: 0.8 },
        });

        // 2 Sliding Door panels (Overlapping)
        const doorW = W * 0.53;
        // Inner Track Door
        list.push({
          id: "sliding-door-inner",
          name: "Inner Track Sliding Door",
          min: { x: -halfW + 4, y: startY + 12, z: frontZ + 4 },
          max: { x: -halfW + doorW, y: endY - 12, z: frontZ + 22 },
          color: shutterColor,
          isShutter: true,
          explodeVec: { x: -0.4, y: 0, z: 1.4 },
        });
        // Outer Track Door
        list.push({
          id: "sliding-door-outer",
          name: "Outer Track Sliding Door",
          min: { x: halfW - doorW, y: startY + 12, z: frontZ + 25 },
          max: { x: halfW - 4, y: endY - 12, z: frontZ + 43 },
          color: shutterColor,
          isShutter: true,
          explodeVec: { x: 0.4, y: 0, z: 1.8 },
        });
      } else if (doorType === "drawers") {
        const dH1 = Math.round(carcassH * 0.25);
        const dH2 = Math.round((carcassH - dH1) / 2);

        list.push({
          id: "drawer-front-1",
          name: "Top Cutlery Drawer Front",
          min: { x: -halfW + 2, y: endY - dH1 + 2, z: frontZ },
          max: { x: halfW - 2, y: endY - 2, z: frontZ + 18 },
          color: shutterColor,
          isShutter: true,
          explodeVec: { x: 0, y: 0, z: 1.6 },
        });
        list.push({
          id: "drawer-front-2",
          name: "Mid Pot Drawer Front",
          min: { x: -halfW + 2, y: endY - dH1 - dH2 + 2, z: frontZ },
          max: { x: halfW - 2, y: endY - dH1 - 2, z: frontZ + 18 },
          color: shutterColor,
          isShutter: true,
          explodeVec: { x: 0, y: 0, z: 1.4 },
        });
        list.push({
          id: "drawer-front-3",
          name: "Bottom Deep Drawer Front",
          min: { x: -halfW + 2, y: startY + 2, z: frontZ },
          max: { x: halfW - 2, y: endY - dH1 - dH2 - 2, z: frontZ + 18 },
          color: shutterColor,
          isShutter: true,
          explodeVec: { x: 0, y: 0, z: 1.2 },
        });
      }
    }

    return list;
  }, [
    width,
    depth,
    height,
    outerThickness,
    innerThickness,
    backThickness,
    topType,
    shelvesCount,
    verticalDividers,
    hasHangingRod,
    doorType,
    plinthHeight,
    outerColor,
    innerColor,
    shutterColor,
    showShutters,
  ]);

  // Canvas Drawing Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth || 360;
    const ch = canvas.clientHeight || 340;
    canvas.width = Math.floor(cw * dpr);
    canvas.height = Math.floor(ch * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    // Canvas Background Gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, ch);
    bgGrad.addColorStop(0, "#090d16");
    bgGrad.addColorStop(1, "#0f172a");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, cw, ch);

    // Grid Floor
    const gridY = ch * 0.88;
    ctx.strokeStyle = "rgba(51, 65, 85, 0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = -250; gx <= 250; gx += 50) {
      const p1 = project({ x: gx, y: 0, z: -350 }, yaw, pitch, zoom, width, height, cw, ch);
      const p2 = project({ x: gx, y: 0, z: 350 }, yaw, pitch, zoom, width, height, cw, ch);
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
    }
    for (let gz = -350; gz <= 350; gz += 50) {
      const p1 = project({ x: -250, y: 0, z: gz }, yaw, pitch, zoom, width, height, cw, ch);
      const p2 = project({ x: 250, y: 0, z: gz }, yaw, pitch, zoom, width, height, cw, ch);
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
    }
    ctx.stroke();

    // Compute Exploded positions
    const explodeDist = explode * 180; // mm expansion distance
    const explodedPanels = panels.map((p) => {
      const dx = p.explodeVec.x * explodeDist;
      const dy = p.explodeVec.y * explodeDist;
      const dz = p.explodeVec.z * explodeDist;
      return {
        ...p,
        min: { x: p.min.x + dx, y: p.min.y + dy, z: p.min.z + dz },
        max: { x: p.max.x + dx, y: p.max.y + dy, z: p.max.z + dz },
        center: {
          x: (p.min.x + p.max.x) / 2 + dx,
          y: (p.min.y + p.max.y) / 2 + dy,
          z: (p.min.z + p.max.z) / 2 + dz,
        },
      };
    });

    // Depth Sorting (Painter's algorithm: draw farthest panels first)
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);

    explodedPanels.sort((a, b) => {
      const depthA = a.center.x * sinY + a.center.z * cosY + a.center.y * sinP;
      const depthB = b.center.x * sinY + b.center.z * cosY + b.center.y * sinP;
      return depthA - depthB;
    });

    // Draw Panels
    for (const panel of explodedPanels) {
      drawBox(ctx, panel, yaw, pitch, zoom, width, height, cw, ch, viewMode, showGrooves);
    }

    // Dimension Overlays if enabled
    if (showDims && explode < 0.1) {
      draw3DDimensions(ctx, width, depth, height, yaw, pitch, zoom, cw, ch);
    }
  }, [panels, yaw, pitch, zoom, explode, viewMode, showShutters, showGrooves, showDims, width, depth, height]);

  // Drag interaction handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    lastMousePos.current = { x: e.clientX, y: e.clientY };

    setYaw((prev) => prev + dx * 0.008);
    setPitch((prev) => Math.max(0.05, Math.min(1.2, prev - dy * 0.006)));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDragging.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  return (
    <div className="flex flex-col h-full rounded-lg border border-slate-800 bg-[#0b1120] text-slate-200 overflow-hidden shadow-2xl">
      {/* 3D Viewport Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/80 px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold tracking-wide text-cyan-400 flex items-center gap-1.5">
            <Sparkles className="size-3.5" />
            3D Isometric Studio
          </span>
          <span className="text-slate-400 font-mono text-[11px]">
            {width} × {depth} × {height} mm
          </span>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded border border-slate-800">
          <button
            type="button"
            onClick={() => setViewMode("shaded-transparent")}
            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
              viewMode === "shaded-transparent"
                ? "bg-cyan-500 text-slate-950 shadow"
                : "text-slate-400 hover:text-white"
            }`}
            title="Semi-transparent tinted view (inspect inner shelves)"
          >
            Glass/Tinted
          </button>
          <button
            type="button"
            onClick={() => setViewMode("wireframe")}
            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
              viewMode === "wireframe"
                ? "bg-cyan-500 text-slate-950 shadow"
                : "text-slate-400 hover:text-white"
            }`}
            title="Clean CAD Wireframe view"
          >
            Wireframe
          </button>
          <button
            type="button"
            onClick={() => setViewMode("solid")}
            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
              viewMode === "solid"
                ? "bg-cyan-500 text-slate-950 shadow"
                : "text-slate-400 hover:text-white"
            }`}
            title="Solid shaded view"
          >
            Solid
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowShutters(!showShutters)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
              showShutters
                ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
                : "border-slate-800 bg-slate-900 text-slate-400"
            }`}
            title="Toggle front doors / shutters to view inside"
          >
            {showShutters ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
            <span>Shutters</span>
          </button>

          <button
            type="button"
            onClick={() => setShowGrooves(!showGrooves)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
              showGrooves
                ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                : "border-slate-800 bg-slate-900 text-slate-400"
            }`}
            title="Toggle CNC groove lines"
          >
            <Sliders className="size-3" />
            <span>Grooves</span>
          </button>

          <div className="h-4 w-px bg-slate-800 mx-0.5" />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.2).toFixed(2))))}
            title="Zoom out"
            className="h-7 w-7 text-slate-300 hover:text-white"
          >
            <ZoomOut className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.2).toFixed(2))))}
            title="Zoom in"
            className="h-7 w-7 text-slate-300 hover:text-white"
          >
            <ZoomIn className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setYaw(-0.65);
              setPitch(0.38);
              setZoom(1);
              setExplode(0);
            }}
            title="Reset camera orbit"
            className="h-7 w-7 text-slate-300 hover:text-white"
          >
            <RotateCcw className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Canvas Viewport */}
      <div className="relative flex-1 cursor-grab active:cursor-grabbing">
        <canvas
          ref={canvasRef}
          className="h-full w-full block"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />

        {/* Floating Hint */}
        <div className="pointer-events-none absolute top-2 left-2 flex items-center gap-1.5 rounded bg-slate-950/75 px-2 py-1 text-[10px] text-slate-400 backdrop-blur-xs">
          <span>🖱️ Drag to rotate 3D</span>
        </div>

        {/* Exploded View Slider at Bottom */}
        <div className="absolute bottom-3 inset-x-4 flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/85 px-3 py-2 backdrop-blur-md">
          <div className="flex items-center gap-2 text-xs font-semibold text-cyan-400 shrink-0">
            <Maximize2 className="size-3.5" />
            <span>Exploded 3D Assembly</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={explode}
            onChange={(e) => setExplode(parseFloat(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer accent-cyan-400 bg-slate-800 rounded-lg"
          />
          <span className="font-mono text-[11px] text-slate-300 w-9 text-right font-bold">
            {Math.round(explode * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
}

// 3D Projection Calculation
function project(
  pt: Point3D,
  yaw: number,
  pitch: number,
  zoom: number,
  boxW: number,
  boxH: number,
  cw: number,
  ch: number,
): { x: number; y: number } {
  // Rotate horizontally around vertical axis (Y)
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const x1 = pt.x * cosY - pt.z * sinY;
  const z1 = pt.x * sinY + pt.z * cosY;

  // Rotate vertically around X axis (Pitch tilt)
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  const y2 = pt.y * cosP - z1 * sinP;

  // Auto-fit scale factor
  const maxDim = Math.max(boxW, boxH, 800);
  const baseScale = (Math.min(cw, ch) * 0.72) / maxDim;
  const finalScale = baseScale * zoom;

  const originX = cw / 2;
  const originY = ch * 0.65;

  return {
    x: originX + x1 * finalScale,
    y: originY - y2 * finalScale,
  };
}

// Draw a single 3D box panel with 6 isometric faces
function drawBox(
  ctx: CanvasRenderingContext2D,
  panel: Panel3D & { center: Point3D },
  yaw: number,
  pitch: number,
  zoom: number,
  boxW: number,
  boxH: number,
  cw: number,
  ch: number,
  viewMode: "shaded-transparent" | "wireframe" | "solid",
  showGrooves: boolean,
) {
  const { min, max } = panel;

  // 8 Vertices of the 3D panel
  const v = [
    { x: min.x, y: min.y, z: min.z }, // 0: left bottom back
    { x: max.x, y: min.y, z: min.z }, // 1: right bottom back
    { x: max.x, y: min.y, z: max.z }, // 2: right bottom front
    { x: min.x, y: min.y, z: max.z }, // 3: left bottom front
    { x: min.x, y: max.y, z: min.z }, // 4: left top back
    { x: max.x, y: max.y, z: min.z }, // 5: right top back
    { x: max.x, y: max.y, z: max.z }, // 6: right top front
    { x: min.x, y: max.y, z: max.z }, // 7: left top front
  ].map((pt) => project(pt, yaw, pitch, zoom, boxW, boxH, cw, ch));

  // 6 Faces defined by vertex indices (counter-clockwise)
  const faces = [
    { name: "top", idx: [4, 5, 6, 7], normal: { x: 0, y: 1, z: 0 }, light: 1.15 },
    { name: "bottom", idx: [0, 3, 2, 1], normal: { x: 0, y: -1, z: 0 }, light: 0.7 },
    { name: "front", idx: [3, 2, 6, 7], normal: { x: 0, y: 0, z: 1 }, light: 1.0 },
    { name: "back", idx: [1, 0, 4, 5], normal: { x: 0, y: 0, z: -1 }, light: 0.8 },
    { name: "left", idx: [0, 3, 7, 4], normal: { x: -1, y: 0, z: 0 }, light: 0.9 },
    { name: "right", idx: [2, 1, 5, 6], normal: { x: 1, y: 0, z: 0 }, light: 0.85 },
  ];

  // Base Colors
  let strokeColor = "#38bdf8";
  let fillColor = "rgba(56, 189, 248, 0.35)";

  if (panel.isShelf) {
    strokeColor = "#f59e0b";
    fillColor = "rgba(245, 158, 11, 0.4)";
  } else if (panel.isDivider) {
    strokeColor = "#34d399";
    fillColor = "rgba(52, 211, 153, 0.35)";
  } else if (panel.isShutter) {
    strokeColor = "#e2e8f0";
    fillColor = "rgba(226, 232, 240, 0.25)";
  } else if (panel.isBack) {
    strokeColor = "#94a3b8";
    fillColor = "rgba(100, 116, 139, 0.3)";
  } else if (panel.isRod) {
    strokeColor = "#f8fafc";
    fillColor = "rgba(248, 250, 252, 0.85)";
  }

  if (viewMode === "solid") {
    fillColor = panel.isShelf
      ? "#d97706"
      : panel.isDivider
        ? "#059669"
        : panel.isShutter
          ? "#cbd5e1"
          : panel.isBack
            ? "#475569"
            : "#0284c7";
  }

  // Draw Faces
  for (const face of faces) {
    const p0 = v[face.idx[0]];
    const p1 = v[face.idx[1]];
    const p2 = v[face.idx[2]];
    const p3 = v[face.idx[3]];

    // Back-face culling check for solid view
    if (viewMode === "solid") {
      const cross = (p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x);
      if (cross <= 0) continue;
    }

    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.closePath();

    if (viewMode !== "wireframe") {
      ctx.fillStyle = fillColor;
      ctx.fill();
    }

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = viewMode === "wireframe" ? 1.5 : 1;
    ctx.stroke();
  }

  // Draw CNC Groove Line on Gables if enabled
  if (showGrooves && (panel.id === "left-gable" || panel.id === "right-gable")) {
    const isLeft = panel.id === "left-gable";
    const gx = isLeft ? min.x + 18 : max.x - 18;
    const gz = min.z + 18; // 18mm from rear edge
    const gTop = project({ x: gx, y: max.y, z: gz }, yaw, pitch, zoom, boxW, boxH, cw, ch);
    const gBottom = project({ x: gx, y: min.y, z: gz }, yaw, pitch, zoom, boxW, boxH, cw, ch);

    ctx.save();
    ctx.strokeStyle = "#ef4444"; // Red CNC routing groove line
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 2]);
    ctx.beginPath();
    ctx.moveTo(gTop.x, gTop.y);
    ctx.lineTo(gBottom.x, gBottom.y);
    ctx.stroke();
    ctx.restore();
  }
}

// 3D Dimension Annotation Lines
function draw3DDimensions(
  ctx: CanvasRenderingContext2D,
  width: number,
  depth: number,
  height: number,
  yaw: number,
  pitch: number,
  zoom: number,
  cw: number,
  ch: number,
) {
  const halfW = width / 2;
  const halfD = depth / 2;

  ctx.save();
  ctx.strokeStyle = "rgba(56, 189, 248, 0.6)";
  ctx.fillStyle = "#38bdf8";
  ctx.font = "bold 11px monospace";
  ctx.lineWidth = 1;

  // 1. Width Dimension (Front bottom edge)
  const w1 = project({ x: -halfW, y: -20, z: halfD + 25 }, yaw, pitch, zoom, width, height, cw, ch);
  const w2 = project({ x: halfW, y: -20, z: halfD + 25 }, yaw, pitch, zoom, width, height, cw, ch);
  ctx.beginPath();
  ctx.moveTo(w1.x, w1.y);
  ctx.lineTo(w2.x, w2.y);
  ctx.stroke();
  ctx.fillText(`W: ${width} mm`, (w1.x + w2.x) / 2 - 25, (w1.y + w2.y) / 2 + 14);

  // 2. Height Dimension (Left rear edge)
  const h1 = project({ x: -halfW - 30, y: 0, z: -halfD }, yaw, pitch, zoom, width, height, cw, ch);
  const h2 = project({ x: -halfW - 30, y: height, z: -halfD }, yaw, pitch, zoom, width, height, cw, ch);
  ctx.beginPath();
  ctx.moveTo(h1.x, h1.y);
  ctx.lineTo(h2.x, h2.y);
  ctx.stroke();
  ctx.fillText(`H: ${height} mm`, h1.x - 65, (h1.y + h2.y) / 2);

  // 3. Depth Dimension (Right bottom edge)
  const d1 = project({ x: halfW + 25, y: -20, z: -halfD }, yaw, pitch, zoom, width, height, cw, ch);
  const d2 = project({ x: halfW + 25, y: -20, z: halfD }, yaw, pitch, zoom, width, height, cw, ch);
  ctx.beginPath();
  ctx.moveTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.stroke();
  ctx.fillText(`D: ${depth} mm`, (d1.x + d2.x) / 2 + 10, (d1.y + d2.y) / 2);

  ctx.restore();
}
