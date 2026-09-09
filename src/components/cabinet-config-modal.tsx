import { useState, useMemo } from "react";
import {
  Boxes,
  X,
  Check,
  Sparkles,
  Sliders,
  Layers,
  Ruler,
  Maximize2,
  Palette,
  Shield,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Cabinet3DCanvas } from "@/components/cabinet-3d-canvas";

export type CabinetPreset =
  | "base-standard"
  | "base-sink"
  | "base-drawer-3"
  | "base-drawer-2"
  | "wall-standard"
  | "wall-liftup"
  | "wardrobe-sliding-2d"
  | "wardrobe-sliding-3d"
  | "wardrobe-multibay"
  | "tall-wardrobe"
  | "tall-appliance"
  | "base-corner-l"
  | "open-shelf";

export interface CabinetConfig {
  preset: CabinetPreset;
  name: string;
  width: number; // mm
  depth: number; // mm
  height: number; // mm
  outerThickness: number; // mm (18, 16, 19, 25)
  innerThickness: number; // mm (18, 16, 12, 19)
  backThickness: number; // mm (8, 6, 18, 9)
  shutterThickness: number; // mm (18, 21, 25, 19)
  topType: "solid" | "stretchers";
  shelvesCount: number;
  verticalDividers: number;
  hasHangingRod: boolean;
  doorType: "none" | "single" | "double" | "sliding-2" | "sliding-3" | "drawers";
  plinthHeight: number;
  material: string;
  // Laminate Scheme
  laminateMode: "auto" | "custom";
  outerLaminate: string; // Surface A
  innerLaminate: string; // Surface B
  shutterLaminate: string;
  backLaminate: string;
  partOverrides: Record<
    string,
    { thickness?: number; outerLam?: string; innerLam?: string; edgeBand?: string }
  >;
}

export interface CabinetPartBreakdown {
  id: string;
  name: string;
  length: number;
  width: number;
  qty: number;
  thickness: number;
  role: string;
  outerLam: string; // Side A (Front / Outer)
  innerLam: string; // Side B (Rear / Inner)
  edgeBand: string; // e.g. "2.0mm Front, 0.8mm Others"
}

export const LAMINATE_OPTIONS = [
  "Natural Smoked Oak (1.0mm)",
  "Textured Teak Wood (1.0mm)",
  "Walnut Bronze (1.0mm)",
  "Super Matt Charcoal (1.0mm)",
  "High Gloss Pure White (1.0mm)",
  "Frosty White BSL (0.8mm)",
  "Fabric Suede Grey (0.8mm)",
  "Off-White Balancing Liner (0.8mm)",
  "Raw / No Laminate (Bare Board)",
];

const PRESETS: {
  id: CabinetPreset;
  label: string;
  desc: string;
  icon: string;
  category: "Wardrobes" | "Base Units" | "Wall Units" | "Tall & Other";
  defaults: Partial<CabinetConfig>;
}[] = [
  // --- Wardrobes ---
  {
    id: "wardrobe-sliding-2d",
    label: "2-Door Sliding Wardrobe",
    desc: "Top/bottom tracks, vertical divider, hanging bay & 3 shelves",
    icon: "🚪",
    category: "Wardrobes",
    defaults: {
      name: "2-DOOR SLIDING WARDROBE",
      width: 1800,
      depth: 650,
      height: 2100,
      outerThickness: 18,
      innerThickness: 18,
      backThickness: 8,
      topType: "solid",
      shelvesCount: 3,
      verticalDividers: 1,
      hasHangingRod: true,
      doorType: "sliding-2",
      plinthHeight: 100,
    },
  },
  {
    id: "wardrobe-sliding-3d",
    label: "3-Door Jumbo Sliding Wardrobe",
    desc: "3-track sliding wardrobe with 2 vertical dividers",
    icon: "🚪",
    category: "Wardrobes",
    defaults: {
      name: "3-DOOR SLIDING WARDROBE",
      width: 2400,
      depth: 650,
      height: 2400,
      outerThickness: 25,
      innerThickness: 18,
      backThickness: 8,
      topType: "solid",
      shelvesCount: 4,
      verticalDividers: 2,
      hasHangingRod: true,
      doorType: "sliding-3",
      plinthHeight: 100,
    },
  },
  {
    id: "wardrobe-multibay",
    label: "3-Bay Hinged Wardrobe",
    desc: "3 hinged bays with 2 full vertical partitions & loft",
    icon: "🚪",
    category: "Wardrobes",
    defaults: {
      name: "3-BAY HINGED WARDROBE",
      width: 1800,
      depth: 600,
      height: 2100,
      outerThickness: 18,
      innerThickness: 18,
      backThickness: 8,
      topType: "solid",
      shelvesCount: 4,
      verticalDividers: 2,
      hasHangingRod: true,
      doorType: "double",
      plinthHeight: 100,
    },
  },
  {
    id: "tall-wardrobe",
    label: "2-Bay Standard Wardrobe",
    desc: "Double door tall wardrobe with center vertical divider",
    icon: "🚪",
    category: "Wardrobes",
    defaults: {
      name: "2-BAY TALL WARDROBE",
      width: 1200,
      depth: 580,
      height: 2100,
      outerThickness: 18,
      innerThickness: 18,
      backThickness: 8,
      topType: "solid",
      shelvesCount: 3,
      verticalDividers: 1,
      hasHangingRod: true,
      doorType: "double",
      plinthHeight: 100,
    },
  },

  // --- Base Units ---
  {
    id: "base-standard",
    label: "Base Cabinet (2-Door)",
    desc: "Standard kitchen/vanity base carcass with solid top & shelf",
    icon: "🗄️",
    category: "Base Units",
    defaults: {
      name: "BASE CARCASS 2-DOOR",
      width: 800,
      depth: 560,
      height: 720,
      outerThickness: 18,
      innerThickness: 18,
      backThickness: 8,
      topType: "solid",
      shelvesCount: 1,
      verticalDividers: 0,
      hasHangingRod: false,
      doorType: "double",
      plinthHeight: 100,
    },
  },
  {
    id: "base-sink",
    label: "Sink Base Unit",
    desc: "Plumbing cutout with front & rear top stretchers",
    icon: "🚰",
    category: "Base Units",
    defaults: {
      name: "SINK BASE CARCASS",
      width: 900,
      depth: 560,
      height: 720,
      outerThickness: 18,
      innerThickness: 18,
      backThickness: 8,
      topType: "stretchers",
      shelvesCount: 0,
      verticalDividers: 0,
      hasHangingRod: false,
      doorType: "double",
      plinthHeight: 100,
    },
  },
  {
    id: "base-drawer-3",
    label: "3-Drawer Base Unit",
    desc: "1 shallow cutlery drawer + 2 deep pots/pans drawers",
    icon: "🗃️",
    category: "Base Units",
    defaults: {
      name: "3-DRAWER BASE CARCASS",
      width: 600,
      depth: 560,
      height: 720,
      outerThickness: 18,
      innerThickness: 16,
      backThickness: 8,
      topType: "stretchers",
      shelvesCount: 0,
      verticalDividers: 0,
      hasHangingRod: false,
      doorType: "drawers",
      plinthHeight: 100,
    },
  },
  {
    id: "base-drawer-2",
    label: "2-Drawer Pot & Pan Base",
    desc: "2 heavy-duty deep pullout drawers for cookware",
    icon: "🗃️",
    category: "Base Units",
    defaults: {
      name: "2-DRAWER POTS CARCASS",
      width: 900,
      depth: 560,
      height: 720,
      outerThickness: 18,
      innerThickness: 18,
      backThickness: 8,
      topType: "stretchers",
      shelvesCount: 0,
      verticalDividers: 0,
      hasHangingRod: false,
      doorType: "drawers",
      plinthHeight: 100,
    },
  },
  {
    id: "base-corner-l",
    label: "Corner / L-Shape Base Unit",
    desc: "Blind corner return carcass with corner post",
    icon: "📐",
    category: "Base Units",
    defaults: {
      name: "CORNER BASE CARCASS",
      width: 1050,
      depth: 600,
      height: 720,
      outerThickness: 18,
      innerThickness: 18,
      backThickness: 8,
      topType: "solid",
      shelvesCount: 1,
      verticalDividers: 0,
      hasHangingRod: false,
      doorType: "single",
      plinthHeight: 100,
    },
  },

  // --- Wall Units ---
  {
    id: "wall-standard",
    label: "Wall / Overhead 2-Door",
    desc: "Shallow depth wall-mounted carcass with 2 shelves",
    icon: "📦",
    category: "Wall Units",
    defaults: {
      name: "WALL OVERHEAD CARCASS",
      width: 800,
      depth: 320,
      height: 600,
      outerThickness: 18,
      innerThickness: 18,
      backThickness: 8,
      topType: "solid",
      shelvesCount: 2,
      verticalDividers: 0,
      hasHangingRod: false,
      doorType: "double",
      plinthHeight: 0,
    },
  },
  {
    id: "wall-liftup",
    label: "Wall Lift-up (Flap Unit)",
    desc: "Aventos / gas strut upward opening horizontal flap",
    icon: "📦",
    category: "Wall Units",
    defaults: {
      name: "WALL LIFT-UP CARCASS",
      width: 900,
      depth: 350,
      height: 450,
      outerThickness: 18,
      innerThickness: 18,
      backThickness: 8,
      topType: "solid",
      shelvesCount: 1,
      verticalDividers: 0,
      hasHangingRod: false,
      doorType: "single",
      plinthHeight: 0,
    },
  },

  // --- Tall & Other ---
  {
    id: "tall-appliance",
    label: "Tall Appliance Oven / Microwave",
    desc: "Mid-height oven cavity with bottom drawers & top storage",
    icon: "⚡",
    category: "Tall & Other",
    defaults: {
      name: "TALL APPLIANCE PANTRY",
      width: 600,
      depth: 600,
      height: 2100,
      outerThickness: 25,
      innerThickness: 18,
      backThickness: 8,
      topType: "solid",
      shelvesCount: 3,
      verticalDividers: 0,
      hasHangingRod: false,
      doorType: "single",
      plinthHeight: 100,
    },
  },
  {
    id: "open-shelf",
    label: "Open Display Bookshelf",
    desc: "Frameless open cubby unit without shutters",
    icon: "📚",
    category: "Tall & Other",
    defaults: {
      name: "OPEN SHELF CARCASS",
      width: 800,
      depth: 320,
      height: 1200,
      outerThickness: 25,
      innerThickness: 18,
      backThickness: 8,
      topType: "solid",
      shelvesCount: 3,
      verticalDividers: 0,
      hasHangingRod: false,
      doorType: "none",
      plinthHeight: 50,
    },
  },
];

export function calculateCabinetParts(cfg: CabinetConfig): CabinetPartBreakdown[] {
  const parts: CabinetPartBreakdown[] = [];
  const W = cfg.width;
  const D = cfg.depth;
  const H = cfg.height;
  const oT = cfg.outerThickness;
  const iT = cfg.innerThickness;
  const bT = cfg.backThickness;
  const sT = cfg.shutterThickness;

  const overrides = cfg.partOverrides || {};

  const getThick = (id: string, def: number) => overrides[id]?.thickness || def;
  const getOuterLam = (id: string, def: string) => overrides[id]?.outerLam || def;
  const getInnerLam = (id: string, def: string) => overrides[id]?.innerLam || def;
  const getEdge = (id: string, def: string) => overrides[id]?.edgeBand || def;

  // 1. Left Gable
  parts.push({
    id: "left-gable",
    name: "Left Side Gable",
    length: H,
    width: D,
    qty: 1,
    thickness: getThick("left-gable", oT),
    role: "Side Panel",
    outerLam: getOuterLam("left-gable", cfg.outerLaminate),
    innerLam: getInnerLam("left-gable", cfg.innerLaminate),
    edgeBand: getEdge("left-gable", "2.0mm Front Edge, 0.8mm Top/Bottom"),
  });

  // 2. Right Gable
  parts.push({
    id: "right-gable",
    name: "Right Side Gable",
    length: H,
    width: D,
    qty: 1,
    thickness: getThick("right-gable", oT),
    role: "Side Panel",
    outerLam: getOuterLam("right-gable", cfg.outerLaminate),
    innerLam: getInnerLam("right-gable", cfg.innerLaminate),
    edgeBand: getEdge("right-gable", "2.0mm Front Edge, 0.8mm Top/Bottom"),
  });

  // 3. Bottom Panel
  const bottomW = Math.max(50, W - 2 * oT);
  parts.push({
    id: "bottom-panel",
    name: "Bottom Panel",
    length: bottomW,
    width: D,
    qty: 1,
    thickness: getThick("bottom-panel", oT),
    role: "Bottom",
    outerLam: getOuterLam("bottom-panel", cfg.innerLaminate), // Internal face is top surface
    innerLam: getInnerLam("bottom-panel", cfg.outerLaminate),
    edgeBand: getEdge("bottom-panel", "2.0mm Front Edge"),
  });

  // 4. Top Panel or Stretchers
  if (cfg.topType === "solid") {
    parts.push({
      id: "top-panel",
      name: "Top Panel (Solid)",
      length: bottomW,
      width: D,
      qty: 1,
      thickness: getThick("top-panel", oT),
      role: "Top",
      outerLam: getOuterLam("top-panel", cfg.outerLaminate),
      innerLam: getInnerLam("top-panel", cfg.innerLaminate),
      edgeBand: getEdge("top-panel", "2.0mm Front Edge"),
    });
  } else {
    parts.push({
      id: "front-stretcher",
      name: "Front Top Stretcher",
      length: bottomW,
      width: 100,
      qty: 1,
      thickness: getThick("front-stretcher", oT),
      role: "Stretcher",
      outerLam: getOuterLam("front-stretcher", cfg.innerLaminate),
      innerLam: getInnerLam("front-stretcher", cfg.innerLaminate),
      edgeBand: getEdge("front-stretcher", "2.0mm Front Edge"),
    });
    parts.push({
      id: "rear-stretcher",
      name: "Rear Top Stretcher",
      length: bottomW,
      width: 100,
      qty: 1,
      thickness: getThick("rear-stretcher", oT),
      role: "Stretcher",
      outerLam: getOuterLam("rear-stretcher", cfg.innerLaminate),
      innerLam: getInnerLam("rear-stretcher", cfg.innerLaminate),
      edgeBand: getEdge("rear-stretcher", "0.8mm Exposed Edges"),
    });
  }

  // 5. Vertical Partitions / Dividers (for wardrobes & multi-bay)
  const baysCount = cfg.verticalDividers + 1;
  const internalWidth = W - 2 * oT;
  const bayW = Math.max(50, Math.floor((internalWidth - cfg.verticalDividers * iT) / baysCount));
  const carcassH = H - (cfg.topType === "solid" ? 2 * oT : oT);

  for (let d = 0; d < cfg.verticalDividers; d++) {
    parts.push({
      id: `vertical-divider-${d}`,
      name: `Vertical Divider / Mullion #${d + 1}`,
      length: carcassH,
      width: Math.max(50, D - 25), // Setback 25mm from front
      qty: 1,
      thickness: getThick(`vertical-divider-${d}`, iT),
      role: "Divider",
      outerLam: getOuterLam(`vertical-divider-${d}`, cfg.innerLaminate),
      innerLam: getInnerLam(`vertical-divider-${d}`, cfg.innerLaminate),
      edgeBand: getEdge(`vertical-divider-${d}`, "2.0mm Front Edge"),
    });
  }

  // 6. Shelves
  if (cfg.shelvesCount > 0) {
    const shelfL = cfg.verticalDividers > 0 ? bayW - 2 : bottomW - 2;
    parts.push({
      id: "internal-shelves",
      name: cfg.verticalDividers > 0 ? "Bay Adjustable Shelves" : "Adjustable Shelves",
      length: Math.max(50, shelfL),
      width: Math.max(50, D - 20), // 20mm setback
      qty: cfg.shelvesCount,
      thickness: getThick("internal-shelves", iT),
      role: "Shelf",
      outerLam: getOuterLam("internal-shelves", cfg.innerLaminate),
      innerLam: getInnerLam("internal-shelves", cfg.innerLaminate),
      edgeBand: getEdge("internal-shelves", "2.0mm Front Edge, 0.8mm Others"),
    });
  }

  // 7. Hanging Rod Section Hat Shelf
  if (cfg.hasHangingRod && cfg.verticalDividers > 0) {
    parts.push({
      id: "hat-shelf",
      name: "Left Bay Top Hat Shelf",
      length: bayW - 2,
      width: Math.max(50, D - 20),
      qty: 1,
      thickness: getThick("hat-shelf", iT),
      role: "Shelf",
      outerLam: getOuterLam("hat-shelf", cfg.innerLaminate),
      innerLam: getInnerLam("hat-shelf", cfg.innerLaminate),
      edgeBand: getEdge("hat-shelf", "2.0mm Front Edge"),
    });
  }

  // 8. Back Panel
  if (bT <= 9) {
    // 8mm groove in side/top/bottom with 8mm groove depth
    parts.push({
      id: "back-panel",
      name: "Back Panel (Grooved)",
      length: Math.max(50, H - 2 * oT + 14),
      width: Math.max(50, bottomW + 14),
      qty: 1,
      thickness: getThick("back-panel", bT),
      role: "Backing",
      outerLam: getOuterLam("back-panel", cfg.backLaminate),
      innerLam: getInnerLam("back-panel", cfg.innerLaminate),
      edgeBand: getEdge("back-panel", "None (Fitted in groove)"),
    });
  } else {
    // Solid 18mm back
    parts.push({
      id: "back-panel",
      name: "Solid Back Panel",
      length: Math.max(50, H - 2 * oT),
      width: bottomW,
      qty: 1,
      thickness: getThick("back-panel", bT),
      role: "Backing",
      outerLam: getOuterLam("back-panel", cfg.backLaminate),
      innerLam: getInnerLam("back-panel", cfg.innerLaminate),
      edgeBand: getEdge("back-panel", "0.8mm Perimeter"),
    });
  }

  // 9. Shutters / Doors / Sliding Panels
  const doorH = Math.max(50, H - cfg.plinthHeight - 4); // 4mm reveal

  if (cfg.doorType === "single") {
    parts.push({
      id: "shutter-single",
      name: "Single Shutter Door",
      length: doorH,
      width: Math.max(50, W - 4),
      qty: 1,
      thickness: getThick("shutter-single", sT),
      role: "Shutter",
      outerLam: getOuterLam("shutter-single", cfg.shutterLaminate),
      innerLam: getInnerLam("shutter-single", cfg.innerLaminate),
      edgeBand: getEdge("shutter-single", "2.0mm All 4 Edges Matching"),
    });
  } else if (cfg.doorType === "double") {
    parts.push({
      id: "shutter-double",
      name: "Pair Shutter Doors",
      length: doorH,
      width: Math.max(50, Math.floor((W - 6) / 2)),
      qty: 2,
      thickness: getThick("shutter-double", sT),
      role: "Shutter",
      outerLam: getOuterLam("shutter-double", cfg.shutterLaminate),
      innerLam: getInnerLam("shutter-double", cfg.innerLaminate),
      edgeBand: getEdge("shutter-double", "2.0mm All 4 Edges Matching"),
    });
  } else if (cfg.doorType === "sliding-2") {
    const sDoorW = Math.round(W * 0.53); // 50mm overlap in center
    parts.push({
      id: "sliding-doors",
      name: "Sliding Wardrobe Shutter Panel",
      length: Math.max(50, H - cfg.plinthHeight - 55), // Allowance for top & bottom tracks
      width: sDoorW,
      qty: 2,
      thickness: getThick("sliding-doors", sT),
      role: "Sliding Shutter",
      outerLam: getOuterLam("sliding-doors", cfg.shutterLaminate),
      innerLam: getInnerLam("sliding-doors", cfg.innerLaminate),
      edgeBand: getEdge("sliding-doors", "2.0mm PVC Edge or Alu Profile"),
    });
  } else if (cfg.doorType === "sliding-3") {
    const sDoorW = Math.round((W + 100) / 3);
    parts.push({
      id: "sliding-doors-3",
      name: "3-Door Sliding Shutter Panel",
      length: Math.max(50, H - cfg.plinthHeight - 55),
      width: sDoorW,
      qty: 3,
      thickness: getThick("sliding-doors-3", sT),
      role: "Sliding Shutter",
      outerLam: getOuterLam("sliding-doors-3", cfg.shutterLaminate),
      innerLam: getInnerLam("sliding-doors-3", cfg.innerLaminate),
      edgeBand: getEdge("sliding-doors-3", "2.0mm PVC Edge or Alu Profile"),
    });
  } else if (cfg.doorType === "drawers") {
    const dH1 = Math.round(doorH * 0.25 - 3);
    const dH2 = Math.round(doorH * 0.375 - 3);
    parts.push({
      id: "drawer-front-cutlery",
      name: "Top Cutlery Drawer Front",
      length: dH1,
      width: Math.max(50, W - 4),
      qty: 1,
      thickness: getThick("drawer-front-cutlery", sT),
      role: "Drawer Front",
      outerLam: getOuterLam("drawer-front-cutlery", cfg.shutterLaminate),
      innerLam: getInnerLam("drawer-front-cutlery", cfg.innerLaminate),
      edgeBand: getEdge("drawer-front-cutlery", "2.0mm All 4 Edges Matching"),
    });
    parts.push({
      id: "drawer-front-deep",
      name: "Deep Pot Drawer Front",
      length: dH2,
      width: Math.max(50, W - 4),
      qty: 2,
      thickness: getThick("drawer-front-deep", sT),
      role: "Drawer Front",
      outerLam: getOuterLam("drawer-front-deep", cfg.shutterLaminate),
      innerLam: getInnerLam("drawer-front-deep", cfg.innerLaminate),
      edgeBand: getEdge("drawer-front-deep", "2.0mm All 4 Edges Matching"),
    });
  }

  return parts;
}

interface CabinetConfigModalProps {
  initialWidth?: string;
  initialDepth?: string;
  initialHeight?: string;
  initialMaterial?: string;
  onApply: (data: {
    description: string;
    width: number;
    depth: number;
    height: number;
    material: string;
    remark: string;
    parts: CabinetPartBreakdown[];
  }) => void;
  onClose: () => void;
}

export function CabinetConfigModal({
  initialWidth,
  initialDepth,
  initialHeight,
  initialMaterial,
  onApply,
  onClose,
}: CabinetConfigModalProps) {
  const [cfg, setCfg] = useState<CabinetConfig>(() => ({
    preset: "wardrobe-sliding-2d",
    name: "2-DOOR SLIDING WARDROBE",
    width: Number(initialWidth) || 1800,
    depth: Number(initialDepth) || 650,
    height: Number(initialHeight) || 2100,
    outerThickness: 18,
    innerThickness: 18,
    backThickness: 8,
    shutterThickness: 18,
    topType: "solid",
    shelvesCount: 3,
    verticalDividers: 1,
    hasHangingRod: true,
    doorType: "sliding-2",
    plinthHeight: 100,
    material: initialMaterial || "HDHMR",
    laminateMode: "auto",
    outerLaminate: "Natural Smoked Oak (1.0mm)",
    innerLaminate: "Frosty White BSL (0.8mm)",
    shutterLaminate: "Super Matt Charcoal (1.0mm)",
    backLaminate: "Off-White Balancing Liner (0.8mm)",
    partOverrides: {},
  }));

  const [activeTab, setActiveTab] = useState<"dimensions" | "thickness" | "laminates" | "parts">("dimensions");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");

  const calculatedParts = useMemo(() => calculateCabinetParts(cfg), [cfg]);

  const handleSelectPreset = (pId: CabinetPreset) => {
    const hit = PRESETS.find((p) => p.id === pId);
    if (!hit) return;
    setCfg((prev) => ({
      ...prev,
      preset: pId,
      ...hit.defaults,
    }));
  };

  const handleUpdateOverride = (
    partId: string,
    field: "thickness" | "outerLam" | "innerLam" | "edgeBand",
    value: unknown,
  ) => {
    setCfg((prev) => ({
      ...prev,
      partOverrides: {
        ...prev.partOverrides,
        [partId]: {
          ...(prev.partOverrides[partId] || {}),
          [field]: value,
        },
      },
    }));
  };

  const handleApply = () => {
    const remark = `${cfg.outerThickness}mm Outer, ${cfg.innerThickness}mm Inner, ${cfg.shelvesCount} Shelves, ${cfg.verticalDividers ? `${cfg.verticalDividers} Dividers, ` : ""}${cfg.outerLaminate.split(" ")[0]}/${cfg.innerLaminate.split(" ")[0]}`;
    onApply({
      description: cfg.name,
      width: cfg.width,
      depth: cfg.depth,
      height: cfg.height,
      material: cfg.material,
      remark,
      parts: calculatedParts,
    });
    onClose();
  };

  const categories = ["All", "Wardrobes", "Base Units", "Wall Units", "Tall & Other"];
  const filteredPresets = PRESETS.filter(
    (p) => categoryFilter === "All" || p.category === categoryFilter,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/75 p-3 sm:p-5 backdrop-blur-xs">
      <Card className="flex h-[94vh] w-full max-w-6xl flex-col overflow-hidden p-0 shadow-2xl animate-fade-in border-outline bg-background">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-outline bg-surface-low px-5 py-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-md bg-ok/10 text-ok">
              <Boxes className="size-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                Woodwize Cabinet Studio Pro
                <Badge tone="ok">3D Isometric Live</Badge>
              </h2>
              <p className="text-[11px] text-muted">
                Parametric Wardrobes, Modular Kitchens & Dual-Surface Laminate Engineering
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="size-4" />
          </Button>
        </div>

        {/* Studio Main Workspace: Left Controls (55%) & Right 3D Viewport (45%) */}
        <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-12">
          {/* Left Column: Studio Tabs & Parameter Controls */}
          <div className="flex flex-col overflow-y-auto border-r border-outline p-4 lg:col-span-6 xl:col-span-7">
            {/* Category Filter Pills */}
            <div className="mb-3 flex flex-wrap items-center gap-1.5 border-b border-outline pb-2">
              <span className="text-[11px] font-bold text-muted mr-1">Category:</span>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                    categoryFilter === cat
                      ? "bg-primary text-on-primary shadow-xs"
                      : "bg-surface-container text-muted hover:text-foreground"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Presets Grid */}
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 max-h-48 overflow-y-auto pr-1">
              {filteredPresets.map((p) => {
                const isSelected = cfg.preset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectPreset(p.id)}
                    className={`flex flex-col items-start rounded-lg border p-2 text-left transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                        : "border-outline bg-paper hover:bg-surface-low"
                    }`}
                  >
                    <span className="text-lg leading-none">{p.icon}</span>
                    <span className="mt-1 text-xs font-bold text-foreground leading-tight">
                      {p.label}
                    </span>
                    <span className="mt-0.5 line-clamp-1 text-[10px] text-muted">
                      {p.desc}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Main Tabs Header */}
            <div className="mb-4 flex border-b border-outline">
              <button
                type="button"
                onClick={() => setActiveTab("dimensions")}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-bold transition-all ${
                  activeTab === "dimensions"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                <Ruler className="size-3.5" />
                Dimensions & Type
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("thickness")}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-bold transition-all ${
                  activeTab === "thickness"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                <Sliders className="size-3.5" />
                Board Thicknesses
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("laminates")}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-bold transition-all ${
                  activeTab === "laminates"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                <Palette className="size-3.5" />
                Dual Laminates
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("parts")}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-bold transition-all ${
                  activeTab === "parts"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                <Layers className="size-3.5" />
                Cut Pieces ({calculatedParts.length})
              </button>
            </div>

            {/* TAB 1: Dimensions & Type */}
            {activeTab === "dimensions" && (
              <div className="space-y-4 animate-fade-in">
                <div>
                  <Label className="text-xs">Cabinet Description / Title</Label>
                  <input
                    type="text"
                    value={cfg.name}
                    onChange={(e) => setCfg({ ...cfg, name: e.target.value })}
                    className="mt-1 h-8 w-full rounded border border-outline bg-background px-2.5 text-xs font-semibold"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Width W (mm)</Label>
                    <input
                      type="number"
                      value={cfg.width}
                      onChange={(e) =>
                        setCfg({ ...cfg, width: Math.max(100, Number(e.target.value) || 0) })
                      }
                      className="mt-1 h-8 w-full rounded border border-outline bg-background px-2 font-mono text-xs font-bold text-primary"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Depth D (mm)</Label>
                    <input
                      type="number"
                      value={cfg.depth}
                      onChange={(e) =>
                        setCfg({ ...cfg, depth: Math.max(100, Number(e.target.value) || 0) })
                      }
                      className="mt-1 h-8 w-full rounded border border-outline bg-background px-2 font-mono text-xs font-bold text-primary"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Height H (mm)</Label>
                    <input
                      type="number"
                      value={cfg.height}
                      onChange={(e) =>
                        setCfg({ ...cfg, height: Math.max(100, Number(e.target.value) || 0) })
                      }
                      className="mt-1 h-8 w-full rounded border border-outline bg-background px-2 font-mono text-xs font-bold text-primary"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Vertical Dividers</Label>
                    <select
                      value={cfg.verticalDividers}
                      onChange={(e) =>
                        setCfg({ ...cfg, verticalDividers: Number(e.target.value) })
                      }
                      className="mt-1 h-8 w-full rounded border border-outline bg-background px-2 text-xs"
                    >
                      <option value={0}>0 (Single Bay)</option>
                      <option value={1}>1 (2-Bay Multi-Bay)</option>
                      <option value={2}>2 (3-Bay Jumbo)</option>
                    </select>
                  </div>

                  <div>
                    <Label className="text-xs">Adjustable Shelves</Label>
                    <select
                      value={cfg.shelvesCount}
                      onChange={(e) =>
                        setCfg({ ...cfg, shelvesCount: Number(e.target.value) })
                      }
                      className="mt-1 h-8 w-full rounded border border-outline bg-background px-2 text-xs"
                    >
                      <option value={0}>0 (Open Space)</option>
                      <option value={1}>1 Shelf</option>
                      <option value={2}>2 Shelves</option>
                      <option value={3}>3 Shelves</option>
                      <option value={4}>4 Shelves</option>
                    </select>
                  </div>

                  <div>
                    <Label className="text-xs">Door / Shutter Style</Label>
                    <select
                      value={cfg.doorType}
                      onChange={(e) =>
                        setCfg({
                          ...cfg,
                          doorType: e.target.value as CabinetConfig["doorType"],
                        })
                      }
                      className="mt-1 h-8 w-full rounded border border-outline bg-background px-2 text-xs"
                    >
                      <option value="sliding-2">Sliding (2-Track Overlap)</option>
                      <option value="sliding-3">Sliding (3-Track)</option>
                      <option value="double">Hinged Double Door</option>
                      <option value="single">Hinged Single Door</option>
                      <option value="drawers">Drawers (3-Tier)</option>
                      <option value="none">Open (No Doors)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Top Construction</Label>
                    <select
                      value={cfg.topType}
                      onChange={(e) =>
                        setCfg({ ...cfg, topType: e.target.value as "solid" | "stretchers" })
                      }
                      className="mt-1 h-8 w-full rounded border border-outline bg-background px-2 text-xs"
                    >
                      <option value="solid">Solid Top (Standard)</option>
                      <option value="stretchers">Front & Rear Stretchers</option>
                    </select>
                  </div>

                  <div>
                    <Label className="text-xs">Plinth / Legs</Label>
                    <select
                      value={cfg.plinthHeight}
                      onChange={(e) => setCfg({ ...cfg, plinthHeight: Number(e.target.value) })}
                      className="mt-1 h-8 w-full rounded border border-outline bg-background px-2 text-xs"
                    >
                      <option value={100}>100 mm (Standard PVC/Alu)</option>
                      <option value={75}>75 mm Skirting</option>
                      <option value={150}>150 mm High Legs</option>
                      <option value={0}>0 mm (No Plinth / Wall)</option>
                    </select>
                  </div>

                  <div>
                    <Label className="text-xs">Base Material</Label>
                    <input
                      type="text"
                      value={cfg.material}
                      onChange={(e) => setCfg({ ...cfg, material: e.target.value })}
                      placeholder="HDHMR"
                      className="mt-1 h-8 w-full rounded border border-outline bg-background px-2 text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: Board Thicknesses */}
            {activeTab === "thickness" && (
              <div className="space-y-4 animate-fade-in">
                <p className="text-xs text-muted">
                  Configure independent thicknesses for outer carcass gables, inner shelves, dividers, and back panel.
                </p>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded border border-outline p-2.5 bg-paper">
                    <Label className="text-xs font-bold">Outer Carcass</Label>
                    <p className="text-[10px] text-muted mb-1.5">Gables, Top & Bottom</p>
                    <select
                      value={cfg.outerThickness}
                      onChange={(e) => setCfg({ ...cfg, outerThickness: Number(e.target.value) })}
                      className="h-8 w-full rounded border border-outline bg-background px-2 text-xs font-mono font-bold"
                    >
                      <option value={18}>18 mm (Standard)</option>
                      <option value={25}>25 mm (Heavy/Luxury)</option>
                      <option value={19}>19 mm (Commercial)</option>
                      <option value={16}>16 mm (Economy)</option>
                    </select>
                  </div>

                  <div className="rounded border border-outline p-2.5 bg-paper">
                    <Label className="text-xs font-bold">Inner Parts</Label>
                    <p className="text-[10px] text-muted mb-1.5">Shelves & Dividers</p>
                    <select
                      value={cfg.innerThickness}
                      onChange={(e) => setCfg({ ...cfg, innerThickness: Number(e.target.value) })}
                      className="h-8 w-full rounded border border-outline bg-background px-2 text-xs font-mono font-bold"
                    >
                      <option value={18}>18 mm (Standard)</option>
                      <option value={16}>16 mm (Lightweight)</option>
                      <option value={12}>12 mm (Drawer Box)</option>
                      <option value={19}>19 mm (Commercial)</option>
                    </select>
                  </div>

                  <div className="rounded border border-outline p-2.5 bg-paper">
                    <Label className="text-xs font-bold">Back Panel</Label>
                    <p className="text-[10px] text-muted mb-1.5">Grooved or Solid</p>
                    <select
                      value={cfg.backThickness}
                      onChange={(e) => setCfg({ ...cfg, backThickness: Number(e.target.value) })}
                      className="h-8 w-full rounded border border-outline bg-background px-2 text-xs font-mono font-bold"
                    >
                      <option value={8}>8 mm (Grooved)</option>
                      <option value={6}>6 mm (Rebated)</option>
                      <option value={18}>18 mm (Solid Back)</option>
                      <option value={9}>9 mm (Heavy Groove)</option>
                    </select>
                  </div>

                  <div className="rounded border border-outline p-2.5 bg-paper">
                    <Label className="text-xs font-bold">Front Shutters</Label>
                    <p className="text-[10px] text-muted mb-1.5">Doors & Drawers</p>
                    <select
                      value={cfg.shutterThickness}
                      onChange={(e) =>
                        setCfg({ ...cfg, shutterThickness: Number(e.target.value) })
                      }
                      className="h-8 w-full rounded border border-outline bg-background px-2 text-xs font-mono font-bold"
                    >
                      <option value={18}>18 mm (Standard)</option>
                      <option value={21}>21 mm (Shaker/Profile)</option>
                      <option value={25}>25 mm (Heavy Duty)</option>
                      <option value={19}>19 mm (Commercial)</option>
                    </select>
                  </div>
                </div>

                {/* Per-Part Override Table */}
                <div className="mt-4">
                  <h4 className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
                    <Sliders className="size-3.5" />
                    Individual Component Thickness Overrides
                  </h4>
                  <div className="max-h-48 overflow-y-auto rounded border border-outline">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-outline bg-surface-low text-muted">
                        <tr>
                          <th className="px-3 py-1.5 font-semibold">Component</th>
                          <th className="px-3 py-1.5 font-semibold">Default Thickness</th>
                          <th className="px-3 py-1.5 font-semibold">Custom Thickness (mm)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline">
                        {calculatedParts.map((p) => (
                          <tr key={p.id} className="hover:bg-surface-low">
                            <td className="px-3 py-1.5 font-medium">{p.name}</td>
                            <td className="px-3 py-1.5 font-mono text-muted">{p.thickness} mm</td>
                            <td className="px-3 py-1.5">
                              <select
                                value={cfg.partOverrides[p.id]?.thickness || p.thickness}
                                onChange={(e) =>
                                  handleUpdateOverride(p.id, "thickness", Number(e.target.value))
                                }
                                className="h-7 rounded border border-outline bg-background px-2 text-xs font-mono font-bold"
                              >
                                <option value={12}>12 mm</option>
                                <option value={16}>16 mm</option>
                                <option value={18}>18 mm</option>
                                <option value={19}>19 mm</option>
                                <option value={25}>25 mm</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: Dual Laminates (Surface A & Surface B) */}
            {activeTab === "laminates" && (
              <div className="space-y-4 animate-fade-in">
                {/* Mode Selector */}
                <div className="flex items-center justify-between rounded-lg border border-outline bg-paper p-3">
                  <div>
                    <h4 className="text-xs font-bold">Laminate Application Mode</h4>
                    <p className="text-[11px] text-muted">
                      Choose 1-Click Auto-Rule or fine-tune Face A & Face B for every panel.
                    </p>
                  </div>
                  <div className="flex items-center gap-1 bg-surface-container p-1 rounded">
                    <button
                      type="button"
                      onClick={() => setCfg({ ...cfg, laminateMode: "auto" })}
                      className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                        cfg.laminateMode === "auto"
                          ? "bg-primary text-on-primary shadow-xs"
                          : "text-muted hover:text-foreground"
                      }`}
                    >
                      ⚡ Auto-Rules
                    </button>
                    <button
                      type="button"
                      onClick={() => setCfg({ ...cfg, laminateMode: "custom" })}
                      className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                        cfg.laminateMode === "custom"
                          ? "bg-primary text-on-primary shadow-xs"
                          : "text-muted hover:text-foreground"
                      }`}
                    >
                      ✏️ Custom Per-Panel
                    </button>
                  </div>
                </div>

                {/* Auto Mode Global Pickers */}
                {cfg.laminateMode === "auto" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-outline p-3 bg-paper">
                      <Label className="text-xs font-bold">Outer Exposed Surfaces (Face A)</Label>
                      <p className="text-[10px] text-muted mb-2">Exterior gables & carcass sides</p>
                      <select
                        value={cfg.outerLaminate}
                        onChange={(e) => setCfg({ ...cfg, outerLaminate: e.target.value })}
                        className="h-8 w-full rounded border border-outline bg-background px-2 text-xs"
                      >
                        {LAMINATE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="rounded-lg border border-outline p-3 bg-paper">
                      <Label className="text-xs font-bold">Internal Carcass & Shelves (Face B)</Label>
                      <p className="text-[10px] text-muted mb-2">Inside cabinet & shelving BSL</p>
                      <select
                        value={cfg.innerLaminate}
                        onChange={(e) => setCfg({ ...cfg, innerLaminate: e.target.value })}
                        className="h-8 w-full rounded border border-outline bg-background px-2 text-xs"
                      >
                        {LAMINATE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="rounded-lg border border-outline p-3 bg-paper">
                      <Label className="text-xs font-bold">Front Doors / Shutters Facia</Label>
                      <p className="text-[10px] text-muted mb-2">Exterior face of doors/drawers</p>
                      <select
                        value={cfg.shutterLaminate}
                        onChange={(e) => setCfg({ ...cfg, shutterLaminate: e.target.value })}
                        className="h-8 w-full rounded border border-outline bg-background px-2 text-xs"
                      >
                        {LAMINATE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="rounded-lg border border-outline p-3 bg-paper">
                      <Label className="text-xs font-bold">Backing Panel Balancing</Label>
                      <p className="text-[10px] text-muted mb-2">Reverse side balancing liner</p>
                      <select
                        value={cfg.backLaminate}
                        onChange={(e) => setCfg({ ...cfg, backLaminate: e.target.value })}
                        className="h-8 w-full rounded border border-outline bg-background px-2 text-xs"
                      >
                        {LAMINATE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  /* Custom Per-Part Table */
                  <div className="max-h-72 overflow-y-auto rounded border border-outline">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-outline bg-surface-low text-muted sticky top-0">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Panel</th>
                          <th className="px-3 py-2 font-semibold">Face A (Outer / Front)</th>
                          <th className="px-3 py-2 font-semibold">Face B (Inner / Rear)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline">
                        {calculatedParts.map((p) => (
                          <tr key={p.id} className="hover:bg-surface-low">
                            <td className="px-3 py-2 font-semibold">{p.name}</td>
                            <td className="px-3 py-1.5">
                              <select
                                value={p.outerLam}
                                onChange={(e) =>
                                  handleUpdateOverride(p.id, "outerLam", e.target.value)
                                }
                                className="h-7 w-full rounded border border-outline bg-background px-1.5 text-xs"
                              >
                                {LAMINATE_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-1.5">
                              <select
                                value={p.innerLam}
                                onChange={(e) =>
                                  handleUpdateOverride(p.id, "innerLam", e.target.value)
                                }
                                className="h-7 w-full rounded border border-outline bg-background px-1.5 text-xs"
                              >
                                {LAMINATE_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: Cut Pieces Breakdown */}
            {activeTab === "parts" && (
              <div className="flex-1 overflow-y-auto animate-fade-in">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-outline text-muted sticky top-0 bg-surface-low">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Part</th>
                      <th className="px-2 py-1.5 font-medium">Cut Size (L × W)</th>
                      <th className="px-2 py-1.5 font-medium">Qty</th>
                      <th className="px-2 py-1.5 font-medium">Thick</th>
                      <th className="px-2 py-1.5 font-medium">Face A / Face B</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline">
                    {calculatedParts.map((part) => (
                      <tr key={part.id} className="hover:bg-surface-low">
                        <td className="px-2 py-1.5">
                          <p className="font-semibold">{part.name}</p>
                          <p className="text-[10px] text-muted">{part.role}</p>
                        </td>
                        <td className="px-2 py-1.5 font-mono text-ok font-bold">
                          {part.length} × {part.width} mm
                        </td>
                        <td className="px-2 py-1.5 font-mono font-bold">×{part.qty}</td>
                        <td className="px-2 py-1.5 font-mono text-muted">{part.thickness}mm</td>
                        <td className="px-2 py-1.5 text-[10px] text-muted leading-tight">
                          <p>
                            <span className="font-bold text-foreground">A:</span>{" "}
                            {part.outerLam.split(" ")[0]}
                          </p>
                          <p>
                            <span className="font-bold text-foreground">B:</span>{" "}
                            {part.innerLam.split(" ")[0]}
                          </p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right Column: 3D Isometric Viewport */}
          <div className="flex flex-col h-full bg-[#0b1120] p-3 lg:col-span-6 xl:col-span-5">
            <Cabinet3DCanvas
              width={cfg.width}
              depth={cfg.depth}
              height={cfg.height}
              outerThickness={cfg.outerThickness}
              innerThickness={cfg.innerThickness}
              backThickness={cfg.backThickness}
              topType={cfg.topType}
              shelvesCount={cfg.shelvesCount}
              verticalDividers={cfg.verticalDividers}
              hasHangingRod={cfg.hasHangingRod}
              doorType={cfg.doorType}
              plinthHeight={cfg.plinthHeight}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-outline bg-surface-low px-5 py-3 shrink-0">
          <div className="text-xs text-muted">
            Creates <span className="font-bold text-foreground">{calculatedParts.length} parts</span> ({calculatedParts.reduce((s, p) => s + p.qty, 0)} total panels) configured for this work order row.
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleApply} className="gap-1.5 bg-ok text-white hover:bg-ok/90">
              <Check className="size-4" />
              Apply to Work Order
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
