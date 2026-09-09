-- Brute-force guard. Not tenant data — no RLS (checked before a session exists).

create table if not exists login_guard (
  id serial primary key,
  email text not null,
  ok boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists login_guard_email_time_idx on login_guard (lower(email), created_at desc);
