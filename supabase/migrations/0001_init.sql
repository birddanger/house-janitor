-- House Janitor: initial schema
-- Access model: everything hangs off a property; access is granted per property
-- via property_members (owner / editor / viewer). RLS enforces it everywhere.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type member_role as enum ('owner', 'editor', 'viewer');
create type property_type as enum ('house', 'rowhouse', 'apartment', 'cottage', 'other');
create type recurrence_type as enum ('none', 'interval', 'yearly');
create type interval_unit as enum ('day', 'week', 'month', 'year');
create type task_priority as enum ('low', 'normal', 'high');
create type work_kind as enum ('maintenance', 'repair', 'renovation');

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text,
  locale       text not null default 'en' check (locale in ('en', 'fi', 'sv')),
  created_at   timestamptz not null default now()
);

create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Properties & membership
-- ---------------------------------------------------------------------------
create table properties (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  address       text,
  type          property_type not null default 'house',
  year_built    int check (year_built between 1600 and 2100),
  size_m2       numeric(8, 1),
  heating_type  text,
  currency      char(3) not null default 'EUR' check (currency in ('EUR', 'SEK', 'NOK', 'DKK', 'ISK')),
  purchase_date date,
  archived_at   timestamptz,
  created_by    uuid not null default auth.uid() references profiles (id),
  created_at    timestamptz not null default now()
);

create table property_members (
  property_id uuid not null references properties (id) on delete cascade,
  user_id     uuid not null references profiles (id) on delete cascade,
  role        member_role not null,
  notify      boolean not null default true,
  created_at  timestamptz not null default now(),
  primary key (property_id, user_id)
);
create index on property_members (user_id);

-- Creator becomes owner automatically
create function add_creator_as_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into property_members (property_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end $$;

create trigger on_property_created
  after insert on properties
  for each row execute function add_creator_as_owner();

-- A property must always keep at least one owner
create function ensure_owner_remains() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from properties where id = old.property_id)
     and not exists (
       select 1 from property_members
       where property_id = old.property_id and role = 'owner' and user_id <> old.user_id
     ) then
    raise exception 'A property must have at least one owner';
  end if;
  return coalesce(new, old);
end $$;

create trigger keep_one_owner
  before update or delete on property_members
  for each row execute function ensure_owner_remains();

-- Access helpers (security definer => no RLS recursion)
create function is_member(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from property_members where property_id = pid and user_id = auth.uid());
$$;

create function can_edit(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from property_members
    where property_id = pid and user_id = auth.uid() and role in ('owner', 'editor')
  );
$$;

create function is_owner(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from property_members
    where property_id = pid and user_id = auth.uid() and role = 'owner'
  );
$$;

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------
create table invitations (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties (id) on delete cascade,
  email       text not null,
  role        member_role not null default 'editor' check (role <> 'owner'),
  token       text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by  uuid not null default auth.uid() references profiles (id),
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);

create function accept_invitation(invite_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv invitations;
begin
  select * into inv from invitations
  where token = invite_token and accepted_at is null and expires_at > now();
  if inv is null then
    raise exception 'Invitation is invalid or expired';
  end if;
  if lower(inv.email) <> lower(auth.jwt() ->> 'email') then
    raise exception 'Invitation was sent to a different email address';
  end if;

  insert into property_members (property_id, user_id, role)
  values (inv.property_id, auth.uid(), inv.role)
  on conflict (property_id, user_id) do nothing;

  update invitations set accepted_at = now() where id = inv.id;
  insert into activity_log (property_id, actor_id, action, entity, entity_id)
  values (inv.property_id, auth.uid(), 'joined', 'member', auth.uid());
  return inv.property_id;
end $$;

-- ---------------------------------------------------------------------------
-- Components, contractors, tasks, log, attachments, budgets, activity
-- ---------------------------------------------------------------------------
create table components (
  id                      uuid primary key default gen_random_uuid(),
  property_id             uuid not null references properties (id) on delete cascade,
  name                    text not null,
  category                text not null default 'general',
  installed_on            date,
  expected_lifespan_years int check (expected_lifespan_years > 0),
  brand                   text,
  model                   text,
  warranty_until          date,
  notes                   text,
  created_at              timestamptz not null default now()
);
create index on components (property_id);

create table contractors (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references profiles (id) on delete cascade,
  name       text not null,
  trade      text,
  phone      text,
  email      text,
  notes      text,
  created_at timestamptz not null default now()
);

create table tasks (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references properties (id) on delete cascade,
  component_id    uuid references components (id) on delete set null,
  title           text not null,
  description     text,
  recurrence      recurrence_type not null default 'none',
  interval_unit   interval_unit,
  interval_count  int check (interval_count > 0),
  next_due_on     date,
  estimated_cost  numeric(12, 2),
  priority        task_priority not null default 'normal',
  assigned_to     uuid references profiles (id) on delete set null,
  active          boolean not null default true,
  created_by      uuid not null default auth.uid() references profiles (id),
  created_at      timestamptz not null default now(),
  check (recurrence = 'none' or (interval_unit is not null and interval_count is not null))
);
create index on tasks (property_id, next_due_on) where active;

create table maintenance_logs (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references properties (id) on delete cascade,
  task_id       uuid references tasks (id) on delete set null,
  component_id  uuid references components (id) on delete set null,
  contractor_id uuid references contractors (id) on delete set null,
  performed_on  date not null default current_date,
  title         text not null,
  description   text,
  kind          work_kind not null default 'maintenance',
  category      text not null default 'general',
  cost          numeric(12, 2) not null default 0,
  labour_cost   numeric(12, 2) not null default 0 check (labour_cost <= cost), -- for kotitalousvähennys / ROT
  created_by    uuid not null default auth.uid() references profiles (id),
  created_at    timestamptz not null default now()
);
create index on maintenance_logs (property_id, performed_on desc);

create table attachments (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references properties (id) on delete cascade,
  log_id       uuid references maintenance_logs (id) on delete cascade,
  storage_path text not null, -- "<property_id>/<uuid>-<file name>" in bucket "attachments"
  file_name    text not null,
  mime_type    text,
  created_by   uuid not null default auth.uid() references profiles (id),
  created_at   timestamptz not null default now()
);

create table budgets (
  property_id uuid not null references properties (id) on delete cascade,
  year        int not null,
  amount      numeric(12, 2) not null,
  primary key (property_id, year)
);

create table activity_log (
  id          bigint generated always as identity primary key,
  property_id uuid not null references properties (id) on delete cascade,
  actor_id    uuid references profiles (id) on delete set null,
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  created_at  timestamptz not null default now()
);
create index on activity_log (property_id, created_at desc);

-- Complete a task: writes a log entry and rolls the next due date forward.
create function complete_task(
  p_task_id uuid,
  p_performed_on date default current_date,
  p_cost numeric default 0,
  p_labour_cost numeric default 0,
  p_notes text default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  t tasks;
  log_id uuid;
begin
  select * into t from tasks where id = p_task_id;
  if t is null then raise exception 'Task not found'; end if;

  insert into maintenance_logs (property_id, task_id, component_id, performed_on, title, description, cost, labour_cost)
  values (t.property_id, t.id, t.component_id, p_performed_on, t.title, p_notes, p_cost, p_labour_cost)
  returning id into log_id;

  if t.recurrence = 'none' then
    update tasks set active = false where id = t.id;
  else
    update tasks
    set next_due_on = p_performed_on + (t.interval_count || ' ' || t.interval_unit)::interval
    where id = t.id;
  end if;
  return log_id;
end $$;

-- Generic activity trigger
create function log_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec record := coalesce(new, old);
begin
  -- Skip when the parent property is being deleted (cascade), or the FK would fail.
  if tg_op = 'DELETE' and not exists (select 1 from properties where id = old.property_id) then
    return old;
  end if;
  insert into activity_log (property_id, actor_id, action, entity, entity_id)
  values (rec.property_id, auth.uid(), lower(tg_op), tg_argv[0], rec.id);
  return rec;
end $$;

create trigger tasks_activity after insert or update or delete on tasks
  for each row execute function log_activity('task');
create trigger logs_activity after insert or update or delete on maintenance_logs
  for each row execute function log_activity('log');
create trigger components_activity after insert or update or delete on components
  for each row execute function log_activity('component');

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table profiles         enable row level security;
alter table properties       enable row level security;
alter table property_members enable row level security;
alter table invitations      enable row level security;
alter table components       enable row level security;
alter table contractors      enable row level security;
alter table tasks            enable row level security;
alter table maintenance_logs enable row level security;
alter table attachments      enable row level security;
alter table budgets          enable row level security;
alter table activity_log     enable row level security;

-- Profiles: yourself, plus people you share a property with
create policy "profiles read" on profiles for select using (
  id = auth.uid() or exists (
    select 1 from property_members a
    join property_members b on a.property_id = b.property_id
    where a.user_id = auth.uid() and b.user_id = profiles.id
  )
);
create policy "profiles update self" on profiles for update using (id = auth.uid());

-- Properties
create policy "properties read"   on properties for select using (is_member(id));
create policy "properties insert" on properties for insert with check (created_by = auth.uid());
create policy "properties update" on properties for update using (can_edit(id));
create policy "properties delete" on properties for delete using (is_owner(id));

-- Members: all members can see; owners manage; anyone may leave
create policy "members read"   on property_members for select using (is_member(property_id));
create policy "members update" on property_members for update using (is_owner(property_id));
create policy "members delete" on property_members for delete using (is_owner(property_id) or user_id = auth.uid());
-- (inserts happen only via triggers / accept_invitation)

-- Invitations: owners manage
create policy "invitations owner" on invitations for all
  using (is_owner(property_id)) with check (is_owner(property_id));

-- Property-scoped data: members read, editors/owners write
do $$
declare t text;
begin
  foreach t in array array['components', 'tasks', 'maintenance_logs', 'attachments', 'budgets'] loop
    execute format('create policy "%1$s read"  on %1$I for select using (is_member(property_id))', t);
    execute format('create policy "%1$s write" on %1$I for insert with check (can_edit(property_id))', t);
    execute format('create policy "%1$s update" on %1$I for update using (can_edit(property_id))', t);
    execute format('create policy "%1$s delete" on %1$I for delete using (can_edit(property_id))', t);
  end loop;
end $$;

create policy "activity read" on activity_log for select using (is_member(property_id));

-- Contractors: personal, but visible to co-members if used on a shared property
create policy "contractors own" on contractors for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "contractors shared read" on contractors for select using (
  exists (select 1 from maintenance_logs l where l.contractor_id = contractors.id and is_member(l.property_id))
);

-- ---------------------------------------------------------------------------
-- Storage: bucket "attachments", objects stored under "<property_id>/..."
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false)
on conflict (id) do nothing;

create policy "attachments read" on storage.objects for select
  using (bucket_id = 'attachments' and is_member(((storage.foldername(name))[1])::uuid));
create policy "attachments write" on storage.objects for insert
  with check (bucket_id = 'attachments' and can_edit(((storage.foldername(name))[1])::uuid));
create policy "attachments delete" on storage.objects for delete
  using (bucket_id = 'attachments' and can_edit(((storage.foldername(name))[1])::uuid));
