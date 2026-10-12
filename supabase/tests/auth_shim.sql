-- NUR FÜR LOKALE TESTS: bildet die Teile von Supabase nach, die das Schema
-- benötigt (Rollen anon/authenticated, auth.users, auth.uid()).
-- In einem echten Supabase-Projekt existiert all das bereits – diese Datei
-- NICHT im Supabase-SQL-Editor ausführen.
create role anon nologin;
create role authenticated nologin;
create schema auth;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    ),
    ''
  )::uuid
$$;
grant execute on function auth.uid() to anon, authenticated;
-- Supabase vergibt standardmäßig breite Rechte an anon/authenticated;
-- das bilden wir nach, damit die REVOKEs der Migration wirklich getestet werden.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
