-- Modular Pro factory schema (per-user workspace)

create table if not exists profiles (
  user_id text primary key,
  display_name text,
  role text not null default 'admin',
  bootstrapped boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists clients (
  id serial primary key,
  user_id text not null,
  name text not null,
  billing_address text,
  delivery_address text,
  contact_person text,
  phone text,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clients_user_id_idx on clients (user_id);

create table if not exists projects (
  id serial primary key,
  user_id text not null,
  client_id int references clients(id) on delete set null,
  code text not null,
  name text not null,
  status text not null default 'draft',
  po_number text,
  lam_mode text not null default 'prelam',
  notes text,
  packing_version int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_user_id_idx on projects (user_id);

create table if not exists materials (
  id serial primary key,
  user_id text not null,
  short_name text not null,
  full_name text not null,
  family text not null,
  lam text not null default 'BSL',
  thickness_mm numeric,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists materials_user_short_idx on materials (user_id, short_name);

create table if not exists parts (
  id serial primary key,
  user_id text not null,
  project_id int not null references projects(id) on delete cascade,
  unit text not null,
  part_name text not null,
  length_mm numeric not null,
  width_mm numeric not null,
  thickness_mm numeric not null,
  material text not null,
  qty int not null,
  priority text not null default 'Normal',
  notes text,
  weight_kg numeric not null default 0,
  board_sku text,
  weight_source text,
  box_id int,
  status text not null default 'unassigned'
);
create index if not exists parts_project_idx on parts (project_id);

create table if not exists boxes (
  id serial primary key,
  user_id text not null,
  project_id int not null references projects(id) on delete cascade,
  box_number text not null,
  unit text not null,
  seq int not null,
  total_seq int not null,
  total_weight_kg numeric not null default 0,
  status text not null default 'packed',
  sticker_status text not null default 'not_generated',
  verified boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists boxes_project_idx on boxes (project_id);

create table if not exists dispatches (
  id serial primary key,
  user_id text not null,
  project_id int not null references projects(id) on delete cascade,
  transporter text,
  lr_number text,
  box_ids text not null default '',
  box_count int not null default 0,
  status text not null default 'ready',
  dispatched_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists whatsapp_messages (
  id serial primary key,
  user_id text not null,
  project_id int,
  template_name text not null,
  recipient text not null,
  body text not null,
  status text not null default 'queued',
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id serial primary key,
  user_id text not null,
  project_id int,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists audit_user_idx on audit_logs (user_id, created_at desc);

create table if not exists csv_imports (
  id serial primary key,
  user_id text not null,
  project_id int not null references projects(id) on delete cascade,
  file_name text not null,
  total_rows int not null default 0,
  ok_rows int not null default 0,
  error_rows int not null default 0,
  summary text,
  created_at timestamptz not null default now()
);
