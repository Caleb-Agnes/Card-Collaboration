-- Creates the project and the 7 profiles, linked to the Auth users by email.
-- Run AFTER schema.sql and AFTER creating the 7 users in Authentication > Users
-- (SETUP.md steps 3-4). The emails must match EMAIL_DOMAIN in js/config.js.
-- Run it once; it refuses to run twice.

do $$
declare
  pid uuid;
  domain text := 'example.com';   -- change if you changed EMAIL_DOMAIN in js/config.js
  missing text;
begin
  if exists (select 1 from public.projects) then
    raise exception 'A project already exists; seed.sql has already been run.';
  end if;

  select string_agg(n, ', ') into missing
  from unnest(array['caleb','sander','nam','maks','anna','adam','josh']) n
  where not exists (select 1 from auth.users u where u.email = n || '@' || domain);
  if missing is not null then
    raise exception 'Create these users in the Auth dashboard first (as name@%): %', domain, missing;
  end if;

  insert into public.projects (title) values ('Happy Birthday Card!!') returning id into pid;

  insert into public.profiles (project_id, user_id, name, colour)
  select pid, u.id, v.name, v.colour
  from (values
    ('Caleb',  '#F7B2B7'),
    ('Sander', '#F4845F'),
    ('Nam',    '#A3D65C'),
    ('Maks',   '#2E9E6B'),
    ('Anna',   '#067BC2'),
    ('Adam',   '#8E7CE6'),
    ('Josh',   '#D77FD1')
  ) as v(name, colour)
  join auth.users u on u.email = lower(v.name) || '@' || domain;

  update public.projects
  set host_profile_id = (select id from public.profiles where name = 'Caleb' and project_id = pid)
  where id = pid;
end $$;
