import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { isPlatformAdminEmail } from "@/lib/platform";

const FAIL_LIMIT = 5;
const WINDOW_MIN = 15;

async function failCount(email: string) {
  const sql = await getSql();
  const rows = await sql<{ c: number }>`
    select count(*)::int as c from login_guard
    where lower(email) = ${email} and ok = false
      and created_at > now() - interval '15 minutes'`;
  return rows[0]?.c ?? 0;
}

export const checkLoginAllowed = createServerFn({ method: "POST" })
  .validator((d: { email: string }) => d)
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    if (!email.includes("@")) return { ok: true as const };
    const n = await failCount(email);
    if (n >= FAIL_LIMIT) {
      return {
        ok: false as const,
        message: `Too many failed sign-ins. Wait ${WINDOW_MIN} minutes, then try again.`,
      };
    }
    return { ok: true as const, remaining: FAIL_LIMIT - n };
  });

export const recordLoginFail = createServerFn({ method: "POST" })
  .validator((d: { email: string }) => d)
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    if (!email.includes("@")) return { ok: true };
    const sql = await getSql();
    await sql`insert into login_guard (email, ok) values (${email}, false)`;
    const n = await failCount(email);
    if (n >= FAIL_LIMIT) {
      return { ok: false as const, locked: true, message: `Too many failed sign-ins. Wait ${WINDOW_MIN} minutes.` };
    }
    return { ok: true as const, remaining: FAIL_LIMIT - n };
  });

export const recordLoginOk = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const users = await sql<{ email: string | null }>`select email from "user" where id = ${context.userId} limit 1`;
    const email = (users[0]?.email ?? "").trim().toLowerCase();
    if (!email) return { ok: true };
    await sql`insert into login_guard (email, ok) values (${email}, true)`;
    await sql`delete from login_guard where lower(email) = ${email} and ok = false`;
    return { ok: true };
  });

export const getSecurityOverview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const users = await sql<{ email: string | null }>`select email from "user" where id = ${context.userId} limit 1`;
    if (!isPlatformAdminEmail(users[0]?.email)) throw new Error("Owner portal only");
    const recent = await sql<{ id: number; email: string; ok: boolean; created_at: string }>`
      select id, email, ok, created_at::text from login_guard order by id desc limit 40`;
    const locked = await sql<{ email: string; fails: number }>`
      select lower(email) as email, count(*)::int as fails
      from login_guard
      where ok = false and created_at > now() - interval '15 minutes'
      group by lower(email)
      having count(*) >= ${FAIL_LIMIT}
      order by fails desc`;
    return {
      failLimit: FAIL_LIMIT,
      windowMin: WINDOW_MIN,
      locked,
      recent,
      controls: [
        { id: "signup", on: true, label: "Public signup closed" },
        { id: "issued", on: true, label: "Owner-issued logins only" },
        { id: "rbac", on: true, label: "Role-based access (department)" },
        { id: "rls", on: true, label: "Postgres row-level security" },
        { id: "suspend", on: true, label: "Suspend locks client + team" },
        { id: "lockout", on: true, label: `${FAIL_LIMIT} failed logins → ${WINDOW_MIN} min lock` },
        { id: "headers", on: true, label: "Security headers (nosniff, referrer, permissions)" },
        { id: "sql", on: true, label: "Parameterized SQL" },
      ],
    };
  });
