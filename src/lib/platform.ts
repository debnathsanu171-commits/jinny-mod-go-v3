/** Owner email — subscription portal is visible only to this account. */
export const PLATFORM_ADMIN_EMAIL = "debnathofficial07@gmail.com";
export const APP_NAME = "JINNY MOD GO";
export const APP_NAME_MARK = "JINNY MOD GO";

export const SUBSCRIBER_STATUSES = ["pending", "approved", "active", "suspended", "revoked"] as const;
export type SubscriberStatus = (typeof SUBSCRIBER_STATUSES)[number];

export const SUBSCRIBER_PLANS = ["trial", "monthly", "yearly"] as const;
export type SubscriberPlan = (typeof SUBSCRIBER_PLANS)[number];

export const DEPARTMENTS = [
  { id: "admin", label: "Admin" },
  { id: "cutting", label: "Cutting / CNC" },
  { id: "edgeband", label: "Edge banding" },
  { id: "packing", label: "Packing" },
  { id: "dispatch", label: "Dispatch" },
  { id: "floor", label: "Floor / Fitting" },
  { id: "accounts", label: "Accounts" },
] as const;

export type DepartmentId = (typeof DEPARTMENTS)[number]["id"];
export type AccessRole = "owner" | "subscriber" | "worker";

export const SHOP_STAGES = [
  { key: "bom", label: "BOM", column: "stage_bom" },
  { key: "pasting", label: "HOT/COLD PRESS PASTING", column: "stage_pasting" },
  { key: "cutting", label: "CUTTING", column: "stage_cutting" },
  { key: "edgeband", label: "EDGE BAND", column: "stage_edgeband" },
  { key: "cnc", label: "CNC DRILLING", column: "stage_cnc" },
  { key: "qc", label: "QC & Dispatch", column: "stage_qc" },
] as const;
export type ShopStageKey = (typeof SHOP_STAGES)[number]["key"];
export const SHOP_STAGE_VALUES = ["pending", "running", "done"] as const;
export type ShopStageValue = (typeof SHOP_STAGE_VALUES)[number];
export function isShopStageKey(v: string): v is ShopStageKey {
  return SHOP_STAGES.some((s) => s.key === v);
}
export function isShopStageValue(v: string): v is ShopStageValue {
  return (SHOP_STAGE_VALUES as readonly string[]).includes(v);
}

export const JOB_STATUSES = ["draft", "imported", "packing", "ready", "dispatched"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export function isJobStatus(v: string): v is JobStatus {
  return (JOB_STATUSES as readonly string[]).includes(v);
}

export function nextJobStatus(v: string): JobStatus {
  const i = JOB_STATUSES.indexOf(v as JobStatus);
  return JOB_STATUSES[i < 0 ? 0 : (i + 1) % JOB_STATUSES.length];
}

export function jobStatusPct(status: string): number {
  const i = JOB_STATUSES.indexOf(status as JobStatus);
  if (i <= 0) return 0;
  return Math.round((i / (JOB_STATUSES.length - 1)) * 100);
}

export const HARDWARE_RE =
  /hinge|handle|knob|screw|dowel|minifix|confirmat|channel|runner|lock|magnet|bracket|grommet|hardware|fitting|slide|soft.?close|leg|bolt|nut|washer|cam|connector/i;

export function isWorkOrderComplete(status: string): boolean {
  return status === "ready" || status === "dispatched";
}

export const JOB_BINS = [
  { id: "new", label: "New project", statuses: ["draft"], accent: "border-t-muted" },
  { id: "pending", label: "Pending", statuses: ["imported"], accent: "border-t-warn" },
  { id: "process", label: "On process", statuses: ["packing"], accent: "border-t-info" },
  { id: "completed", label: "Completed", statuses: ["ready"], accent: "border-t-ok" },
  { id: "dispatched", label: "Dispatched", statuses: ["dispatched"], accent: "border-t-primary" },
] as const;
export type JobBinId = (typeof JOB_BINS)[number]["id"];
export function jobBinId(status: string): JobBinId {
  const s = status.toLowerCase();
  const hit = JOB_BINS.find((b) => (b.statuses as readonly string[]).includes(s));
  return hit?.id ?? "pending";
}

export function jmdOrderPrefix(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    month: "2-digit",
    year: "2-digit",
  }).formatToParts(now);
  const mm = parts.find((p) => p.type === "month")?.value ?? "01";
  const yy = parts.find((p) => p.type === "year")?.value ?? "26";
  return `JMD-${mm}-${yy}-`;
}

export function formatJmdOrderNo(seq: number, now = new Date()): string {
  return `${jmdOrderPrefix(now)}${String(Math.max(1, seq)).padStart(3, "0")}`;
}

export const PERMISSIONS = [
  "dashboard",
  "projects",
  "uploads",
  "materials",
  "packing",
  "labels",
  "dispatch",
  "team",
  "whatsapp",
  "settings",
  "floor",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL_FACTORY: Permission[] = [...PERMISSIONS];

/** Department = factory job role. Admin / owner / subscriber get the full factory. */
export const DEPT_PERMISSIONS: Record<DepartmentId, Permission[]> = {
  admin: ALL_FACTORY,
  packing: ["dashboard", "packing", "labels", "settings"],
  dispatch: ["dashboard", "labels", "dispatch", "whatsapp", "settings"],
  floor: ["dashboard", "floor", "settings"],
  cutting: ["dashboard", "projects", "materials", "settings"],
  edgeband: ["dashboard", "projects", "materials", "settings"],
  accounts: ["dashboard", "dispatch", "whatsapp", "settings"],
};

export const ROUTE_PERM: Record<string, Permission> = {
  "/": "dashboard",
  "/projects": "projects",
  "/uploads": "uploads",
  "/materials": "materials",
  "/packing": "packing",
  "/labels": "labels",
  "/dispatch": "dispatch",
  "/shop": "projects",
  "/shop/bom": "projects",
  "/optimizer": "projects",
  "/projects/$id/subs/$sid": "projects",
  "/team": "team",
  "/whatsapp": "whatsapp",
  "/settings": "settings",
  "/floor": "floor",
};

export function permissionsFor(role: AccessRole, department?: string | null): Permission[] {
  if (role === "owner" || role === "subscriber") return ALL_FACTORY;
  if (department && isDepartment(department)) return DEPT_PERMISSIONS[department];
  return ["dashboard", "settings"];
}

export function hasPerm(
  access: { permissions?: Permission[]; canAdmin?: boolean } | null | undefined,
  perm: Permission,
): boolean {
  if (!access) return false;
  if (access.canAdmin) return true;
  return (access.permissions ?? []).includes(perm);
}

export function permLabel(perm: Permission): string {
  return perm.replace(/^\w/, (c) => c.toUpperCase());
}

export type Access = {
  email: string;
  role: AccessRole;
  status: SubscriberStatus | "none";
  canFactory: boolean;
  canAdmin: boolean;
  canManageTeam: boolean;
  company: string | null;
  contact: string | null;
  department: string | null;
  workspaceUserId: string | null;
  subscriberId: number | null;
  portal_message: string | null;
  permissions: Permission[];
  ends_at: string | null;
};

export type SubscriberRow = {
  id: number;
  company_name: string;
  contact_name: string | null;
  email: string;
  phone: string | null;
  plan: string;
  status: SubscriberStatus;
  notes: string | null;
  user_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
  team_count?: number;
  portal_message?: string | null;
};

export type TeamMemberRow = {
  id: number;
  subscriber_id: number;
  name: string;
  email: string;
  department: string;
  phone: string | null;
  user_id: string | null;
  created_at: string;
};

export function isPlatformAdminEmail(email?: string | null): boolean {
  return (email ?? "").trim().toLowerCase() === PLATFORM_ADMIN_EMAIL;
}

export function isSubscriberStatus(v: string): v is SubscriberStatus {
  return (SUBSCRIBER_STATUSES as readonly string[]).includes(v);
}

export function isSubscriberPlan(v: string): v is SubscriberPlan {
  return (SUBSCRIBER_PLANS as readonly string[]).includes(v);
}

export function isDepartment(v: string): v is DepartmentId {
  return DEPARTMENTS.some((d) => d.id === v);
}

export function departmentLabel(id?: string | null): string {
  return DEPARTMENTS.find((d) => d.id === id)?.label ?? id ?? "—";
}

export function canUseFactory(role: string, status: string, endsAt?: string | null): boolean {
  if (role === "owner") return true;
  return subscriptionOpen(status, endsAt);
}

/** Active and still inside the paid/granted window. No end date = open until suspend. */
export function subscriptionOpen(status: string, endsAt?: string | null): boolean {
  if (status !== "active") return false;
  if (!endsAt) return true;
  const t = Date.parse(endsAt);
  if (!Number.isFinite(t)) return true;
  return t > Date.now();
}

export function isSubscriptionExpired(status: string, endsAt?: string | null): boolean {
  if (status !== "active" || !endsAt) return false;
  const t = Date.parse(endsAt);
  return Number.isFinite(t) && t <= Date.now();
}

export function displayStatus(status: string, endsAt?: string | null): string {
  return isSubscriptionExpired(status, endsAt) ? "expired" : status;
}

export function formatSubDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function factoryBlockMessage(status: string, role?: AccessRole, custom?: string | null, endsAt?: string | null): string {
  const note = (custom ?? "").trim();
  if (note && (status !== "active" || isSubscriptionExpired(status, endsAt))) return note;
  if (isSubscriptionExpired(status, endsAt)) {
    return "Subscription ended. Ask JINNY MOD GO to add days.";
  }
  if (status === "none") {
    return "This login was not issued from the JINNY MOD GO owner portal. Ask the owner to create your ID and password.";
  }
  if (role === "worker") {
    switch (status) {
      case "pending":
        return "Your factory is pending. Team cannot sign in until the owner grants access.";
      case "approved":
        return "Your factory is approved but not activated. Team access is locked.";
      case "suspended":
        return "This factory is suspended. You and the whole team cannot use the system.";
      case "revoked":
        return "This factory access has been revoked. Client and team logins are blocked.";
      default:
        return "Your factory is not active. Ask your factory admin.";
    }
  }
  switch (status) {
    case "pending":
      return "Your factory is pending owner approval. Access stays locked until they grant days or activate.";
    case "approved":
      return "Your factory is approved. Access stays locked until the owner grants days or activates.";
    case "suspended":
      return "Your factory is suspended. You and your team cannot access packing until restored.";
    case "revoked":
      return "Your factory access has been revoked.";
    default:
      return "This login is not active on JINNY MOD GO.";
  }
}

export function statusActions(status: SubscriberStatus): SubscriberStatus[] {
  switch (status) {
    case "pending":
      return ["approved", "active", "revoked"];
    case "approved":
      return ["active", "suspended", "revoked"];
    case "active":
      return ["suspended", "revoked"];
    case "suspended":
      return ["active", "revoked"];
    case "revoked":
      return ["approved"];
  }
}
