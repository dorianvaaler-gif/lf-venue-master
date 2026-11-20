-- LF-Venue Master — esquema Supabase (Postgres)
-- Ejecutar en el SQL Editor del proyecto Supabase, una sola vez.
-- Empieza vacío: sin datos de prueba ni demo.

-- Perfiles: un renglón por usuario. El master es dorianvaaler@gmail.com.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text,
  role text not null default 'member' check (role in ('master','member')),
  active boolean not null default true,
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- Invitaciones por código (la plataforma no manda correos: el master comparte el código).
create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code text not null unique,
  created_by uuid references auth.users(id),
  used_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Nuevo evento',
  event_date date,
  call_time text,
  show_time text,
  responsible text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  label text,
  time text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text,
  phone text,
  role text,
  created_at timestamptz not null default now()
);

create table if not exists public.event_crew (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text,
  role text,
  created_at timestamptz not null default now()
);

create table if not exists public.rider_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  cantidad text,
  modelo text,
  otros text,
  created_at timestamptz not null default now()
);

create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  text text,
  status text not null default 'pendiente' check (status in ('pendiente','en_curso','hecho')),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Chat interno por proyecto/evento.
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  author_id uuid references auth.users(id),
  author_name text,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.activity (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  author_name text,
  text text,
  created_at timestamptz not null default now()
);

-- Índices
create index if not exists idx_events_date on public.events(event_date);
create index if not exists idx_messages_event on public.messages(event_id, created_at);
create index if not exists idx_invites_code on public.invites(code);

-- Realtime: sincronización en vivo entre teléfonos.
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.schedules;
alter publication supabase_realtime add table public.contacts;
alter publication supabase_realtime add table public.event_crew;
alter publication supabase_realtime add table public.rider_items;
alter publication supabase_realtime add table public.checklist_items;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.activity;

-- FIX 2026-11-19: las políticas NO deben consultar public.profiles directamente
-- (eso causaba "infinite recursion detected", Postgres 42P17, y TODAS las
-- lecturas fallaban con HTTP 500). Estas funciones SECURITY DEFINER pasan por
-- encima de RLS y son las que usan las políticas. El fix ya se aplicó en vivo
-- en el proyecto lf-venue-master con fix_rls_recursion.sql; NO re-correr este
-- schema en ese proyecto.
create or replace function public.is_active_user()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true
  );
$$;

create or replace function public.is_master_user()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'master' and active = true
  );
$$;

-- RLS: solo usuarios con sesión y perfil activo ven y editan los datos del equipo.
-- (El service role de las API routes pasa por encima de RLS.)
alter table public.profiles enable row level security;
alter table public.invites enable row level security;
alter table public.events enable row level security;
alter table public.schedules enable row level security;
alter table public.contacts enable row level security;
alter table public.event_crew enable row level security;
alter table public.rider_items enable row level security;
alter table public.checklist_items enable row level security;
alter table public.messages enable row level security;
alter table public.activity enable row level security;

create policy "perfil activo ve perfiles" on public.profiles
  for select using (public.is_active_user());
create policy "usuario actualiza su perfil" on public.profiles
  for update using (auth.uid() = id);

create policy "equipo activo gestiona eventos" on public.events
  for all using (public.is_active_user());
create policy "equipo activo gestiona horarios" on public.schedules
  for all using (public.is_active_user());
create policy "equipo activo gestiona contactos" on public.contacts
  for all using (public.is_active_user());
create policy "equipo activo gestiona crew" on public.event_crew
  for all using (public.is_active_user());
create policy "equipo activo gestiona rider" on public.rider_items
  for all using (public.is_active_user());
create policy "equipo activo gestiona checklist" on public.checklist_items
  for all using (public.is_active_user());
create policy "equipo activo lee y escribe mensajes" on public.messages
  for all using (public.is_active_user());
create policy "equipo activo ve actividad" on public.activity
  for all using (public.is_active_user());
create policy "equipo activo registra actividad" on public.activity
  for insert with check (public.is_active_user());

-- Invitaciones: solo el master las lee desde el cliente; la creación y el
-- canje van por API routes con service role.
create policy "master ve invitaciones" on public.invites
  for select using (public.is_master_user());

-- Permisos de tabla (FIX 2026-11-19): las tablas se crearon con SQL directo,
-- que NO otorga permisos automáticamente (eso solo lo hace el Table Editor).
-- Sin estos GRANT, anon/authenticated recibían 42501 "permission denied" y la
-- app no podía leer nada aunque RLS lo permitiera. Ya aplicado en vivo con
-- fix_grants.sql; NO re-correr este schema en el proyecto lf-venue-master.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant usage, select on sequences to anon, authenticated, service_role;

-- Chat del equipo + push (2026-11-19 noche). En el proyecto vivo ya se aplicó
-- con supabase/fix_team_chat.sql; esto solo queda aquí para proyectos nuevos.
create table if not exists public.team_messages (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references auth.users(id),
  author_name text,
  body text not null,
  created_at timestamptz not null default now()
);
alter table public.team_messages enable row level security;
create policy "equipo activo lee y escribe chat del equipo" on public.team_messages
  for all using (public.is_active_user());
grant select, insert, update, delete on public.team_messages to anon, authenticated, service_role;
alter publication supabase_realtime add table public.team_messages;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
grant select, insert, update, delete on public.push_subscriptions to anon, authenticated, service_role;
