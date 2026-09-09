-- Factory worker team (per paying subscriber). Cascade when a client is removed.

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
);

create unique index if not exists team_members_email_lower_idx on team_members (lower(email));
create index if not exists team_members_subscriber_idx on team_members (subscriber_id);
