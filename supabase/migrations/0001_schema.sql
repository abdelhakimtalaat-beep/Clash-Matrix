-- BIM Clash Matrix: Supabase schema. Run once in the SQL editor (or `supabase db push`).
-- Model: every project is a set of small JSON "entities" (search set, clash test, code mapping, ...),
-- each with a version number for optimistic concurrency. Realtime streams entity changes to all members.

create extension if not exists pgcrypto;

-- ---------- tables ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('viewer','editor','admin')),
  added_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.entities (
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('meta','naming','tolerances','matrix','dialect','profile','codeMapping','searchSet','clashTest')),
  id text not null,
  data jsonb not null,
  version integer not null default 1,
  deleted boolean not null default false,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (project_id, kind, id)
);
create index entities_project_updated on public.entities (project_id, updated_at);

create table public.audit_log (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  at timestamptz not null default now(),
  by_user uuid,
  action text not null,           -- insert | update | delete | restore
  kind text not null,
  entity_id text not null,
  old_data jsonb,
  new_data jsonb
);
create index audit_project_at on public.audit_log (project_id, at desc);

create table public.snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  label text not null,
  data jsonb not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------- helpers (security definer so RLS policies can consult membership without recursion) ----------
create function public.role_in(p uuid) returns text
language sql stable security definer set search_path = public as
$$ select role from public.project_members where project_id = p and user_id = auth.uid() $$;

create function public.is_member(p uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.project_members where project_id = p and user_id = auth.uid()) $$;
create function public.can_edit(p uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.project_members where project_id = p and user_id = auth.uid() and role in ('editor','admin')) $$;
create function public.is_admin(p uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.project_members where project_id = p and user_id = auth.uid() and role = 'admin') $$;

-- ---------- row level security ----------
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.entities enable row level security;
alter table public.audit_log enable row level security;
alter table public.snapshots enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (
  id = auth.uid() or exists (select 1 from public.project_members a join public.project_members b on a.project_id = b.project_id
                             where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy projects_read on public.projects for select to authenticated using (public.is_member(id));
create policy projects_update on public.projects for update to authenticated using (public.is_admin(id)) with check (public.is_admin(id));
create policy projects_delete on public.projects for delete to authenticated using (public.is_admin(id));
-- inserts happen only through create_project()

create policy members_read on public.project_members for select to authenticated using (public.is_member(project_id));
-- member changes happen only through the RPCs below

create policy entities_read on public.entities for select to authenticated using (public.is_member(project_id));
create policy entities_insert on public.entities for insert to authenticated with check (public.can_edit(project_id));
create policy entities_update on public.entities for update to authenticated using (public.can_edit(project_id)) with check (public.can_edit(project_id));
-- no delete policy: entities are soft-deleted (deleted = true) so that realtime and audit see the change

create policy audit_read on public.audit_log for select to authenticated using (public.is_member(project_id));
-- audit rows are written only by the trigger

create policy snapshots_read on public.snapshots for select to authenticated using (public.is_member(project_id));
create policy snapshots_insert on public.snapshots for insert to authenticated with check (public.can_edit(project_id));
create policy snapshots_delete on public.snapshots for delete to authenticated using (public.is_admin(project_id));

-- ---------- audit trigger ----------
create function public.audit_entities() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log(project_id, by_user, action, kind, entity_id, new_data)
    values (new.project_id, auth.uid(), 'insert', new.kind, new.id, new.data);
  elsif tg_op = 'UPDATE' then
    insert into public.audit_log(project_id, by_user, action, kind, entity_id, old_data, new_data)
    values (new.project_id, auth.uid(),
            case when new.deleted and not old.deleted then 'delete' when old.deleted and not new.deleted then 'restore' else 'update' end,
            new.kind, new.id, old.data, new.data);
  end if;
  return new;
end $$;
create trigger entities_audit after insert or update on public.entities for each row execute function public.audit_entities();

-- ---------- profile on signup ----------
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, email, display_name) values (new.id, new.email, split_part(new.email, '@', 1));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- RPCs ----------
create function public.create_project(p_name text) returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  insert into public.projects(name, created_by) values (p_name, auth.uid()) returning id into pid;
  insert into public.project_members(project_id, user_id, role) values (pid, auth.uid(), 'admin');
  return pid;
end $$;

-- Optimistic save. p_expected = the version the client last saw (0 = it believes the entity does not exist).
-- Returns the new version, or raises 'conflict' (SQLSTATE 40001) when someone else saved in between.
create function public.save_entity(p_project uuid, p_kind text, p_id text, p_data jsonb, p_expected integer, p_deleted boolean default false)
returns integer language plpgsql set search_path = public as $$
declare v integer;
begin
  if not public.can_edit(p_project) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_expected = 0 then
    begin
      insert into public.entities(project_id, kind, id, data, version, deleted) values (p_project, p_kind, p_id, p_data, 1, p_deleted) returning version into v;
      return v;
    exception when unique_violation then
      raise exception 'conflict' using errcode = '40001';
    end;
  end if;
  update public.entities set data = p_data, deleted = p_deleted, version = version + 1, updated_by = auth.uid(), updated_at = now()
   where project_id = p_project and kind = p_kind and id = p_id and version = p_expected
   returning version into v;
  if v is null then raise exception 'conflict' using errcode = '40001'; end if;
  return v;
end $$;

create function public.add_member_by_email(p_project uuid, p_email text, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.is_admin(p_project) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role not in ('viewer','editor','admin') then raise exception 'bad_role'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then raise exception 'user_not_found' using errcode = 'P0002'; end if;
  insert into public.project_members(project_id, user_id, role) values (p_project, uid, p_role)
  on conflict (project_id, user_id) do update set role = excluded.role;
end $$;

create function public.set_member_role(p_project uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(p_project) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role not in ('viewer','editor','admin') then raise exception 'bad_role'; end if;
  if p_role <> 'admin' and (select count(*) from public.project_members where project_id = p_project and role = 'admin' and user_id <> p_user) = 0
    then raise exception 'last_admin' using errcode = 'P0001'; end if;
  update public.project_members set role = p_role where project_id = p_project and user_id = p_user;
end $$;

create function public.remove_member(p_project uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin(p_project) or p_user = auth.uid()) then raise exception 'forbidden' using errcode = '42501'; end if;
  if (select role from public.project_members where project_id = p_project and user_id = p_user) = 'admin'
     and (select count(*) from public.project_members where project_id = p_project and role = 'admin' and user_id <> p_user) = 0
    then raise exception 'last_admin' using errcode = 'P0001'; end if;
  delete from public.project_members where project_id = p_project and user_id = p_user;
end $$;

grant execute on function public.create_project(text), public.save_entity(uuid,text,text,jsonb,integer,boolean),
  public.add_member_by_email(uuid,text,text), public.set_member_role(uuid,uuid,text), public.remove_member(uuid,uuid) to authenticated;
revoke execute on function public.create_project(text), public.add_member_by_email(uuid,text,text), public.set_member_role(uuid,uuid,text), public.remove_member(uuid,uuid) from public, anon;

-- ---------- realtime ----------
-- On Supabase this publication already exists; the DO block makes the script safe elsewhere.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.entities;
  end if;
end $$;
