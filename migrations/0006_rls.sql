-- Row Level Security: factory rows never leak across workspaces.
-- Session GUCs (transaction-local): app.workspace_id, app.is_owner, app.login_user_id, app.login_email, app.rls
-- Bound from the app on every request. Missing workspace_id => zero factory rows (fail-closed).

create or replace function app_workspace_id() returns text
language sql stable as $$
  select nullif(current_setting('app.workspace_id', true), '')
$$;

create or replace function app_is_owner() returns boolean
language sql stable as $$
  select current_setting('app.is_owner', true) = '1'
$$;

create or replace function app_login_user_id() returns text
language sql stable as $$
  select nullif(current_setting('app.login_user_id', true), '')
$$;

create or replace function app_login_email() returns text
language sql stable as $$
  select lower(nullif(current_setting('app.login_email', true), ''))
$$;

create or replace function app_rls_on() returns boolean
language sql stable as $$
  select current_setting('app.rls', true) = 'on'
$$;

-- Factory tenant tables: only the bound workspace. Owner does not bypass packing data.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'clients', 'projects', 'materials', 'parts', 'boxes',
    'dispatches', 'whatsapp_messages', 'audit_logs', 'csv_imports'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists tenant_iso on %I', t);
    execute format(
      'create policy tenant_iso on %I for all
         using (user_id = app_workspace_id())
         with check (user_id = app_workspace_id())',
      t
    );
  end loop;
end $$;

-- Platform subscribers: owner sees all; a login sees only its own factory row.
-- When RLS is not armed (migrations / seed), allow.
alter table subscribers enable row level security;
alter table subscribers force row level security;
drop policy if exists subscriber_iso on subscribers;
create policy subscriber_iso on subscribers for all
  using (
    not app_rls_on()
    or app_is_owner()
    or user_id = app_workspace_id()
    or user_id = app_login_user_id()
    or lower(email) = app_login_email()
  )
  with check (
    not app_rls_on()
    or app_is_owner()
    or user_id = app_workspace_id()
    or user_id = app_login_user_id()
    or lower(email) = app_login_email()
  );

alter table team_members enable row level security;
alter table team_members force row level security;
drop policy if exists team_iso on team_members;
create policy team_iso on team_members for all
  using (
    not app_rls_on()
    or app_is_owner()
    or user_id = app_login_user_id()
    or lower(email) = app_login_email()
    or subscriber_id in (
      select id from subscribers
      where user_id = app_workspace_id()
         or user_id = app_login_user_id()
         or lower(email) = app_login_email()
    )
  )
  with check (
    not app_rls_on()
    or app_is_owner()
    or subscriber_id in (
      select id from subscribers
      where user_id = app_workspace_id()
         or user_id = app_login_user_id()
         or app_is_owner()
    )
  );
