-- Collab Card Builder: tables, Row Level Security, storage bucket and realtime.
-- Run once in the Supabase SQL editor (SETUP.md step 2). Safe to re-run: it drops
-- and recreates the policies, but NOT the tables (so your data is kept).
--
-- Security model (HANDOVER.md "Security rules"):
--   * Any signed-in profile can read the project, profiles, layers and images.
--   * A profile can insert, update and delete only its own layers and files;
--     the host can do this for any layer.
--   * Only the host can update the project (lock, size, background).
--   * When the project is locked, no one but the host can change layers.
--   * Image files are never overwritten or deleted by the app (U4): there are
--     no UPDATE or DELETE policies on storage objects.
--
-- Hardening against hand-made API requests (anyone signed in can call the API directly):
--   * Only the columns the app writes can be written (column grants).
--   * Shapes, transforms, layer order and image paths must be well-formed and in range,
--     so a bad row can't break the page for everyone.
--   * Contributors: at most 10 spaces each, 120 MB and 300 files of uploads each, and
--     files only at layers/{layer id}/v{n}.png. The host is exempt.

-- ---------- Tables ----------

create table if not exists public.projects (
  id              uuid primary key default gen_random_uuid(),
  title           text not null default 'Untitled card',
  width_px        int  not null default 1748 check (width_px between 16 and 10000),
  height_px       int  not null default 2480 check (height_px between 16 and 10000),
  dpi             int  not null default 300,
  background      text not null default '#ffffff',  -- '#rrggbb', or a storage path to an image
  locked          boolean not null default false,
  host_profile_id uuid,                              -- set by seed.sql
  created_at      timestamptz not null default now()
);

create table if not exists public.profiles (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  user_id     uuid not null unique references auth.users(id) on delete cascade,
  name        text not null,
  colour      text not null,
  unique (project_id, name)
);

do $$ begin
  alter table public.projects add constraint projects_host_fk
    foreign key (host_profile_id) references public.profiles(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.layers (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  label        text not null default '' check (char_length(label) <= 80),
  shape        jsonb,           -- {"type":"rect","x","y","w","h"} or {"type":"path","points":[[x,y],...]}, canvas px
  image_path   text,            -- current image in the 'card' bucket, null until uploaded
  transform    jsonb,           -- {"x","y","scale","flip","rotation"}: image top-left in canvas px, etc.
  stack_order  double precision not null default 0,  -- higher = further in front
  versions     text[] not null default '{}',         -- past image paths, oldest first (U4)
  updated_at   timestamptz not null default now()
);
create index if not exists layers_project_idx on public.layers(project_id);

-- ---------- Helper functions (security definer so policies don't recurse) ----------

create or replace function public.my_profile_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from profiles where user_id = auth.uid()
$$;

create or replace function public.is_host() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from projects p join profiles pr on pr.id = p.host_profile_id
    where pr.user_id = auth.uid()
  )
$$;

create or replace function public.project_locked(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select locked from projects where id = pid), true)
$$;

-- May the signed-in user change this layer? (own + unlocked, or host)
create or replace function public.may_edit_layer(owner uuid, pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_host() or (owner = public.my_profile_id() and not public.project_locked(pid))
$$;

-- ---------- Triggers ----------

-- Keep updated_at fresh, and never let an update drop old image versions (U4).
create or replace function public.layers_before_update() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if not (new.versions @> old.versions) then
    raise exception 'Old image versions cannot be removed';
  end if;
  if old.image_path is not null and new.image_path is distinct from old.image_path
     and not (old.image_path = any(new.versions)) then
    raise exception 'The previous image must be added to versions';
  end if;
  return new;
end $$;

drop trigger if exists layers_before_update on public.layers;
create trigger layers_before_update before update on public.layers
  for each row execute function public.layers_before_update();

-- ---------- Data checks ----------

-- Is v a JSON number between lo and hi? (never null, so CHECKs can't be skipped)
create or replace function public.json_num(v jsonb, lo float8, hi float8) returns boolean
language sql immutable as $$
  select case when jsonb_typeof(v) = 'number' then (v #>> '{}')::float8 between lo and hi else false end
$$;

-- {"type":"rect","x","y","w","h"} or {"type":"path","points":[[x,y],...]} with 3-300 points.
create or replace function public.valid_shape(s jsonb) returns boolean
language plpgsql immutable as $$
declare p jsonb;
begin
  if s is null then return true; end if;
  if jsonb_typeof(s) <> 'object' or pg_column_size(s) > 16000 then return false; end if;
  if s->>'type' = 'rect' then
    return public.json_num(s->'x', -20000, 20000) and public.json_num(s->'y', -20000, 20000)
       and public.json_num(s->'w', 0, 20000) and public.json_num(s->'h', 0, 20000);
  elsif s->>'type' = 'path' then
    if jsonb_typeof(s->'points') <> 'array' or jsonb_array_length(s->'points') not between 3 and 300 then return false; end if;
    for p in select * from jsonb_array_elements(s->'points') loop
      if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) <> 2 then return false; end if;
      if not (public.json_num(p->0, -20000, 20000) and public.json_num(p->1, -20000, 20000)) then return false; end if;
    end loop;
    return true;
  end if;
  return false;
end $$;

-- {"x","y","scale","flip","rotation"} with sensible ranges.
create or replace function public.valid_transform(t jsonb) returns boolean
language sql immutable as $$
  select t is null or (
    jsonb_typeof(t) = 'object' and pg_column_size(t) < 2000
    and public.json_num(t->'x', -50000, 50000) and public.json_num(t->'y', -50000, 50000)
    and public.json_num(t->'scale', 0.0001, 100)
    and (t->'rotation' is null or public.json_num(t->'rotation', -360, 360))
    and (t->'flip' is null or jsonb_typeof(t->'flip') = 'boolean')
  )
$$;

do $$ begin
  alter table public.layers drop constraint if exists layers_shape_ok;
  alter table public.layers drop constraint if exists layers_transform_ok;
  alter table public.layers drop constraint if exists layers_order_ok;
  alter table public.layers drop constraint if exists layers_versions_ok;
  -- NOT VALID: checked on every new write, without failing on rows already there.
  alter table public.layers add constraint layers_shape_ok check (public.valid_shape(shape)) not valid;
  alter table public.layers add constraint layers_transform_ok check (public.valid_transform(transform)) not valid;
  alter table public.layers add constraint layers_order_ok check (stack_order between -1e9 and 1e9) not valid;
  alter table public.layers add constraint layers_versions_ok check (cardinality(versions) <= 100) not valid;
end $$;

-- Image paths must be this layer's own files, and contributors get at most 10 spaces.
create or replace function public.layers_guard() returns trigger
language plpgsql as $$
declare
  v text;
  pat text := '^layers/' || new.id || '/v[0-9]{1,4}[.]png$';
  n int;
begin
  if new.image_path is not null and new.image_path !~ pat then
    raise exception 'Image path must be layers/%/v<n>.png', new.id;
  end if;
  foreach v in array new.versions loop
    if v !~ pat then raise exception 'Version paths must be layers/%/v<n>.png', new.id; end if;
  end loop;
  if tg_op = 'INSERT' and not public.is_host() then
    select count(*) into n from public.layers where owner_id = new.owner_id;
    if n >= 10 then raise exception 'You already have 10 spaces. Delete one first.'; end if;
  end if;
  return new;
end $$;

drop trigger if exists layers_guard on public.layers;
create trigger layers_guard before insert or update on public.layers
  for each row execute function public.layers_guard();

-- ---------- Table access ----------
-- Signed-in users reach the tables through the API; RLS below decides which rows, and these
-- grants decide which columns. Signed-out visitors (anon) get nothing.
revoke all on public.projects, public.profiles, public.layers from anon, authenticated;
grant select on public.projects, public.profiles, public.layers to authenticated;
grant update (title, width_px, height_px, dpi, background, locked) on public.projects to authenticated;
grant insert (project_id, owner_id, label, shape, stack_order) on public.layers to authenticated;
grant update (owner_id, label, shape, image_path, transform, stack_order, versions) on public.layers to authenticated;
grant delete on public.layers to authenticated;

-- ---------- Row Level Security ----------

alter table public.projects enable row level security;
alter table public.profiles enable row level security;
alter table public.layers   enable row level security;

drop policy if exists projects_read   on public.projects;
drop policy if exists projects_update on public.projects;
create policy projects_read   on public.projects for select to authenticated using (true);
create policy projects_update on public.projects for update to authenticated
  using (public.is_host()) with check (public.is_host());

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (true);
-- No insert/update/delete policies: profiles are created by seed.sql only.

drop policy if exists layers_read   on public.layers;
drop policy if exists layers_insert on public.layers;
drop policy if exists layers_update on public.layers;
drop policy if exists layers_delete on public.layers;
create policy layers_read   on public.layers for select to authenticated using (true);
create policy layers_insert on public.layers for insert to authenticated
  with check (public.may_edit_layer(owner_id, project_id));
create policy layers_update on public.layers for update to authenticated
  using (public.may_edit_layer(owner_id, project_id))
  with check (public.may_edit_layer(owner_id, project_id));  -- stops a contributor giving a layer away
create policy layers_delete on public.layers for delete to authenticated
  using (public.may_edit_layer(owner_id, project_id));

-- ---------- Storage ----------
-- Private bucket: files are only readable by signed-in profiles. 20 MB cap (U5), PNG only
-- (uploads of JPG, PSD and ORA are converted to PNG in the browser first).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('card', 'card', false, 20971520, array['image/png'])
on conflict (id) do update set public = false, file_size_limit = 20971520, allowed_mime_types = array['image/png'];

drop policy if exists card_read   on storage.objects;
drop policy if exists card_insert on storage.objects;
create policy card_read on storage.objects for select to authenticated
  using (bucket_id = 'card');
-- Upload totals for the signed-in user (security definer: a policy can't query its own table).
create or replace function public.my_upload_bytes() returns bigint
language sql stable security definer set search_path = public, storage as $$
  select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects
  where bucket_id = 'card' and owner_id = auth.uid()::text
$$;
create or replace function public.my_upload_count() returns bigint
language sql stable security definer set search_path = public, storage as $$
  select count(*) from storage.objects where bucket_id = 'card' and owner_id = auth.uid()::text
$$;

-- Paths: layers/{layer_id}/v{n}.png (owner or host) and background/v{n}.png (host only).
-- Contributors are capped at 120 MB and 300 files, so nobody can fill the free 1 GB.
create policy card_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'card' and (
      public.is_host()
      or (
        name ~ '^layers/[0-9a-f-]{36}/v[0-9]{1,4}[.]png$'
        and public.my_upload_bytes() < 120 * 1024 * 1024
        and public.my_upload_count() < 300
        and exists (
          select 1 from public.layers l
          where l.id::text = (storage.foldername(name))[2]
            and public.may_edit_layer(l.owner_id, l.project_id)
        )
      )
    )
  );

-- ---------- Realtime (C5) ----------

do $$ begin
  alter publication supabase_realtime add table public.layers;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.projects;
exception when duplicate_object then null; end $$;
