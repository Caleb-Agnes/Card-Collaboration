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

-- ---------- Table access ----------
-- Signed-in users reach the tables through the API; RLS below decides which rows.
-- Signed-out visitors (anon) get nothing.
grant select, insert, update, delete on public.projects, public.profiles, public.layers to authenticated;
revoke all on public.projects, public.profiles, public.layers from anon;

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
-- Paths: layers/{layer_id}/v{n}.png (owner or host) and background/v{n}.png (host only).
create policy card_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'card' and (
      public.is_host()
      or (
        (storage.foldername(name))[1] = 'layers'
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
