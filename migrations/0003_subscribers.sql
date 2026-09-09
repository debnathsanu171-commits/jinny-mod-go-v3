-- SaaS subscribers (factories buying Modular Pro). Not furniture job clients.

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
);

create unique index if not exists subscribers_email_lower_idx on subscribers (lower(email));
create index if not exists subscribers_status_idx on subscribers (status);
