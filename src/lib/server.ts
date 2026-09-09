import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  canUseFactory,
  factoryBlockMessage,
  formatJmdOrderNo,
  hasPerm,
  isDepartment,
  isJobStatus,
  isPlatformAdminEmail,
  isShopStageKey,
  isShopStageValue,
  isSubscriberPlan,
  isSubscriberStatus,
  jmdOrderPrefix,
  permissionsFor,
  type Access,
  type Permission,
  type SubscriberStatus,
  type TeamMemberRow,
} from "@/lib/platform";
import { cutPanelKg, resolveMaterial, type LamMode } from "@/lib/weight";
import { packParts, PACK_REV, type PackPart } from "@/lib/packing";
import { parseCsv } from "@/lib/csv";
import { bindRls } from "@/lib/rls.server";

function n(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string") return Number(v);
  return 0;
}

const SEED_MATERIALS = [
  { short_name: "HDHMR", full_name: "Laminated HDHMR", family: "LAMINATED_HDHMR", lam: "BSL", thickness_mm: 18 },
  { short_name: "MDF-WHITE", full_name: "Laminated MDF White", family: "LAMINATED_MDF", lam: "BSL", thickness_mm: 18 },
  { short_name: "PART-GRY", full_name: "Laminated Particle Grey", family: "LAMINATED_PARTICLE", lam: "BSL", thickness_mm: 18 },
  { short_name: "MDF-RAW", full_name: "Plain MDF", family: "PLAIN_MDF", lam: "PLAIN", thickness_mm: 18 },
  { short_name: "BOILO", full_name: "Laminated Boilo", family: "LAMINATED_BOILO", lam: "BSL", thickness_mm: 18 },
];

async function seedAdmin() {
  const { seedPlatformAdmin } = await import("@/lib/seed-admin.server");
  await seedPlatformAdmin();
}

async function ensureLabelColumns() {
  const sql = await getSql();
  await sql.query("alter table projects add column if not exists cabinet_size text");
  await sql.query("alter table projects add column if not exists city_state text");
  await sql.query("alter table projects add column if not exists dispatch_time text");
  await sql.query("alter table projects add column if not exists address text");
  await sql.query("alter table projects add column if not exists client_phone text");
  await sql.query("alter table projects add column if not exists order_receive_date text");
  await sql.query("alter table projects add column if not exists expected_dispatch_date text");
  await sql.query("alter table projects add column if not exists stage_bom text not null default 'pending'");
  await sql.query("alter table projects add column if not exists stage_pasting text not null default 'pending'");
  await sql.query("alter table projects add column if not exists stage_cutting text not null default 'pending'");
  await sql.query("alter table projects add column if not exists stage_edgeband text not null default 'pending'");
  await sql.query("alter table projects add column if not exists stage_cnc text not null default 'pending'");
  await sql.query("alter table projects add column if not exists stage_qc text not null default 'pending'");
}

async function ensureSubProjects() {
  const sql = await getSql();
  await sql.query(`create table if not exists sub_projects (
    id serial primary key,
    user_id text not null,
    project_id int not null references projects(id) on delete cascade,
    sub_order_no text not null,
    product_name text not null,
    item_qty int not null default 1,
    status text not null default 'draft',
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`);
  await sql.query("create index if not exists sub_projects_project_idx on sub_projects (project_id)");
  await sql.query("alter table parts add column if not exists sub_project_id int");
  await sql.query("alter table sub_projects add column if not exists work_order text");
}

async function stripDemoJobs(userId: string) {
  const sql = await getSql();
  await sql`
    delete from projects
    where user_id = ${userId}
      and code = 'PRJ-24-0091'
      and name = 'Executive Suites — Phase A'`;
  await sql`
    delete from clients
    where user_id = ${userId}
      and name = 'Shri Gulabrai Sons'
      and not exists (select 1 from projects p where p.client_id = clients.id)`;
}

async function ensureWorkspace(userId: string, displayName: string | null) {
  const sql = await getSql();
  await stripDemoJobs(userId);
  const boot = await sql<{ bootstrapped: boolean }>`select bootstrapped from profiles where user_id = ${userId}`;
  if (boot[0]?.bootstrapped) return;
  await sql`
    insert into profiles (user_id, display_name, role, bootstrapped)
    values (${userId}, ${displayName ?? "Operator"}, 'admin', true)
    on conflict (user_id) do update set bootstrapped = true`;
  for (const m of SEED_MATERIALS) {
    await sql`
      insert into materials (user_id, short_name, full_name, family, lam, thickness_mm)
      values (${userId}, ${m.short_name}, ${m.full_name}, ${m.family}, ${m.lam}, ${m.thickness_mm})
      on conflict (user_id, short_name) do nothing`;
  }
  await sql`insert into audit_logs (user_id, action, detail) values (${userId}, 'workspace.bootstrap', 'Factory workspace created')`;
}

type SubscriberRow = {
  id: number; company_name: string; contact_name: string | null; email: string; phone: string | null;
  plan: string; status: string; notes: string | null; user_id: string | null;
  starts_at: string | null; ends_at: string | null; created_at: string; updated_at: string;
  portal_message?: string | null;
};

async function resolveAccess(userId: string): Promise<Access> {
  await seedAdmin();
  const sql = await getSql();
  const users = await sql<{ email: string | null; name: string | null }>`
    select email, name from "user" where id = ${userId} limit 1`;
  const email = (users[0]?.email ?? "").trim();
  const name = users[0]?.name ?? null;
  const owner = isPlatformAdminEmail(email);
  bindRls({
    loginUserId: userId,
    loginEmail: email.toLowerCase(),
    isOwner: owner,
    workspaceId: owner ? userId : "",
  });
  const empty = (partial: Partial<Access>): Access => ({
    email, role: "subscriber", status: "none", canFactory: false, canAdmin: false, canManageTeam: false,
    company: null, contact: name, department: null, workspaceUserId: null, subscriberId: null, portal_message: null,
    permissions: [], ends_at: null, ...partial,
  });
  if (isPlatformAdminEmail(email)) {
    return empty({
      role: "owner", status: "active", canFactory: true, canAdmin: true, canManageTeam: true,
      workspaceUserId: userId, contact: name, company: "JINNY MOD GO",
      permissions: permissionsFor("owner"),
    });
  }
  let rows = await sql<SubscriberRow>`
    select id, company_name, contact_name, email, phone, plan, status, notes, user_id,
           starts_at::text, ends_at::text, created_at::text, updated_at::text, portal_message
    from subscribers
    where user_id = ${userId} or lower(email) = ${email.toLowerCase()}
    order by case when user_id = ${userId} then 0 else 1 end
    limit 1`;
  if (rows[0]) {
    if (!rows[0].user_id) {
      await sql`update subscribers set user_id = ${userId}, updated_at = now() where id = ${rows[0].id}`;
      rows[0].user_id = userId;
    }
    const status = (rows[0].status as SubscriberStatus) ?? "pending";
    bindRls({ workspaceId: rows[0].user_id ?? userId, isOwner: false });
    const open = canUseFactory("subscriber", status, rows[0].ends_at);
    return empty({
      role: "subscriber", status, canFactory: open,
      canManageTeam: open,
      company: rows[0].company_name, contact: rows[0].contact_name ?? name, workspaceUserId: rows[0].user_id, subscriberId: rows[0].id,
      portal_message: rows[0].portal_message ?? null,
      permissions: open ? permissionsFor("subscriber") : [],
      ends_at: rows[0].ends_at ?? null,
    });
  }
  const team = await sql<{
    id: number; subscriber_id: number; name: string; department: string; user_id: string | null;
    company_name: string; factory_status: string; factory_user_id: string | null; portal_message: string | null;
    factory_ends_at: string | null;
  }>`
    select t.id, t.subscriber_id, t.name, t.department, t.user_id,
           s.company_name, s.status as factory_status, s.user_id as factory_user_id, s.portal_message,
           s.ends_at::text as factory_ends_at
    from team_members t
    join subscribers s on s.id = t.subscriber_id
    where t.user_id = ${userId} or lower(t.email) = ${email.toLowerCase()}
    limit 1`;
  if (team[0]) {
    if (!team[0].user_id) {
      await sql`update team_members set user_id = ${userId}, updated_at = now() where id = ${team[0].id}`;
    }
    const status = (team[0].factory_status as SubscriberStatus) ?? "pending";
    const workspaceUserId = team[0].factory_user_id;
    bindRls({ workspaceId: workspaceUserId ?? "", isOwner: false });
    const open = canUseFactory("worker", status, team[0].factory_ends_at) && Boolean(workspaceUserId);
    const perms = open ? permissionsFor("worker", team[0].department) : [];
    return empty({
      role: "worker", status, canFactory: open,
      canManageTeam: open && team[0].department === "admin",
      company: team[0].company_name, contact: team[0].name || name, department: team[0].department,
      workspaceUserId, subscriberId: team[0].subscriber_id,
      portal_message: team[0].portal_message ?? null,
      permissions: perms,
      ends_at: team[0].factory_ends_at ?? null,
    });
  }
  return empty({ role: "subscriber", status: "none" });
}

async function requireFactory(userId: string) {
  const access = await resolveAccess(userId);
  if (!access.canFactory || !access.workspaceUserId) throw new Error(factoryBlockMessage(access.status, access.role, access.portal_message, access.ends_at));
  bindRls({
    loginUserId: userId,
    loginEmail: access.email.toLowerCase(),
    isOwner: access.canAdmin,
    workspaceId: access.workspaceUserId,
  });
  await ensureWorkspace(access.workspaceUserId, access.contact);
  return access.workspaceUserId;
}

async function requirePerm(userId: string, ...perms: Permission[]) {
  const access = await resolveAccess(userId);
  if (!access.canFactory || !access.workspaceUserId) throw new Error(factoryBlockMessage(access.status, access.role, access.portal_message, access.ends_at));
  if (!perms.some((p) => hasPerm(access, p))) {
    throw new Error("Your role cannot do this");
  }
  bindRls({
    loginUserId: userId,
    loginEmail: access.email.toLowerCase(),
    isOwner: access.canAdmin,
    workspaceId: access.workspaceUserId,
  });
  await ensureWorkspace(access.workspaceUserId, access.contact);
  return access.workspaceUserId;
}

async function requireOwner(userId: string) {
  const access = await resolveAccess(userId);
  if (!access.canAdmin) throw new Error("Owner portal only");
  bindRls({
    loginUserId: userId,
    loginEmail: access.email.toLowerCase(),
    isOwner: true,
    workspaceId: access.workspaceUserId ?? userId,
  });
  return access;
}

export const ensurePlatformSeed = createServerFn({ method: "POST" }).handler(async () => {
  await seedAdmin();
  return { ok: true };
});

export const getAccess = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => resolveAccess(context.userId));

export const listSubscribers = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  await requireOwner(context.userId);
  const rows = await (await getSql())<SubscriberRow & { team_count: number }>`
      select id, company_name, contact_name, email, phone, plan, status, notes, user_id,
             starts_at::text, ends_at::text, created_at::text, updated_at::text, portal_message,
             (select count(*)::int from team_members t where t.subscriber_id = subscribers.id) as team_count
      from subscribers
      order by case status
        when 'pending' then 0 when 'approved' then 1 when 'active' then 2
        when 'suspended' then 3 when 'revoked' then 4 else 5 end, company_name`;
  return {
    rows,
    counts: {
      total: rows.length,
      pending: rows.filter((r) => r.status === "pending").length,
      approved: rows.filter((r) => r.status === "approved").length,
      active: rows.filter((r) => r.status === "active").length,
      suspended: rows.filter((r) => r.status === "suspended").length,
      revoked: rows.filter((r) => r.status === "revoked").length,
      linked: rows.filter((r) => r.user_id).length,
    },
  };
});

export const saveSubscriber = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: {
    id?: number; company_name: string; email: string; contact_name?: string; phone?: string;
    plan?: string; notes?: string; password?: string; activate?: boolean; portal_message?: string;
  }) => d)
  .handler(async ({ context, data }) => {
    await requireOwner(context.userId);
    const sql = await getSql();
    const company = data.company_name.trim();
    const email = data.email.trim().toLowerCase();
    if (!company) throw new Error("Company name is required");
    if (!email || !email.includes("@")) throw new Error("A valid client email is required");
    if (isPlatformAdminEmail(email)) throw new Error("Owner account cannot be added as a subscriber");
    const rawPlan = data.plan ?? "monthly";
    const plan = isSubscriberPlan(rawPlan) ? rawPlan : "monthly";
    const password = data.password?.trim() ?? "";
    if (!data.id && password.length < 8) throw new Error("Set a password — only this login can enter");
    const dup = await sql<{ id: number }>`select id from subscribers where lower(email) = ${email} limit 1`;
    if (dup[0] && dup[0].id !== data.id) throw new Error("That email is already a subscriber");
    if ((await sql<{ id: number }>`select id from team_members where lower(email) = ${email} limit 1`)[0]) {
      throw new Error("That email is already a factory worker");
    }
    let linkedId: string | null = (await sql<{ id: string }>`select id from "user" where lower(email) = ${email} limit 1`)[0]?.id ?? null;
    if (password) {
      const { upsertCredentialUser } = await import("@/lib/accounts.server");
      linkedId = await upsertCredentialUser({ name: data.contact_name?.trim() || company, email, password });
    } else if (!linkedId) {
      const { ensureUser } = await import("@/lib/accounts.server");
      linkedId = await ensureUser({ name: data.contact_name?.trim() || company, email });
    }
    const msg = data.portal_message?.trim() || null;
    if (data.id) {
      await sql`
        update subscribers set
          company_name = ${company}, contact_name = ${data.contact_name?.trim() || null},
          email = ${email}, phone = ${data.phone?.trim() || null}, plan = ${plan},
          notes = ${data.notes?.trim() || null}, user_id = coalesce(${linkedId}, user_id),
          portal_message = coalesce(${msg}, portal_message), updated_at = now()
        where id = ${data.id}`;
      if (data.activate) {
        await sql`update subscribers set status = 'active', starts_at = coalesce(starts_at, now()), ends_at = null, updated_at = now() where id = ${data.id}`;
      }
      return { id: data.id };
    }
    const status = "pending";
    const rows = await sql<{ id: number }>`
      insert into subscribers (company_name, contact_name, email, phone, plan, status, notes, user_id)
      values (${company}, ${data.contact_name?.trim() || null}, ${email}, ${data.phone?.trim() || null}, ${plan}, ${status}, ${data.notes?.trim() || null}, ${linkedId})
      returning id`;
    if (linkedId) await ensureWorkspace(linkedId, data.contact_name ?? null);
    return { id: rows[0].id };
  });

export const setSubscriberStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: number; status: string; message?: string }) => d)
  .handler(async ({ context, data }) => {
    await requireOwner(context.userId);
    if (!isSubscriberStatus(data.status)) throw new Error("Invalid status");
    const sql = await getSql();
    const status = data.status;
    const msg = data.message?.trim();
    if (status === "active") {
      await sql`update subscribers set status = 'active', starts_at = coalesce(starts_at, now()), updated_at = now() where id = ${data.id}`;
    } else if (status === "revoked") {
      await sql`update subscribers set status = 'revoked', ends_at = now(), updated_at = now() where id = ${data.id}`;
    } else if (status === "approved") {
      await sql`update subscribers set status = 'approved', ends_at = null, updated_at = now() where id = ${data.id}`;
    } else {
      await sql`update subscribers set status = ${status}, updated_at = now() where id = ${data.id}`;
    }
    if (msg !== undefined && (status === "suspended" || status === "revoked" || status === "pending")) {
      await sql`update subscribers set portal_message = ${msg || null}, updated_at = now() where id = ${data.id}`;
    }
    return { ok: true };
  });

export const grantSubscriptionDays = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: number; days: number }) => d)
  .handler(async ({ context, data }) => {
    await requireOwner(context.userId);
    const days = Math.floor(Number(data.days));
    if (![1, 2, 3].includes(days)) throw new Error("Grant 1, 2 or 3 days");
    const sql = await getSql();
    const row = await sql<{ id: number; status: string }>`select id, status from subscribers where id = ${data.id}`;
    if (!row[0]) throw new Error("Client not found");
    if (row[0].status === "revoked") throw new Error("Revoked clients cannot get days. Approve first.");
    if (row[0].status === "suspended") throw new Error("Unsuspend before adding days");
    await sql`
      update subscribers set
        status = 'active',
        starts_at = coalesce(starts_at, now()),
        ends_at = case
          when ends_at is not null and ends_at > now() then ends_at + (${days} * interval '1 day')
          else now() + (${days} * interval '1 day')
        end,
        updated_at = now()
      where id = ${data.id}`;
    return { ok: true, days };
  });

export const setPortalMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: number; message: string }) => d)
  .handler(async ({ context, data }) => {
    await requireOwner(context.userId);
    const sql = await getSql();
    if (!(await sql`select id from subscribers where id = ${data.id}`)[0]) throw new Error("Client not found");
    await sql`update subscribers set portal_message = ${data.message.trim() || null}, updated_at = now() where id = ${data.id}`;
    return { ok: true };
  });

export const bootstrapWorkspace = createServerFn({ method: "POST" }).middleware([authMiddleware]).handler(async ({ context }) => {
  await requireFactory(context.userId);
  return { ok: true };
});

export const getDashboard = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const uid = await requireFactory(context.userId);
  const sql = await getSql();
  const clients = await sql<{ c: number }>`select count(*)::int as c from clients where user_id = ${uid} and archived = false`;
  const projects = await sql<{ c: number }>`select count(*)::int as c from projects where user_id = ${uid}`;
  const active = await sql<{ c: number }>`select count(*)::int as c from projects where user_id = ${uid} and status not in ('dispatched','archived')`;
  const boxes = await sql<{ c: number }>`select count(*)::int as c from boxes where user_id = ${uid}`;
  const pending = await sql<{ c: number }>`select count(*)::int as c from boxes where user_id = ${uid} and status in ('packed','verified','ready')`;
  const dispatched = await sql<{ c: number }>`select count(*)::int as c from boxes where user_id = ${uid} and status = 'dispatched'`;
  const packedW = await sql<{ s: string }>`select coalesce(sum(total_weight_kg),0)::text as s from boxes where user_id = ${uid}`;
  const recent = await sql<{ id: number; action: string; detail: string | null; created_at: string }>`
      select id, action, detail, created_at::text from audit_logs where user_id = ${uid} order by id desc limit 8`;
  const projList = await sql<{ id: number; code: string; name: string; status: string; client_name: string | null }>`
      select p.id, p.code, p.name, p.status, c.name as client_name
      from projects p left join clients c on c.id = p.client_id
      where p.user_id = ${uid} order by p.updated_at desc limit 8`;
  return {
    totalClients: n(clients[0]?.c), totalProjects: n(projects[0]?.c), activeProjects: n(active[0]?.c),
    totalBoxes: n(boxes[0]?.c), pendingDispatch: n(pending[0]?.c), dispatched: n(dispatched[0]?.c),
    packedKg: n(packedW[0]?.s), recent, projects: projList,
  };
});

export const listClients = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const uid = await requireFactory(context.userId);
  return (await getSql())<{ id: number; name: string; contact_person: string | null; archived: boolean; created_at: string }>`
    select id, name, contact_person, archived, created_at::text from clients where user_id = ${uid} order by name`;
});

export const saveClient = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id?: number; name: string; contact_person?: string; billing_address?: string; delivery_address?: string; phone?: string }) => d)
  .handler(async ({ context, data }) => {
    const uid = await requirePerm(context.userId, "projects");
    const sql = await getSql();
    if (data.id) {
      await sql`update clients set name = ${data.name}, contact_person = ${data.contact_person ?? null},
        billing_address = ${data.billing_address ?? null}, delivery_address = ${data.delivery_address ?? null},
        phone = ${data.phone ?? null}, updated_at = now()
        where id = ${data.id} and user_id = ${uid}`;
      return { id: data.id };
    }
    const rows = await sql<{ id: number }>`
      insert into clients (user_id, name, contact_person, billing_address, delivery_address, phone)
      values (${uid}, ${data.name}, ${data.contact_person ?? null}, ${data.billing_address ?? null}, ${data.delivery_address ?? null}, ${data.phone ?? null})
      returning id`;
    return { id: rows[0].id };
  });

export const nextOrderNo = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const uid = await requirePerm(context.userId, "projects");
  const prefix = jmdOrderPrefix();
  const rows = await (await getSql())<{ po_number: string | null }>`
    select po_number from projects where user_id = ${uid} and po_number like ${prefix + "%"}`;
  let max = 0;
  for (const row of rows) {
    const m = row.po_number?.match(/JMD-\d{2}-\d{2}-(\d+)$/i);
    if (m) max = Math.max(max, Number(m[1]) || 0);
  }
  return { orderNo: formatJmdOrderNo(max + 1) };
});

export const listProjects = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const uid = await requireFactory(context.userId);
  await ensureLabelColumns();
  return (await getSql())<{
    id: number; code: string; name: string; status: string; lam_mode: string;
    client_name: string | null; po_number: string | null; notes: string | null; updated_at: string; parts: number; boxes: number;
    stage_bom: string; stage_pasting: string; stage_cutting: string; stage_edgeband: string; stage_cnc: string; stage_qc: string;
  }>`
      select p.id, p.code, p.name, p.status, p.lam_mode, c.name as client_name, p.po_number, p.notes, p.updated_at::text,
             (select count(*)::int from parts x where x.project_id = p.id) as parts,
             (select count(*)::int from boxes x where x.project_id = p.id) as boxes,
             p.stage_bom, p.stage_pasting, p.stage_cutting, p.stage_edgeband, p.stage_cnc, p.stage_qc
      from projects p left join clients c on c.id = p.client_id
      where p.user_id = ${uid} order by p.updated_at desc`;
});

export const listShopBom = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const uid = await requireFactory(context.userId);
  return (await getSql())<{
    id: number;
    project_id: number;
    code: string;
    product: string;
    client_name: string | null;
    po_number: string | null;
    unit: string;
    part_name: string;
    length_mm: string;
    width_mm: string;
    thickness_mm: string;
    material: string;
    qty: number;
    weight_kg: string;
    board_sku: string | null;
  }>`
    select x.id, x.project_id, p.code, p.name as product, c.name as client_name, p.po_number,
           x.unit, x.part_name, x.length_mm::text, x.width_mm::text, x.thickness_mm::text,
           x.material, x.qty, x.weight_kg::text, x.board_sku
    from parts x
    join projects p on p.id = x.project_id
    left join clients c on c.id = p.client_id
    where p.user_id = ${uid} and p.status = 'packing'
    order by p.po_number, x.unit, x.id`;
});

export const setProjectStage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: number; stage: string; value: string }) => d)
  .handler(async ({ context, data }) => {
    const uid = await requirePerm(context.userId, "projects");
    if (!isShopStageKey(data.stage) || !isShopStageValue(data.value)) throw new Error("Invalid stage");
    await ensureLabelColumns();
    const sql = await getSql();
    const id = data.id;
    const v = data.value;
    if (data.stage === "bom") await sql`update projects set stage_bom = ${v}, updated_at = now() where id = ${id} and user_id = ${uid}`;
    else if (data.stage === "pasting") await sql`update projects set stage_pasting = ${v}, updated_at = now() where id = ${id} and user_id = ${uid}`;
    else if (data.stage === "cutting") await sql`update projects set stage_cutting = ${v}, updated_at = now() where id = ${id} and user_id = ${uid}`;
    else if (data.stage === "edgeband") await sql`update projects set stage_edgeband = ${v}, updated_at = now() where id = ${id} and user_id = ${uid}`;
    else if (data.stage === "cnc") await sql`update projects set stage_cnc = ${v}, updated_at = now() where id = ${id} and user_id = ${uid}`;
    else await sql`update projects set stage_qc = ${v}, updated_at = now() where id = ${id} and user_id = ${uid}`;
    return { ok: true };
  });

export const setProjectStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: number; status: string }) => d)
  .handler(async ({ context, data }) => {
    const uid = await requirePerm(context.userId, "projects");
    if (!isJobStatus(data.status)) throw new Error("Invalid status");
    await (await getSql())`update projects set status = ${data.status}, updated_at = now() where id = ${data.id} and user_id = ${uid}`;
    return { ok: true };
  });

export const listSubProjects = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((projectId: number) => projectId)
  .handler(async ({ context, data: projectId }) => {
    const uid = await requireFactory(context.userId);
    await ensureSubProjects();
    return (await getSql())<{
      id: number; project_id: number; sub_order_no: string; product_name: string;
      item_qty: number; status: string; notes: string | null;
    }>`select id, project_id, sub_order_no, product_name, item_qty, status, notes
       from sub_projects where project_id = ${projectId} and user_id = ${uid} order by id`;
  });

export const listWorkBoard = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const uid = await requireFactory(context.userId);
  await ensureLabelColumns();
  await ensureSubProjects();
  const sql = await getSql();
  const projects = await sql<{
    id: number; code: string; name: string; status: string;
    client_name: string | null; po_number: string | null;
  }>`select p.id, p.code, p.name, p.status, c.name as client_name, p.po_number
     from projects p left join clients c on c.id = p.client_id
     where p.user_id = ${uid} order by p.updated_at desc`;
  const subs = await sql<{
    id: number; project_id: number; sub_order_no: string; product_name: string;
    item_qty: number; status: string; notes: string | null;
  }>`select id, project_id, sub_order_no, product_name, item_qty, status, notes
     from sub_projects where user_id = ${uid} order by id`;
  return projects.map((p) => ({
    ...p,
    subs: subs.filter((s) => s.project_id === p.id),
  }));
});

export const saveSubProject = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id?: number; project_id: number; product_name: string; item_qty?: number; notes?: string }) => d)
  .handler(async ({ context, data }) => {
    const uid = await requirePerm(context.userId, "projects");
    await ensureSubProjects();
    const sql = await getSql();
    const name = data.product_name.trim();
    if (!name) throw new Error("Product name required");
    const qty = Math.max(1, Math.floor(data.item_qty ?? 1));
    const notes = data.notes?.trim() || null;
    if (data.id) {
      await sql`update sub_projects set product_name = ${name}, item_qty = ${qty}, notes = ${notes}, updated_at = now()
        where id = ${data.id} and project_id = ${data.project_id} and user_id = ${uid}`;
      return { id: data.id };
    }
    const parent = await sql<{ id: number; code: string; po_number: string | null }>`
      select id, code, po_number from projects where id = ${data.project_id} and user_id = ${uid}`;
    if (!parent[0]) throw new Error("Project not found");
    const base = (parent[0].po_number?.trim() || parent[0].code).replace(/-+$/, "");
    const existing = await sql<{ sub_order_no: string }>`
      select sub_order_no from sub_projects where project_id = ${data.project_id} and user_id = ${uid}`;
    let max = 0;
    const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^${escaped}-(\\d+)$`, "i");
    for (const row of existing) {
      const m = row.sub_order_no.match(re);
      if (m) max = Math.max(max, Number(m[1]) || 0);
    }
    const subNo = `${base}-${String(max + 1).padStart(2, "0")}`;
    const rows = await sql<{ id: number }>`
      insert into sub_projects (user_id, project_id, sub_order_no, product_name, item_qty, notes)
      values (${uid}, ${data.project_id}, ${subNo}, ${name}, ${qty}, ${notes})
      returning id`;
    await sql`update parts set sub_project_id = ${rows[0].id}
      where project_id = ${data.project_id} and user_id = ${uid}
        and sub_project_id is null and lower(unit) = ${name.toLowerCase()}`;
    return { id: rows[0].id, sub_order_no: subNo };
  });

export const setSubProjectStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id: number; status: string }) => d)
  .handler(async ({ context, data }) => {
    const uid = await requirePerm(context.userId, "projects");
    if (!isJobStatus(data.status)) throw new Error("Invalid status");
    await ensureSubProjects();
    await (await getSql())`update sub_projects set status = ${data.status}, updated_at = now()
      where id = ${data.id} and user_id = ${uid}`;
    return { ok: true };
  });

export const getSubProject = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { projectId: number; subId: number }) => d)
  .handler(async ({ context, data }) => {
    const uid = await requireFactory(context.userId);
    await ensureSubProjects();
    const sql = await getSql();
    const parent = await sql<{
      id: number; code: string; name: string; status: string;
      client_name: string | null; po_number: string | null;
      address: string | null; billing_address: string | null; delivery_address: string | null;
      client_phone: string | null; expected_dispatch_date: string | null;
    }>`select p.id, p.code, p.name, p.status, c.name as client_name, p.po_number,
             coalesce(nullif(p.address, ''), c.delivery_address, c.billing_address) as address,
             c.billing_address,
             coalesce(nullif(p.address, ''), c.delivery_address, c.billing_address) as delivery_address,
             coalesce(nullif(p.client_phone, ''), c.phone) as client_phone,
             p.expected_dispatch_date
       from projects p left join clients c on c.id = p.client_id
       where p.id = ${data.projectId} and p.user_id = ${uid}`;
    if (!parent[0]) throw new Error("Project not found");
    const sub = await sql<{
      id: number; project_id: number; sub_order_no: string; product_name: string;
      item_qty: number; status: string; notes: string | null; work_order: string | null;
    }>`select id, project_id, sub_order_no, product_name, item_qty, status, notes, work_order
       from sub_projects where id = ${data.subId} and project_id = ${data.projectId} and user_id = ${uid}`;
    if (!sub[0]) throw new Error("Sub project not found");
    const unit = sub[0].product_name.toLowerCase();
    const parts = await sql<{
      id: number; unit: string; part_name: string; length_mm: string; width_mm: string; thickness_mm: string;
      material: string; qty: number; notes: string | null; weight_kg: string; board_sku: string | null;
    }>`select id, unit, part_name, length_mm::text, width_mm::text, thickness_mm::text, material, qty, notes,
             weight_kg::text, board_sku
       from parts
       where project_id = ${data.projectId} and user_id = ${uid}
         and (sub_project_id = ${data.subId} or (sub_project_id is null and lower(unit) = ${unit}))
       order by unit, id`;
    return { project: parent[0], sub: sub[0], parts };
  });

export const saveWorkOrder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { projectId: number; subId: number; work_order: unknown }) => d)
  .handler(async ({ context, data }) => {
    const uid = await requirePerm(context.userId, "projects");
    await ensureSubProjects();
    const json = JSON.stringify(data.work_order ?? {});
    const notes =
      data.work_order && typeof data.work_order === "object" && "notes" in data.work_order
        ? String((data.work_order as { notes?: unknown }).notes ?? "")
        : null;
    await (await getSql())`update sub_projects
      set work_order = ${json}, notes = ${notes}, updated_at = now()
      where id = ${data.subId} and project_id = ${data.projectId} and user_id = ${uid}`;
    return { ok: true };
  });

export const saveProject = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: {
    id?: number; name: string; client_id?: number; po_number?: string; lam_mode?: LamMode; notes?: string;
    cabinet_size?: string; city_state?: string; dispatch_time?: string; address?: string; client_phone?: string;
    order_receive_date?: string; expected_dispatch_date?: string;
  }) => d)
  .handler(async ({ context, data }) => {
    const uid = await requirePerm(context.userId, "projects");
    await ensureLabelColumns();
    const sql = await getSql();
    const cab = data.cabinet_size?.trim() || null;
    const city = data.city_state?.trim() || null;
    const dtime = data.dispatch_time?.trim() || null;
    const addr = data.address?.trim() || null;
    const phone = data.client_phone?.trim() || null;
    const recv = data.order_receive_date?.trim() || null;
    const expd = data.expected_dispatch_date?.trim() || null;
    if (data.id) {
      await sql`update projects set name = ${data.name},
        client_id = ${data.client_id ?? null}, po_number = ${data.po_number ?? null},
        lam_mode = ${data.lam_mode ?? "prelam"}, notes = ${data.notes ?? null},
        cabinet_size = ${cab}, city_state = ${city}, dispatch_time = ${dtime},
        address = ${addr}, client_phone = ${phone},
        order_receive_date = ${recv}, expected_dispatch_date = ${expd}, updated_at = now()
        where id = ${data.id} and user_id = ${uid}`;
      return { id: data.id };
    }
    const code = `PRJ-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const rows = await sql<{ id: number }>`
      insert into projects (user_id, client_id, code, name, po_number, lam_mode, notes,
        cabinet_size, city_state, dispatch_time, address, client_phone, order_receive_date, expected_dispatch_date)
      values (${uid}, ${data.client_id ?? null}, ${code}, ${data.name},
              ${data.po_number ?? null}, ${data.lam_mode ?? "prelam"}, ${data.notes ?? null},
              ${cab}, ${city}, ${dtime}, ${addr}, ${phone}, ${recv}, ${expd})
      returning id`;
    await sql`insert into audit_logs (user_id, project_id, action, detail)
      values (${uid}, ${rows[0].id}, 'project.create', ${data.name})`;
    return { id: rows[0].id, code };
  });

export const getProject = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: number) => id)
  .handler(async ({ context, data: id }) => {
    const uid = await requireFactory(context.userId);
    await ensureLabelColumns();
    const sql = await getSql();
    const p = await sql<{
      id: number; code: string; name: string; status: string; lam_mode: string;
      client_id: number | null; client_name: string | null; po_number: string | null; notes: string | null;
      cabinet_size: string | null; city_state: string | null; dispatch_time: string | null;
      address: string | null; client_phone: string | null;
      order_receive_date: string | null; expected_dispatch_date: string | null;
    }>`select p.id, p.code, p.name, p.status, p.lam_mode, p.client_id, c.name as client_name, p.po_number, p.notes,
             p.cabinet_size, p.city_state, p.dispatch_time,
             coalesce(nullif(p.address, ''), c.delivery_address, c.billing_address) as address,
             coalesce(nullif(p.client_phone, ''), c.phone) as client_phone,
             p.order_receive_date, p.expected_dispatch_date
       from projects p left join clients c on c.id = p.client_id
       where p.id = ${id} and p.user_id = ${uid}`;
    if (!p[0]) throw new Error("Project not found");
    const parts = await sql<{
      id: number; unit: string; part_name: string; length_mm: string; width_mm: string; thickness_mm: string;
      material: string; qty: number; priority: string; notes: string | null; weight_kg: string;
      board_sku: string | null; box_id: number | null; status: string;
    }>`select id, unit, part_name, length_mm::text, width_mm::text, thickness_mm::text, material, qty, priority, notes,
             weight_kg::text, board_sku, box_id, status
       from parts where project_id = ${id} and user_id = ${uid} order by unit, id`;
    const boxes = await sql<{
      id: number; box_number: string; unit: string; seq: number; total_seq: number;
      total_weight_kg: string; status: string; sticker_status: string; verified: boolean;
    }>`select id, box_number, unit, seq, total_seq, total_weight_kg::text, status, sticker_status, verified
       from boxes where project_id = ${id} and user_id = ${uid} order by unit, seq`;
    return { project: p[0], parts, boxes };
  });

export const listMaterials = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const uid = await requireFactory(context.userId);
  return (await getSql())<{ id: number; short_name: string; full_name: string; family: string; lam: string; thickness_mm: string | null; active: boolean }>`
    select id, short_name, full_name, family, lam, thickness_mm::text, active from materials where user_id = ${uid} order by short_name`;
});

export const saveMaterial = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id?: number; short_name: string; full_name: string; family: string; lam: string; thickness_mm?: number; active?: boolean }) => d)
  .handler(async ({ context, data }) => {
    const uid = await requirePerm(context.userId, "materials");
    const sql = await getSql();
    if (data.id) {
      await sql`update materials set short_name = ${data.short_name}, full_name = ${data.full_name},
        family = ${data.family}, lam = ${data.lam}, thickness_mm = ${data.thickness_mm ?? null},
        active = ${data.active ?? true}
        where id = ${data.id} and user_id = ${uid}`;
      return { id: data.id };
    }
    const rows = await sql<{ id: number }>`
      insert into materials (user_id, short_name, full_name, family, lam, thickness_mm, active)
      values (${uid}, ${data.short_name}, ${data.full_name}, ${data.family}, ${data.lam}, ${data.thickness_mm ?? null}, ${data.active ?? true})
      returning id`;
    return { id: rows[0].id };
  });

export const importCsv = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { projectId: number; fileName: string; text: string }) => d)
  .handler(async ({ context, data }) => {
    const uid = await requirePerm(context.userId, "uploads");
    const sql = await getSql();
    const proj = await sql<{ id: number; lam_mode: string }>`select id, lam_mode from projects where id = ${data.projectId} and user_id = ${uid}`;
    if (!proj[0]) throw new Error("Project not found");
    const parsed = parseCsv(data.text);
    if (parsed.issues.filter((i) => i.field !== "Priority").length) {
      return { ok: false, issues: parsed.issues, imported: 0 };
    }
    const mats = await sql<{ short_name: string }>`select short_name from materials where user_id = ${uid} and active = true`;
    const known = new Set(mats.map((m) => m.short_name.toUpperCase()));
    const issues = [...parsed.issues];
    for (const r of parsed.rows) {
      if (!known.has(r.material.toUpperCase()) && !resolveMaterial(r.material)) {
        issues.push({ line: r.line, field: "Material", message: `Unknown material ${r.material}` });
      }
    }
    await sql`delete from boxes where project_id = ${data.projectId} and user_id = ${uid}`;
    await sql`delete from parts where project_id = ${data.projectId} and user_id = ${uid}`;
    let imported = 0;
    for (const r of parsed.rows) {
      const mat = resolveMaterial(r.material);
      const w = cutPanelKg({
        family: mat.family, boardTh: r.thicknessMm, lam: mat.lam,
        mode: (proj[0].lam_mode || "prelam") as LamMode,
        lengthMm: r.lengthMm, widthMm: r.widthMm, thicknessMm: r.thicknessMm, qty: r.qty,
      });
      await sql`
        insert into parts (user_id, project_id, unit, part_name, length_mm, width_mm, thickness_mm,
          material, qty, priority, notes, weight_kg, board_sku, weight_source, status)
        values (${uid}, ${data.projectId}, ${r.unit}, ${r.partName}, ${r.lengthMm}, ${r.widthMm},
          ${r.thicknessMm}, ${r.material}, ${r.qty}, ${r.priority}, ${r.notes || null},
          ${w.lineKg}, ${w.sku}, ${w.source}, 'unassigned')`;
      imported += 1;
    }
    await sql`
      insert into csv_imports (user_id, project_id, file_name, total_rows, ok_rows, error_rows, summary)
      values (${uid}, ${data.projectId}, ${data.fileName}, ${parsed.rows.length}, ${imported}, ${issues.length}, ${`${imported} rows imported`})`;
    await sql`update projects set status = 'imported', packing_version = packing_version + 1, updated_at = now()
      where id = ${data.projectId} and user_id = ${uid}`;
    await sql`insert into audit_logs (user_id, project_id, action, detail)
      values (${uid}, ${data.projectId}, 'csv.import', ${data.fileName})`;
    return { ok: true, imported, issues };
  });

export const runPacking = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((projectId: number) => projectId)
  .handler(async ({ context, data: projectId }) => {
    const uid = await requirePerm(context.userId, "packing");
    const sql = await getSql();
    const parts = await sql<{
      id: number; unit: string; part_name: string; length_mm: string; width_mm: string; thickness_mm: string;
      material: string; qty: number; priority: string; notes: string | null; weight_kg: string;
    }>`select id, unit, part_name, length_mm::text, width_mm::text, thickness_mm::text, material, qty, priority, notes, weight_kg::text
       from parts where project_id = ${projectId} and user_id = ${uid}`;
    if (!parts.length) throw new Error("No parts to pack. Import a CSV first.");
    const packed = packParts(parts.map((p): PackPart => ({
      id: p.id, unit: p.unit, part_name: p.part_name,
      length_mm: n(p.length_mm), width_mm: n(p.width_mm), thickness_mm: n(p.thickness_mm),
      material: p.material, qty: p.qty, priority: p.priority, notes: p.notes, weight_kg: n(p.weight_kg),
    })));
    await sql`update parts set box_id = null, status = 'unassigned' where project_id = ${projectId} and user_id = ${uid}`;
    await sql`delete from boxes where project_id = ${projectId} and user_id = ${uid}`;
    for (const b of packed) {
      const row = await sql<{ id: number }>`
        insert into boxes (user_id, project_id, box_number, unit, seq, total_seq, total_weight_kg, status, sticker_status)
        values (${uid}, ${projectId}, ${b.box_number}, ${b.unit}, ${b.seq}, ${b.total_seq}, ${b.total_weight_kg}, 'packed', 'generated')
        returning id`;
      for (const p of b.partIds) {
        await sql`update parts set box_id = ${row[0].id}, status = 'assigned' where id = ${p.id} and user_id = ${uid}`;
      }
    }
    await sql`update projects set status = 'packing', packing_version = packing_version + 1, updated_at = now()
      where id = ${projectId} and user_id = ${uid}`;
    await sql`insert into audit_logs (user_id, project_id, action, detail)
      values (${uid}, ${projectId}, 'packing.run', ${`${packed.length} boxes r${PACK_REV}`})`;
    return { boxes: packed.length, rev: PACK_REV };
  });

export const verifyBox = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { boxId: number; verified: boolean }) => d)
  .handler(async ({ context, data }) => {
    const uid = await requirePerm(context.userId, "packing");
    await (await getSql())`update boxes set verified = ${data.verified}, status = ${data.verified ? "verified" : "packed"}
      where id = ${data.boxId} and user_id = ${uid}`;
    return { ok: true };
  });

export const markReady = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((projectId: number) => projectId)
  .handler(async ({ context, data: projectId }) => {
    const uid = await requirePerm(context.userId, "packing", "dispatch");
    const sql = await getSql();
    await sql`update boxes set status = 'ready', sticker_status = 'printed'
      where project_id = ${projectId} and user_id = ${uid} and status in ('packed','verified')`;
    await sql`update projects set status = 'ready', updated_at = now() where id = ${projectId} and user_id = ${uid}`;
    return { ok: true };
  });

export const createDispatch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { projectId: number; transporter: string; lr_number: string; boxIds: number[] }) => d)
  .handler(async ({ context, data }) => {
    const uid = await requirePerm(context.userId, "dispatch");
    const sql = await getSql();
    if (!data.boxIds.length) throw new Error("Select at least one box");
    await sql`
      insert into dispatches (user_id, project_id, transporter, lr_number, box_ids, box_count, status, dispatched_at)
      values (${uid}, ${data.projectId}, ${data.transporter}, ${data.lr_number}, ${data.boxIds.join(",")}, ${data.boxIds.length}, 'dispatched', now())`;
    for (const id of data.boxIds) {
      await sql`update boxes set status = 'dispatched' where id = ${id} and user_id = ${uid}`;
    }
    const left = await sql<{ c: number }>`select count(*)::int as c from boxes where project_id = ${data.projectId} and user_id = ${uid} and status <> 'dispatched'`;
    if ((left[0]?.c ?? 0) === 0) {
      await sql`update projects set status = 'dispatched', updated_at = now() where id = ${data.projectId} and user_id = ${uid}`;
    }
    const body = `JINNY MOD GO dispatch: ${data.boxIds.length} box(es). LR ${data.lr_number}. Transporter ${data.transporter}.`;
    await sql`
      insert into whatsapp_messages (user_id, project_id, template_name, recipient, body, status)
      values (${uid}, ${data.projectId}, 'Dispatch notification', 'Client + Owner', ${body}, 'queued')`;
    await sql`insert into audit_logs (user_id, project_id, action, detail)
      values (${uid}, ${data.projectId}, 'dispatch.create', ${data.lr_number})`;
    return { ok: true };
  });

export const listBoxes = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const uid = await requireFactory(context.userId);
  return (await getSql())<{
    id: number; box_number: string; unit: string; seq: number; total_seq: number; total_weight_kg: string;
    status: string; verified: boolean; project_id: number; project_code: string; sticker_status: string; client_name: string | null;
  }>`
       select b.id, b.box_number, b.unit, b.seq, b.total_seq, b.total_weight_kg::text, b.status,
             b.verified, b.project_id, p.code as project_code, b.sticker_status, c.name as client_name
       from boxes b join projects p on p.id = b.project_id
       left join clients c on c.id = p.client_id
       where b.user_id = ${uid} order by p.updated_at desc, b.unit, b.seq`;
});

export const listDispatches = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const uid = await requireFactory(context.userId);
  return (await getSql())<{
    id: number; project_id: number; transporter: string; lr_number: string; box_count: number;
    status: string; dispatched_at: string | null; project_code: string;
  }>`select d.id, d.project_id, d.transporter, d.lr_number, d.box_count, d.status, d.dispatched_at::text, p.code as project_code
       from dispatches d join projects p on p.id = d.project_id
       where d.user_id = ${uid} order by d.id desc`;
});

export const listWhatsapp = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const uid = await requireFactory(context.userId);
  return (await getSql())<{ id: number; template_name: string; recipient: string; body: string; status: string; created_at: string }>`
    select id, template_name, recipient, body, status, created_at::text from whatsapp_messages where user_id = ${uid} order by id desc limit 50`;
});

export const sendWhatsapp = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: number) => id)
  .handler(async ({ context, data: id }) => {
    const uid = await requirePerm(context.userId, "whatsapp");
    await (await getSql())`update whatsapp_messages set status = 'sent' where id = ${id} and user_id = ${uid}`;
    return { ok: true };
  });

export const listAudit = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const uid = await requireFactory(context.userId);
  return (await getSql())<{ id: number; action: string; detail: string | null; created_at: string }>`
      select id, action, detail, created_at::text from audit_logs where user_id = ${uid} order by id desc limit 100`;
});

export const findBoxByCode = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((code: string) => code.trim())
  .handler(async ({ context, data: code }) => {
    const uid = await requirePerm(context.userId, "floor", "packing", "dispatch");
    const sql = await getSql();
    const boxes = await sql<{
      id: number; box_number: string; unit: string; total_weight_kg: string; status: string; verified: boolean; project_id: number; project_code: string;
    }>`select b.id, b.box_number, b.unit, b.total_weight_kg::text, b.status, b.verified, b.project_id, p.code as project_code
       from boxes b join projects p on p.id = b.project_id
       where b.user_id = ${uid} and upper(b.box_number) = upper(${code})`;
    if (!boxes[0]) {
      const fuzzy = await sql<{
        id: number; box_number: string; unit: string; total_weight_kg: string; status: string; verified: boolean; project_id: number; project_code: string;
      }>`select b.id, b.box_number, b.unit, b.total_weight_kg::text, b.status, b.verified, b.project_id, p.code as project_code
         from boxes b join projects p on p.id = b.project_id
         where b.user_id = ${uid} and b.box_number ilike ${"%" + code + "%"} limit 5`;
      return { box: fuzzy[0] ?? null, parts: [] as { part_name: string; qty: number; material: string }[] };
    }
    const parts = await sql<{ part_name: string; qty: number; material: string }>`
      select part_name, qty, material from parts where box_id = ${boxes[0].id} and user_id = ${uid}`;
    return { box: boxes[0], parts };
  });

export const setLamMode = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { projectId: number; lam_mode: LamMode }) => d)
  .handler(async ({ context, data }) => {
    const uid = await requirePerm(context.userId, "projects", "packing");
    const sql = await getSql();
    await sql`update projects set lam_mode = ${data.lam_mode}, updated_at = now() where id = ${data.projectId} and user_id = ${uid}`;
    const parts = await sql<{ id: number; length_mm: string; width_mm: string; thickness_mm: string; material: string; qty: number }>`
       select id, length_mm::text, width_mm::text, thickness_mm::text, material, qty
       from parts where project_id = ${data.projectId} and user_id = ${uid}`;
    for (const p of parts) {
      const mat = resolveMaterial(p.material);
      const w = cutPanelKg({
        family: mat.family, boardTh: n(p.thickness_mm), lam: mat.lam, mode: data.lam_mode,
        lengthMm: n(p.length_mm), widthMm: n(p.width_mm), thicknessMm: n(p.thickness_mm), qty: p.qty,
      });
      await sql`update parts set weight_kg = ${w.lineKg}, board_sku = ${w.sku},
        weight_source = ${w.source}, box_id = null, status = 'unassigned'
        where id = ${p.id} and user_id = ${uid}`;
    }
    if (parts.length) {
      await sql`delete from boxes where project_id = ${data.projectId} and user_id = ${uid}`;
      await sql`update projects set status = 'imported', packing_version = packing_version + 1, updated_at = now()
        where id = ${data.projectId} and user_id = ${uid}`;
    }
    await sql`insert into audit_logs (user_id, project_id, action, detail)
      values (${uid}, ${data.projectId}, 'weight.recalc', ${data.lam_mode})`;
    return { ok: true, recalculated: parts.length };
  });

export const removeSubscriber = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: number) => id)
  .handler(async ({ context, data: id }) => {
    await requireOwner(context.userId);
    const sql = await getSql();
    await sql`delete from team_members where subscriber_id = ${id}`;
    if (!(await sql`delete from subscribers where id = ${id} returning id`)[0]) throw new Error("Client not found");
    return { ok: true };
  });

export const getSubscriber = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: number) => id)
  .handler(async ({ context, data: id }) => {
    await requireOwner(context.userId);
    const sql = await getSql();
    const rows = await sql<SubscriberRow & { team_count: number }>`
      select id, company_name, contact_name, email, phone, plan, status, notes, user_id,
             starts_at::text, ends_at::text, created_at::text, updated_at::text, portal_message,
             (select count(*)::int from team_members t where t.subscriber_id = subscribers.id) as team_count
      from subscribers where id = ${id}`;
    if (!rows[0]) throw new Error("Client not found");
    const members = await sql<TeamMemberRow>`
      select id, subscriber_id, name, email, department, phone, user_id, created_at::text
      from team_members where subscriber_id = ${id} order by department, name`;
    return { client: rows[0], members };
  });

export const createPortalWorker = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { subscriberId: number; name: string; email: string; password: string; department: string; phone?: string }) => d)
  .handler(async ({ context, data }) => {
    await requireOwner(context.userId);
    const name = data.name.trim();
    const email = data.email.trim().toLowerCase();
    const department = data.department.trim();
    if (!name) throw new Error("Worker name is required");
    if (!email || !email.includes("@")) throw new Error("A valid worker email is required");
    if (data.password.length < 8) throw new Error("Password must be at least 8 characters");
    if (!isDepartment(department)) throw new Error("Pick a department");
    if (isPlatformAdminEmail(email)) throw new Error("Cannot add the platform owner as a worker");
    const sql = await getSql();
    const factory = await sql<{ id: number; email: string; user_id: string | null; company_name: string; contact_name: string | null }>`
      select id, email, user_id, company_name, contact_name from subscribers where id = ${data.subscriberId}`;
    if (!factory[0]) throw new Error("Client not found");
    if (factory[0].email.toLowerCase() === email) throw new Error("Factory admin already uses this email");
    if ((await sql<{ id: number }>`select id from subscribers where lower(email) = ${email} limit 1`)[0]) {
      throw new Error("That email is already a factory client");
    }
    const existing = await sql<{ id: number; subscriber_id: number }>`select id, subscriber_id from team_members where lower(email) = ${email} limit 1`;
    if (existing[0] && existing[0].subscriber_id !== data.subscriberId) throw new Error("That email is already on another factory team");
    const { upsertCredentialUser, ensureUser } = await import("@/lib/accounts.server");
    let factoryUserId = factory[0].user_id;
    if (!factoryUserId) {
      factoryUserId = await ensureUser({ name: factory[0].contact_name?.trim() || factory[0].company_name, email: factory[0].email });
      await sql`update subscribers set user_id = ${factoryUserId}, updated_at = now() where id = ${data.subscriberId}`;
    }
    const userId = await upsertCredentialUser({ name, email, password: data.password });
    await ensureWorkspace(factoryUserId, factory[0].contact_name);
    if (existing[0]) {
      await sql`update team_members set name = ${name}, department = ${department}, phone = ${data.phone?.trim() || null}, user_id = ${userId}, updated_at = now() where id = ${existing[0].id}`;
      return { id: existing[0].id, created: false };
    }
    const rows = await sql<{ id: number }>`
      insert into team_members (subscriber_id, name, email, department, phone, user_id)
      values (${data.subscriberId}, ${name}, ${email}, ${department}, ${data.phone?.trim() || null}, ${userId}) returning id`;
    return { id: rows[0].id, created: true };
  });

export const resetPortalWorkerPassword = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { memberId: number; subscriberId: number; password: string }) => d)
  .handler(async ({ context, data }) => {
    await requireOwner(context.userId);
    if (data.password.length < 8) throw new Error("Password must be at least 8 characters");
    const sql = await getSql();
    const member = await sql<{ id: number; name: string; email: string }>`
      select id, name, email from team_members where id = ${data.memberId} and subscriber_id = ${data.subscriberId}`;
    if (!member[0]) throw new Error("Worker not found");
    const { upsertCredentialUser } = await import("@/lib/accounts.server");
    const userId = await upsertCredentialUser({ name: member[0].name, email: member[0].email, password: data.password });
    await sql`update team_members set user_id = ${userId}, updated_at = now() where id = ${member[0].id}`;
    return { ok: true };
  });

export const setClientLogin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { subscriberId: number; password: string }) => d)
  .handler(async ({ context, data }) => {
    await requireOwner(context.userId);
    if (data.password.length < 8) throw new Error("Password must be at least 8 characters");
    const sql = await getSql();
    const factory = await sql<{ id: number; email: string; company_name: string; contact_name: string | null }>`
      select id, email, company_name, contact_name from subscribers where id = ${data.subscriberId}`;
    if (!factory[0]) throw new Error("Client not found");
    const { upsertCredentialUser } = await import("@/lib/accounts.server");
    const userId = await upsertCredentialUser({
      name: factory[0].contact_name?.trim() || factory[0].company_name, email: factory[0].email, password: data.password,
    });
    await sql`update subscribers set user_id = ${userId}, updated_at = now() where id = ${factory[0].id}`;
    await ensureWorkspace(userId, factory[0].contact_name);
    return { ok: true };
  });

export const removePortalWorker = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { memberId: number; subscriberId: number }) => d)
  .handler(async ({ context, data }) => {
    await requireOwner(context.userId);
    if (!(await (await getSql())`delete from team_members where id = ${data.memberId} and subscriber_id = ${data.subscriberId} returning id`)[0]) {
      throw new Error("Worker not found");
    }
    return { ok: true };
  });

export const listTeam = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const access = await resolveAccess(context.userId);
  if (!access.canFactory) throw new Error(factoryBlockMessage(access.status, access.role, access.portal_message, access.ends_at));
  if (!access.subscriberId) return { members: [] as TeamMemberRow[], access };
  return {
    members: await (await getSql())<TeamMemberRow>`
      select id, subscriber_id, name, email, department, phone, user_id, created_at::text
      from team_members where subscriber_id = ${access.subscriberId} order by department, name`,
    access,
  };
});

export const saveTeamMember = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { id?: number; name: string; email: string; department: string; phone?: string }) => d)
  .handler(async ({ context, data }) => {
    const access = await resolveAccess(context.userId);
    if (!access.canManageTeam || !access.subscriberId) throw new Error("Only the factory admin can add workers");
    const name = data.name.trim();
    const email = data.email.trim().toLowerCase();
    const department = data.department.trim();
    if (!name) throw new Error("Worker name is required");
    if (!email || !email.includes("@")) throw new Error("A valid worker email is required");
    if (!isDepartment(department)) throw new Error("Pick a department");
    if (isPlatformAdminEmail(email)) throw new Error("Cannot add the platform owner as a worker");
    if (email === access.email.toLowerCase()) throw new Error("Factory admin is already on this account");
    const sql = await getSql();
    if ((await sql<{ id: number }>`select id from subscribers where lower(email) = ${email} limit 1`)[0]) {
      throw new Error("That email is already a factory client. Use a worker email.");
    }
    const existing = await sql<{ id: number; subscriber_id: number }>`select id, subscriber_id from team_members where lower(email) = ${email} limit 1`;
    if (existing[0] && existing[0].id !== data.id) {
      throw new Error(existing[0].subscriber_id === access.subscriberId ? "That worker is already on this team" : "That email is already on another factory team");
    }
    const linkedId = (await sql<{ id: string }>`select id from "user" where lower(email) = ${email} limit 1`)[0]?.id ?? null;
    if (data.id) {
      if (!(await sql`select id from team_members where id = ${data.id} and subscriber_id = ${access.subscriberId}`)[0]) throw new Error("Worker not found");
      await sql`update team_members set name = ${name}, email = ${email}, department = ${department},
          phone = ${data.phone?.trim() || null}, user_id = coalesce(${linkedId}, user_id), updated_at = now()
        where id = ${data.id}`;
      return { id: data.id };
    }
    const rows = await sql<{ id: number }>`
      insert into team_members (subscriber_id, name, email, department, phone, user_id)
      values (${access.subscriberId}, ${name}, ${email}, ${department}, ${data.phone?.trim() || null}, ${linkedId}) returning id`;
    return { id: rows[0].id };
  });

export const removeTeamMember = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: number) => id)
  .handler(async ({ context, data: id }) => {
    const access = await resolveAccess(context.userId);
    if (!access.canManageTeam || !access.subscriberId) throw new Error("Only the factory admin can remove workers");
    if (!(await (await getSql())`delete from team_members where id = ${id} and subscriber_id = ${access.subscriberId} returning id`)[0]) {
      throw new Error("Worker not found");
    }
    return { ok: true };
  });
