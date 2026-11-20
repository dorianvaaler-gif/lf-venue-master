-- Chat del equipo (público) + suscripciones push.
-- CORRER UNA SOLA VEZ en el SQL editor del proyecto lf-venue-master.
-- NO re-correr supabase/schema.sql: este archivo es solo lo nuevo.

-- 1) Chat público del crew: mensajes sin SHOW (toda la conversación del equipo).
create table if not exists public.team_messages (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references auth.users(id),
  author_name text,
  body text not null,
  created_at timestamptz not null default now()
);
alter table public.team_messages enable row level security;
drop policy if exists "equipo activo lee y escribe chat del equipo" on public.team_messages;
create policy "equipo activo lee y escribe chat del equipo" on public.team_messages
  for all using (public.is_active_user());
grant select, insert, update, delete on public.team_messages to anon, authenticated, service_role;
alter publication supabase_realtime add table public.team_messages;

-- 2) Suscripciones push (un teléfono = una fila, por endpoint).
-- Solo la toca el servidor (service_role, que pasa por encima de RLS);
-- el cliente nunca la lee directo, por eso no lleva políticas.
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
