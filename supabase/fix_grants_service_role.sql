-- FIX 2026-11-19 (parte 3): permisos de tabla para service_role.
-- fix_grants.sql solo dio permisos a anon y authenticated. El rol
-- service_role (el que usa la llave secreta sb_secret_ en las API routes
-- de Vercel) NO tenía ningún permiso de tabla: cada consulta PostgREST
-- del servidor fallaba con 42501 "permission denied" y el código la
-- ignoraba (data null). Por eso /api/invites devolvía 403
-- "Solo el master puede hacer esto" aunque el perfil master existe y la
-- llave secreta es válida (el Admin de Auth sí funcionaba, por eso el
-- bootstrap llegaba a "already registered").
-- RLS no es el problema: service_role pasa por encima de RLS, pero
-- todavía necesita los GRANT de tabla.
-- Aplicar UNA SOLA VEZ en el SQL Editor de Supabase (proyecto lf-venue-master).

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema public grant usage, select on sequences to service_role;
