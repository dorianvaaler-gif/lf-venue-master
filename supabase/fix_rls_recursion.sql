-- FIX 2026-11-19: infinite recursion (Postgres 42P17) en las políticas RLS.
-- La política de SELECT en profiles consultaba profiles a sí misma, y todas
-- las demás políticas también consultaban profiles: TODAS las lecturas a la
-- base de datos fallaban con HTTP 500. El login (Auth) sí funcionaba, pero
-- la app se quedaba congelada en la pantalla de entrar sin ningún mensaje.
-- La solución: funciones SECURITY DEFINER que pasan por encima de RLS.
-- Aplicar UNA SOLA VEZ en el SQL Editor de Supabase (proyecto lf-venue-master).
-- NO volver a correr supabase/schema.sql en este proyecto.

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

drop policy if exists "perfil activo ve perfiles" on public.profiles;
create policy "perfil activo ve perfiles" on public.profiles
  for select using (public.is_active_user());

drop policy if exists "equipo activo gestiona eventos" on public.events;
create policy "equipo activo gestiona eventos" on public.events
  for all using (public.is_active_user());

drop policy if exists "equipo activo gestiona horarios" on public.schedules;
create policy "equipo activo gestiona horarios" on public.schedules
  for all using (public.is_active_user());

drop policy if exists "equipo activo gestiona contactos" on public.contacts;
create policy "equipo activo gestiona contactos" on public.contacts
  for all using (public.is_active_user());

drop policy if exists "equipo activo gestiona crew" on public.event_crew;
create policy "equipo activo gestiona crew" on public.event_crew
  for all using (public.is_active_user());

drop policy if exists "equipo activo gestiona rider" on public.rider_items;
create policy "equipo activo gestiona rider" on public.rider_items
  for all using (public.is_active_user());

drop policy if exists "equipo activo gestiona checklist" on public.checklist_items;
create policy "equipo activo gestiona checklist" on public.checklist_items
  for all using (public.is_active_user());

drop policy if exists "equipo activo lee y escribe mensajes" on public.messages;
create policy "equipo activo lee y escribe mensajes" on public.messages
  for all using (public.is_active_user());

drop policy if exists "equipo activo ve actividad" on public.activity;
create policy "equipo activo ve actividad" on public.activity
  for all using (public.is_active_user());

drop policy if exists "equipo activo registra actividad" on public.activity;
create policy "equipo activo registra actividad" on public.activity
  for insert with check (public.is_active_user());

drop policy if exists "master ve invitaciones" on public.invites;
create policy "master ve invitaciones" on public.invites
  for select using (public.is_master_user());
