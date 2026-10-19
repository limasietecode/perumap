-- =====================================================================
--  Mapa de Proyectos · database setup for Supabase
--  Paste everything into  Supabase → SQL Editor → New query  and click Run.
--  Safe to run again (it updates what already exists).
-- =====================================================================

-- ---------- Projects (public, read-only from the website) ----------
create table if not exists public.projects (
  id           uuid primary key,
  type         text not null check (type in ('artefacto', 'unidad')),
  title        text not null check (char_length(title) between 3 and 120),
  students     text[] not null check (cardinality(students) between 1 and 12),
  departamento text not null check (char_length(departamento) <= 40),
  ciudad       text not null check (char_length(ciudad) between 1 and 80),
  x            double precision not null check (x between 0 and 1),
  y            double precision not null check (y between 0 and 1),
  lat          double precision,
  lng          double precision,
  description  text not null check (char_length(description) <= 300),
  tags         text[] not null default '{}' check (cardinality(tags) <= 15),
  images       jsonb not null default '[]'::jsonb,
  hidden       boolean not null default false,  -- set to true in the Table Editor to hide a project
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Edit keys are stored hashed in a table nobody can read through the API.
create table if not exists public.project_secrets (
  project_id uuid primary key references public.projects (id) on delete cascade,
  key_hash   text not null
);

alter table public.projects enable row level security;
alter table public.project_secrets enable row level security;

drop policy if exists "Anyone can see visible projects" on public.projects;
create policy "Anyone can see visible projects"
  on public.projects for select
  to anon, authenticated
  using (not hidden);

-- No insert/update/delete policies: changes only go through the functions below.
revoke all on public.project_secrets from anon, authenticated;
grant select on public.projects to anon, authenticated;

-- ---------- Validation helper (not callable from the website) ----------
create schema if not exists private;

create or replace function private.check_project(p jsonb)
returns void
language plpgsql
as $$
begin
  if jsonb_typeof(p -> 'images') is distinct from 'array'
     or jsonb_array_length(p -> 'images') not between 1 and 6 then
    raise exception 'Número de imágenes no válido.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p -> 'images') im
    where coalesce(im ->> 'id', '') !~ '^[0-9a-f-]{36}$'
  ) then
    raise exception 'Imagen no válida.';
  end if;
  if jsonb_typeof(p -> 'students') is distinct from 'array'
     or jsonb_typeof(p -> 'tags') is distinct from 'array' then
    raise exception 'Datos no válidos.';
  end if;
end
$$;

create or replace function private.key_hash(k text)
returns text
language sql
immutable
as $$ select encode(sha256(convert_to(coalesce(k, ''), 'UTF8')), 'hex') $$;

-- ---------- Functions the website calls ----------

-- Creates a project and returns its secret edit key.
create or replace function public.create_project(p_id uuid, p jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  perform private.check_project(p);
  insert into public.projects
    (id, type, title, students, departamento, ciudad, x, y, lat, lng, description, tags, images)
  values (
    p_id,
    p ->> 'type',
    p ->> 'title',
    array(select e from jsonb_array_elements_text(p -> 'students') with ordinality t(e, i) order by i),
    p ->> 'departamento',
    p ->> 'ciudad',
    (p ->> 'x')::double precision,
    (p ->> 'y')::double precision,
    (p ->> 'lat')::double precision,
    (p ->> 'lng')::double precision,
    coalesce(p ->> 'description', ''),
    array(select e from jsonb_array_elements_text(p -> 'tags') with ordinality t(e, i) order by i),
    p -> 'images'
  );
  insert into public.project_secrets (project_id, key_hash) values (p_id, private.key_hash(v_key));
  return v_key;
end
$$;

-- Updates a project if the edit key is correct.
create or replace function public.update_project(p_id uuid, p_key text, p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.project_secrets s
    where s.project_id = p_id and s.key_hash = private.key_hash(p_key)
  ) then
    raise exception 'No tienes permiso para editar este proyecto.';
  end if;
  perform private.check_project(p);
  update public.projects set
    type         = p ->> 'type',
    title        = p ->> 'title',
    students     = array(select e from jsonb_array_elements_text(p -> 'students') with ordinality t(e, i) order by i),
    departamento = p ->> 'departamento',
    ciudad       = p ->> 'ciudad',
    x            = (p ->> 'x')::double precision,
    y            = (p ->> 'y')::double precision,
    lat          = (p ->> 'lat')::double precision,
    lng          = (p ->> 'lng')::double precision,
    description  = coalesce(p ->> 'description', ''),
    tags         = array(select e from jsonb_array_elements_text(p -> 'tags') with ordinality t(e, i) order by i),
    images       = p -> 'images',
    updated_at   = now()
  where id = p_id;
end
$$;

-- Deletes a project if the edit key is correct.
create or replace function public.delete_project(p_id uuid, p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.project_secrets s
    where s.project_id = p_id and s.key_hash = private.key_hash(p_key)
  ) then
    raise exception 'No tienes permiso para eliminar este proyecto.';
  end if;
  delete from public.projects where id = p_id;
end
$$;

revoke all on function public.create_project(uuid, jsonb) from public;
revoke all on function public.update_project(uuid, text, jsonb) from public;
revoke all on function public.delete_project(uuid, text) from public;
grant execute on function public.create_project(uuid, jsonb) to anon, authenticated;
grant execute on function public.update_project(uuid, text, jsonb) to anon, authenticated;
grant execute on function public.delete_project(uuid, text) to anon, authenticated;

-- ---------- Image storage ----------
-- Public bucket: anyone can view; uploads limited to compressed JPGs (max 5 MB) in "<project-id>/<image-id>.jpg".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-images', 'project-images', true, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg'];

drop policy if exists "Anyone can upload project images" on storage.objects;
create policy "Anyone can upload project images"
  on storage.objects for insert
  to anon, authenticated
  with check (
    bucket_id = 'project-images'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}(_t)?\.jpg$'
  );

-- ---------- Real time: new projects appear on everyone's map ----------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'projects'
  ) then
    alter publication supabase_realtime add table public.projects;
  end if;
end
$$;
