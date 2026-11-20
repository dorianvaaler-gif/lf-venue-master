-- FIX 2026-11-19 (parte 2): permisos de tabla.
-- Las tablas se crearon con SQL directo, que NO otorga permisos
-- automáticamente (eso solo lo hace el Table Editor de Supabase).
-- Sin estos GRANT, anon y authenticated recibían 42501 "permission denied"
-- en TODAS las tablas y la app no podía leer nada aunque RLS lo permitiera.
-- La recursión (fix_rls_recursion.sql) ya estaba corregida; faltaba esto.
-- Aplicar UNA SOLA VEZ en el SQL Editor de Supabase (proyecto lf-venue-master).

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant usage, select on sequences to anon, authenticated, service_role;
