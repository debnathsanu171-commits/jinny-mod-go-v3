import { useMemo, useRef, useState } from "react";
import { layoutBoxLayers, type LayerPanel, type LayerSlot } from "@/lib/packing-rules";

type Item = {
  part_name: string;
  length_mm: number | string;
  width_mm: number | string;
  thickness_mm: number | string;
  weight_kg: number | string;
  qty: number;
  id: number;
};

const PAL = {
  floor: { top: "#c9a06a", left: "#8d6238", right: "#6b4526", edge: "#4a2f18", text: "#2a1a0c" },
  stack: { top: "#d8b07c", left: "#9a6d3e", right: "#7a5130", edge: "#4a2f18", text: "#2a1a0c" },
  fill: { top: "#e2c79a", left: "#b08958", right: "#8a6640", edge: "#5c3d22", text: "#2a1a0c" },
  thin: { top: "#dbe4ee", left: "#8ea0b5", right: "#647891", edge: "#3d4d5e", text: "#0f172a" },
};

export function BoxLayers3D({ items }: { items: Item[] }) {
  const [yaw, setYaw] = useState(45);
  const [pitch, setPitch] = useState(60);
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);

  const panels: LayerPanel[] = useMemo(
    () =>
      items.map((p) => ({
        id: p.id,
        name: p.part_name,
        length_mm: Number(p.length_mm) || 0,
        width_mm: Number(p.width_mm) || 0,
        thickness_mm: Number(p.thickness_mm) || 18,
        weight: Number(p.weight_kg),
        qty: p.qty,
      })),
    [items],
  );
  
  const slots = useMemo(() => layoutBoxLayers(panels), [panels]);

  if (!slots.length) return null;
  
  const floor = slots[0];
  const fL = Math.max(floor.l, floor.panel.length_mm, floor.panel.width_mm);
  const fW = floor.w || Math.min(floor.panel.length_mm, floor.panel.width_mm);

  const zMax = Math.max(...slots.map((s) => s.z + s.panel.thickness_mm), 18);
  const tBoost = Math.max(1.8, (Math.min(fL, fW) * 0.12) / zMax);

  const boards = slots.map((s) => ({
    s,
    L: s.l,
    W: s.w,
    T: s.panel.thickness_mm * tBoost,
    z: s.z * tBoost,
    x: s.x,
    y: s.y,
  }));

  // Sort by Z to help the browser render order just in case
  boards.sort((a, b) => a.z - b.z);
  
  const stackH = boards.reduce((n, b) => Math.max(n, b.z + b.T), 0);

  // Dynamic scale to perfectly fit container
  const diag = Math.sqrt(fL * fL + fW * fW);
  const visualW = diag;
  const visualH = diag * Math.cos((pitch * Math.PI) / 180) + stackH * Math.sin((pitch * Math.PI) / 180) + 60;
  const scale = Math.min(260 / visualW, 220 / visualH) * 0.95;

  return (
    <div className="overflow-hidden rounded-lg border border-outline bg-paper shadow-sm transition-all">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-outline bg-slate-50/80 px-3 py-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Solid panels · Drag to turn
        </p>
        <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider text-indigo-700">
          3D INTERACTIVE
        </span>
      </div>

      <div className="grid sm:grid-cols-[1fr_11rem]">
        {/* CSS 3D SCENE CONTAINER */}
        <div
          className="relative flex h-[280px] w-full cursor-grab items-center justify-center overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 perspective-[1500px] active:cursor-grabbing"
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, y: e.clientY, yaw, pitch };
            (e.target as HTMLDivElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const dx = e.clientX - drag.current.x;
            const dy = e.clientY - drag.current.y;
            setYaw(drag.current.yaw + dx * 0.6);
            setPitch(Math.max(10, Math.min(85, drag.current.pitch - dy * 0.6)));
          }}
          onPointerUp={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}
        >
          {/* 3D Transform Pivot */}
          <div
            className="relative"
            style={{
              width: fL,
              height: fW,
              transform: `scale(${scale}) rotateX(${pitch}deg) rotateZ(${yaw}deg) translateZ(-${stackH / 2}px)`,
              transformStyle: "preserve-3d",
            }}
          >
            {/* Carton Floor */}
            <div
              className="absolute inset-0 bg-slate-300/10 shadow-[0_0_50px_rgba(0,0,0,0.15)]"
              style={{ border: "2px dashed #94a3b8", transform: "translateZ(0px)" }}
            />

            {/* Carton Pillars */}
            <CartonPillar x={0} y={0} h={stackH + 40} />
            <CartonPillar x={fL} y={0} h={stackH + 40} />
            <CartonPillar x={fL} y={fW} h={stackH + 40} />
            <CartonPillar x={0} y={fW} h={stackH + 40} />

            {/* Carton Top Ring */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                border: "2px dashed #cbd5e1",
                transform: `translateZ(${stackH + 40}px)`,
              }}
            />

            {/* Solid Panel Blocks */}
            {boards.map((b, i) => (
              <SolidPanel key={`${b.s.panel.id}-${i}`} b={b} pal={PAL[b.s.role]} />
            ))}
          </div>
        </div>

        {/* Packing Legend */}
        <ol className="max-h-[280px] space-y-0.5 overflow-auto border-t border-outline bg-white p-2 text-xs shadow-inner sm:border-l sm:border-t-0">
          {slots.map((s, i) => (
            <li
              key={`${s.panel.id}-${i}`}
              className="flex gap-2 rounded p-1.5 transition-colors hover:bg-slate-50"
            >
              <span
                className="mt-0.5 h-3 w-3 shrink-0 rounded-sm border shadow-sm"
                style={{ background: PAL[s.role].top, borderColor: PAL[s.role].edge }}
              />
              <span className="leading-tight">
                <span className="font-semibold text-slate-800">
                  {i + 1}. {s.panel.name}
                </span>
                <span className="mt-0.5 block font-mono text-[10px] text-slate-500">
                  {fmt(s.panel.length_mm)} × {fmt(s.panel.width_mm)} × {s.panel.thickness_mm}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      {/* Footer Stats */}
      <div className="flex items-center justify-between border-t border-outline bg-slate-50 px-3 py-2 font-mono text-[11px] text-muted">
        <span>
          Box Floor: <strong className="text-slate-700">{fmt(fL)} × {fmt(fW)}</strong> mm
        </span>
        <span className="font-semibold text-slate-600">
          {slots.length} Panel{slots.length === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}

// ── CSS 3D Construct Helpers ───────────────────────────────────────────────────

function CartonPillar({ x, y, h }: { x: number; y: number; h: number }) {
  return (
    <div
      className="absolute bg-slate-400"
      style={{
        left: x - 1,
        top: y - 1,
        width: 2,
        height: h,
        transformOrigin: "top center",
        transform: "rotateX(-90deg)", // stands up into +Z
      }}
    />
  );
}

function SolidPanel({ b, pal }: { b: any; pal: any }) {
  return (
    <div
      className="absolute"
      style={{
        left: b.x,
        top: b.y,
        width: b.L,
        height: b.W,
        transform: `translateZ(${b.z + b.T}px)`, // Lift to top face height
        backgroundColor: pal.top,
        border: `1.5px solid ${pal.edge}`,
        transformStyle: "preserve-3d",
      }}
    >
      {/* Front Face (Y = W) */}
      <div
        className="absolute"
        style={{
          top: "100%", left: -1.5, right: -1.5, height: b.T,
          transformOrigin: "top center", transform: "rotateX(-90deg)",
          backgroundColor: pal.left, border: `1.5px solid ${pal.edge}`, borderTop: "none",
          backfaceVisibility: "hidden",
        }}
      />
      {/* Right Face (X = L) */}
      <div
        className="absolute"
        style={{
          left: "100%", top: -1.5, bottom: -1.5, width: b.T,
          transformOrigin: "left center", transform: "rotateY(-90deg)",
          backgroundColor: pal.right, border: `1.5px solid ${pal.edge}`, borderLeft: "none",
          backfaceVisibility: "hidden",
        }}
      />
      {/* Back Face (Y = 0) */}
      <div
        className="absolute"
        style={{
          bottom: "100%", left: -1.5, right: -1.5, height: b.T,
          transformOrigin: "bottom center", transform: "rotateX(90deg)",
          backgroundColor: pal.left, border: `1.5px solid ${pal.edge}`, borderBottom: "none",
          backfaceVisibility: "hidden",
        }}
      />
      {/* Left Face (X = 0) */}
      <div
        className="absolute"
        style={{
          right: "100%", top: -1.5, bottom: -1.5, width: b.T,
          transformOrigin: "right center", transform: "rotateY(90deg)",
          backgroundColor: pal.right, border: `1.5px solid ${pal.edge}`, borderRight: "none",
          backfaceVisibility: "hidden",
        }}
      />
    </div>
  );
}

function fmt(n: number) {
  return Math.round(n);
}
