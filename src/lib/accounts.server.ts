import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { getSql } from "@/lib/db";

/** Create the Better Auth user row if missing. Does not set a password. Server-only. */
export async function ensureUser(opts: { name: string; email: string }): Promise<string> {
  const sql = await getSql();
  const email = opts.email.trim().toLowerCase();
  const existing = await sql.query<{ id: string }>(
    `select id from "user" where lower(email) = $1 limit 1`,
    [email],
  );
  if (existing[0]?.id) return existing[0].id;
  const userId = randomUUID();
  await sql.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ($1, $2, $3, true, now(), now())`,
    [userId, opts.name, email],
  );
  return userId;
}

/** Create or reset a local email/password login. Server-only. */
export async function upsertCredentialUser(opts: {
  name: string;
  email: string;
  password: string;
}): Promise<string> {
  const sql = await getSql();
  const email = opts.email.trim().toLowerCase();
  const userId = await ensureUser({ name: opts.name, email });
  await sql.query(`update "user" set name = $1, "emailVerified" = true, "updatedAt" = now() where id = $2`, [
    opts.name,
    userId,
  ]);
  const hash = await hashPassword(opts.password);
  const acc = await sql.query<{ id: string }>(
    `select id from account where "userId" = $1 and "providerId" = 'credential' limit 1`,
    [userId],
  );
  if (!acc[0]) {
    await sql.query(
      `insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
       values ($1, $2, 'credential', $3, $4, now(), now())`,
      [randomUUID(), userId, userId, hash],
    );
  } else {
    await sql.query(`update account set password = $1, "updatedAt" = now() where id = $2`, [hash, acc[0].id]);
  }
  return userId;
}
