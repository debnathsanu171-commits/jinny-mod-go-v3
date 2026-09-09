import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { getSql } from "@/lib/db";
import { PLATFORM_ADMIN_EMAIL } from "@/lib/platform";

const PLATFORM_ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD ?? "changeme-on-first-login";
const PLATFORM_ADMIN_NAME = "Debnath";

if (!process.env.INITIAL_ADMIN_PASSWORD) {
  console.warn(
    "[security] INITIAL_ADMIN_PASSWORD env var is not set. " +
    "Using a fallback password — set the env var for production security.",
  );
}

export async function seedPlatformAdmin(): Promise<void> {
  const sql = await getSql();

  await sql.query(`
    create table if not exists subscribers (
      id serial primary key,
      company_name text not null,
      contact_name text,
      email text not null,
      phone text,
      plan text not null default 'monthly',
      status text not null default 'pending',
      notes text,
      user_id text,
      starts_at timestamptz,
      ends_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await sql.query(`create unique index if not exists subscribers_email_lower_idx on subscribers (lower(email))`);
  await sql.query(`create index if not exists subscribers_status_idx on subscribers (status)`);
  await sql.query(`alter table subscribers add column if not exists portal_message text`);

  await sql.query(`
    create table if not exists team_members (
      id serial primary key,
      subscriber_id int not null references subscribers(id) on delete cascade,
      name text not null,
      email text not null,
      department text not null,
      phone text,
      user_id text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await sql.query(`create unique index if not exists team_members_email_lower_idx on team_members (lower(email))`);
  await sql.query(`create index if not exists team_members_subscriber_idx on team_members (subscriber_id)`);

  const email = PLATFORM_ADMIN_EMAIL.toLowerCase();
  const existing = await sql.query<{ id: string }>(
    `select id from "user" where lower(email) = $1 limit 1`,
    [email],
  );
  let userId = existing[0]?.id;
  if (!userId) {
    userId = randomUUID();
    await sql.query(
      `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       values ($1, $2, $3, true, now(), now())`,
      [userId, PLATFORM_ADMIN_NAME, email],
    );
  }
  const acc = await sql.query<{ id: string }>(
    `select id from account where "userId" = $1 and "providerId" = 'credential' limit 1`,
    [userId],
  );
  if (acc[0]) return;
  const hash = await hashPassword(PLATFORM_ADMIN_PASSWORD);
  await sql.query(
    `insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
     values ($1, $2, 'credential', $3, $4, now(), now())`,
    [randomUUID(), userId, userId, hash],
  );
}
