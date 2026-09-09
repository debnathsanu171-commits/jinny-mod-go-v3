import type { CutlistDoc, CutlistRow } from "@/lib/cutlist-bom";
import type { WoUnit } from "@/components/work-order-sheet";

export type MaterialRow = {
  id: string;
  kind: "group" | "item";
  sl: string;
  material: string;
  brand: string;
  thk: string;
  size: string;
  qty: string;
  stock: string;
  revise: string;
  avail: string;
  remark: string;
};

export type MaterialDoc = {
  appLogo: string;
  factoryLogo: string;
  title: string;
  customer_name: string;
  date: string;
  prepared_by: string;
  checked_by: string;
  rows: MaterialRow[];
  planner: string;
  production: string;
  accounting: string;
  gm: string;
  director: string;
};

function uid() {
  return `bm_${Math.random().toString(36).slice(2, 9)}`;
}

function n(v: string) {
  const x = Number(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(x) ? x : 0;
}

function sheetsFromArea(mm2: number) {
  const board = 2438 * 1219;
  if (mm2 <= 0 || board <= 0) return "";
  const q = mm2 / board;
  const rounded = Math.max(0.5, Math.round(q * 2) / 2);
  return String(rounded);
}

export function emptyMaterialRow(kind: "group" | "item", sl = ""): MaterialRow {
  return {
    id: uid(),
    kind,
    sl,
    material: "",
    brand: "",
    thk: "",
    size: "",
    qty: "",
    stock: "",
    revise: "",
    avail: "",
    remark: "",
  };
}

export function emptyMaterialDoc(meta?: Partial<MaterialDoc>): MaterialDoc {
  return {
    appLogo: "JINNY MOD GO",
    factoryLogo: "",
    title: "BILL OF MATERIAL",
    customer_name: meta?.customer_name ?? "",
    date: meta?.date ?? "",
    prepared_by: meta?.prepared_by ?? "",
    checked_by: meta?.checked_by ?? "",
    planner: "",
    production: "",
    accounting: "",
    gm: "",
    director: "",
    rows: [
      { ...emptyMaterialRow("group", "A"), material: "PLY" },
      { ...emptyMaterialRow("item"), material: "PLY", brand: "REGULAR", size: "8X4" },
      { ...emptyMaterialRow("group", "B"), material: "LAMINATE" },
      { ...emptyMaterialRow("item"), size: "8X4" },
      {
        ...emptyMaterialRow("group", "C"),
        material: "EDGEBANDING",
        brand: "CODE",
        thk: "BRAND",
        size: "SIZE",
      },
      emptyMaterialRow("item"),
    ],
    ...meta,
  };
}

function isBoard(name: string) {
  return /ply|hdhmr|mdf|particle|bwr|bwp|board|wpc|osb/i.test(name);
}

function keepUser(old: MaterialRow | undefined, generated: MaterialRow): MaterialRow {
  if (!old) return generated;
  return {
    ...generated,
    id: old.id || generated.id,
    brand: old.brand || generated.brand,
    stock: old.stock,
    revise: old.revise,
    avail: old.avail,
    remark: old.remark || generated.remark,
    qty: old.qty || generated.qty,
    size: old.size || generated.size,
  };
}

export function syncMaterialFromJob(
  units: WoUnit[],
  cutlist: CutlistDoc | undefined,
  saved: MaterialDoc | undefined,
  meta: { customer_name: string; date: string; company: string },
): MaterialDoc {
  const base = emptyMaterialDoc({
    customer_name: meta.customer_name,
    date: meta.date,
    factoryLogo: saved?.factoryLogo || meta.company,
    appLogo: saved?.appLogo || "JINNY MOD GO",
    prepared_by: saved?.prepared_by || "",
    checked_by: saved?.checked_by || "",
    planner: saved?.planner || "",
    production: saved?.production || "",
    accounting: saved?.accounting || "",
    gm: saved?.gm || "",
    director: saved?.director || "",
    title: saved?.title || "BILL OF MATERIAL",
  });

  const parts: CutlistRow[] = (cutlist?.rows || []).filter((r) => r.kind === "part");
  const boards = new Map<string, { material: string; thk: string; area: number }>();
  const lams = new Map<string, { code: string; thk: string; area: number }>();
  const ebs = new Map<string, { code: string; size: string; m: number }>();

  const addBoard = (material: string, thk: string, w: number, d: number, qty: number) => {
    const mat = (material || "PLY").toUpperCase();
    const t = thk || "";
    const key = `${mat}|${t}`;
    const cur = boards.get(key) ?? { material: mat, thk: t, area: 0 };
    cur.area += Math.max(0, w) * Math.max(0, d) * Math.max(1, qty);
    boards.set(key, cur);
  };

  if (parts.length) {
    for (const r of parts) {
      addBoard(r.material, r.height, n(r.cutW || r.width), n(r.cutD || r.depth), n(r.qty) || 1);
      const top = (r.colourTop || "").trim();
      if (top) {
        const k = top.toUpperCase();
        const cur = lams.get(k) ?? { code: top, thk: "0.72", area: 0 };
        cur.area += n(r.cutW || r.width) * n(r.cutD || r.depth) * (n(r.qty) || 1);
        lams.set(k, cur);
      }
      const bot = (r.colourBottom || "").trim();
      if (bot && bot.toUpperCase() !== top.toUpperCase()) {
        const k = bot.toUpperCase();
        const cur = lams.get(k) ?? { code: bot, thk: "1", area: 0 };
        cur.area += n(r.cutW || r.width) * n(r.cutD || r.depth) * (n(r.qty) || 1);
        lams.set(k, cur);
      }
      const code = (r.eb22x2 || r.eb22x08 || "").trim();
      if (code) {
        const size = r.eb22x2 ? "22X1.5" : "22X0.8";
        const peri = ((n(r.cutW || r.width) + n(r.cutD || r.depth)) * 2 * (n(r.qty) || 1)) / 1000;
        const k = `${code}|${size}`;
        const cur = ebs.get(k) ?? { code, size, m: 0 };
        cur.m += peri;
        ebs.set(k, cur);
      }
    }
  } else {
    for (const u of units) {
      if (!u.material && !u.description) continue;
      addBoard(u.material || "PLY", "18", n(u.width), n(u.height), n(u.qty) || 1);
      if (u.outer) {
        const k = u.outer.toUpperCase();
        const cur = lams.get(k) ?? { code: u.outer, thk: "0.72", area: 0 };
        cur.area += n(u.width) * n(u.height) * (n(u.qty) || 1);
        lams.set(k, cur);
      }
    }
  }

  const oldItems = (saved?.rows || []).filter((r) => r.kind === "item");
  const takeOld = (pred: (r: MaterialRow) => boolean) => {
    const i = oldItems.findIndex(pred);
    if (i < 0) return undefined;
    return oldItems.splice(i, 1)[0];
  };

  const rows: MaterialRow[] = [];
  rows.push({ ...emptyMaterialRow("group", "A"), material: "PLY" });
  if (boards.size === 0) {
    rows.push({ ...emptyMaterialRow("item"), material: "PLY", brand: "REGULAR", size: "8X4" });
  } else {
    for (const b of boards.values()) {
      const label = isBoard(b.material) ? b.material : "PLY";
      const gen: MaterialRow = {
        ...emptyMaterialRow("item"),
        material: label,
        brand: "REGULAR",
        thk: b.thk,
        size: "8X4",
        qty: sheetsFromArea(b.area),
      };
      rows.push(
        keepUser(
          takeOld((r) => r.material.toUpperCase() === label && r.thk === b.thk),
          gen,
        ),
      );
    }
  }

  rows.push({ ...emptyMaterialRow("group", "B"), material: "LAMINATE" });
  if (lams.size === 0) {
    rows.push({ ...emptyMaterialRow("item"), size: "8X4" });
  } else {
    for (const l of lams.values()) {
      const gen: MaterialRow = {
        ...emptyMaterialRow("item"),
        material: l.code,
        brand: "",
        thk: l.thk,
        size: "8X4",
        qty: sheetsFromArea(l.area),
      };
      rows.push(keepUser(takeOld((r) => r.material.toUpperCase() === l.code.toUpperCase()), gen));
    }
  }

  rows.push({
    ...emptyMaterialRow("group", "C"),
    material: "EDGEBANDING",
    brand: "CODE",
    thk: "BRAND",
    size: "SIZE",
  });
  if (ebs.size === 0) {
    rows.push(emptyMaterialRow("item"));
  } else {
    for (const e of ebs.values()) {
      const meters = Math.max(1, Math.round(e.m));
      const gen: MaterialRow = {
        ...emptyMaterialRow("item"),
        material: e.code,
        size: e.size,
        qty: `${meters}M`,
      };
      rows.push(keepUser(takeOld((r) => r.material.toUpperCase() === e.code.toUpperCase()), gen));
    }
  }

  for (const leftover of oldItems) rows.push(leftover);

  return {
    ...base,
    customer_name: saved?.customer_name || meta.customer_name,
    date: saved?.date || meta.date,
    rows,
  };
}
