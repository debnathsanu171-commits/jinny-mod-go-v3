-- Work-order sub-projects under a main factory job.

create table if not exists sub_projects (
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
);
create index if not exists sub_projects_project_idx on sub_projects (project_id);
create index if not exists sub_projects_user_idx on sub_projects (user_id);

alter table parts add column if not exists sub_project_id int references sub_projects(id) on delete set null;

alter table sub_projects enable row level security;
alter table sub_projects force row level security;
drop policy if exists tenant_iso on sub_projects;
create policy tenant_iso on sub_projects for all
  using (user_id = app_workspace_id())
  with check (user_id = app_workspace_id());
