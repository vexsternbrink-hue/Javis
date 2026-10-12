-- Prüft, dass Nutzer B keinerlei Zugriff auf die Daten von Nutzer A hat.
-- Wird von scripts/test-rls.sh gegen ein frisches lokales Postgres ausgeführt.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.com'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@example.com');

-- Hilfsfunktion zum Prüfen, dass ein Statement fehlschlägt
create function pg_temp.expect_error(stmt text, label text) returns void
language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'OK (abgelehnt): % -> %', label, sqlerrm;
    return;
  end;
  raise exception 'FEHLER: % wurde NICHT abgelehnt', label;
end $$;
grant execute on function pg_temp.expect_error(text, text) to anon, authenticated;

create function pg_temp.expect_eq(actual bigint, expected bigint, label text) returns void
language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FEHLER: % – erwartet %, erhalten %', label, expected, actual;
  end if;
  raise notice 'OK: %', label;
end $$;
grant execute on function pg_temp.expect_eq(bigint, bigint, text) to anon, authenticated;

-- ---------------- Nutzer A legt Daten an ----------------
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', false);

insert into public.conversations (id, title) values ('11111111-1111-1111-1111-111111111111', 'Chat von A');
insert into public.messages (conversation_id, role, content, display_text)
  values ('11111111-1111-1111-1111-111111111111', 'user', '[{"type":"text","text":"Hallo"}]', 'Hallo');
insert into public.agent_actions (id, conversation_id, message_id, tool_use_id, tool_name, input, requires_confirmation, status)
  select '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', id, 'toolu_1', 'create_task',
         '{"title":"Geheim"}', true, 'pending'
  from public.messages limit 1;
insert into public.tasks (id, title) values ('33333333-3333-3333-3333-333333333333', 'Aufgabe von A');
insert into public.notes (id, title, content) values ('44444444-4444-4444-4444-444444444444', 'Notiz von A', 'privat');
insert into public.memories (id, content) values ('55555555-5555-5555-5555-555555555555', 'A mag Mathe');

select pg_temp.expect_eq((select count(*) from public.tasks), 1, 'A sieht eigene Aufgabe');
select pg_temp.expect_eq((select count(*) from public.messages), 1, 'A sieht eigene Nachricht');

-- Nachrichten sind unveränderlich, Aktions-Argumente auch
select pg_temp.expect_error($$update public.messages set content = '[]'$$, 'A ändert Nachricht');
select pg_temp.expect_error($$update public.agent_actions set input = '{"title":"anders"}'$$, 'A ändert Aktions-Argumente');
select pg_temp.expect_error($$update public.agent_actions set tool_name = 'delete_task'$$, 'A ändert Aktions-Tool');
update public.agent_actions set status = 'rejected', resolved_at = now() where id = '22222222-2222-2222-2222-222222222222';
select pg_temp.expect_eq((select count(*) from public.agent_actions where status = 'rejected'), 1, 'A darf Status setzen');

-- Rate-Limit
select pg_temp.expect_eq((select public.check_rate_limit('test', 2, 60))::int, 1, 'Rate-Limit 1/2');
select pg_temp.expect_eq((select public.check_rate_limit('test', 2, 60))::int, 1, 'Rate-Limit 2/2');
select pg_temp.expect_eq((select public.check_rate_limit('test', 2, 60))::int, 0, 'Rate-Limit 3/2 blockiert');
select pg_temp.expect_error($$select * from public.rate_limits$$, 'A liest rate_limits direkt');
select pg_temp.expect_error($$select public.check_rate_limit('x', 0, 60)$$, 'Rate-Limit mit ungültigen Parametern');

-- ---------------- Nutzer B versucht Zugriff ----------------
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', false);

select pg_temp.expect_eq((select count(*) from public.conversations), 0, 'B sieht keine Chats von A');
select pg_temp.expect_eq((select count(*) from public.messages), 0, 'B sieht keine Nachrichten von A');
select pg_temp.expect_eq((select count(*) from public.agent_actions), 0, 'B sieht keine Aktionen von A');
select pg_temp.expect_eq((select count(*) from public.tasks), 0, 'B sieht keine Aufgaben von A');
select pg_temp.expect_eq((select count(*) from public.notes), 0, 'B sieht keine Notizen von A');
select pg_temp.expect_eq((select count(*) from public.memories), 0, 'B sieht keine Erinnerungen von A');

with u as (update public.tasks set title = 'gehackt' where id = '33333333-3333-3333-3333-333333333333' returning 1)
select pg_temp.expect_eq((select count(*) from u), 0, 'B kann Aufgabe von A nicht ändern');
with d as (delete from public.notes where id = '44444444-4444-4444-4444-444444444444' returning 1)
select pg_temp.expect_eq((select count(*) from d), 0, 'B kann Notiz von A nicht löschen');
with d as (delete from public.conversations where id = '11111111-1111-1111-1111-111111111111' returning 1)
select pg_temp.expect_eq((select count(*) from d), 0, 'B kann Chat von A nicht löschen');
with u as (update public.agent_actions set status = 'approved' where id = '22222222-2222-2222-2222-222222222222' returning 1)
select pg_temp.expect_eq((select count(*) from u), 0, 'B kann Aktion von A nicht freigeben');
with u as (update public.memories set content = 'x' returning 1)
select pg_temp.expect_eq((select count(*) from u), 0, 'B kann Erinnerung von A nicht ändern');

select pg_temp.expect_error(
  $$insert into public.messages (conversation_id, role, content) values ('11111111-1111-1111-1111-111111111111', 'user', '[]')$$,
  'B schreibt Nachricht in Chat von A');
select pg_temp.expect_error(
  $$insert into public.tasks (user_id, title) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'untergeschoben')$$,
  'B legt Aufgabe im Namen von A an');
select pg_temp.expect_error(
  $$insert into public.agent_actions (conversation_id, message_id, tool_use_id, tool_name, input, requires_confirmation, status)
    select '11111111-1111-1111-1111-111111111111', 1, 'toolu_x', 'delete_task', '{}', true, 'pending'$$,
  'B legt Aktion in Chat von A an');

-- B hat einen eigenen Rate-Limit-Zähler
select pg_temp.expect_eq((select public.check_rate_limit('test', 2, 60))::int, 1, 'B hat eigenen Rate-Limit-Zähler');

-- A kann eigenen Chat nicht an B übertragen
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', false);
select pg_temp.expect_error(
  $$update public.conversations set user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  'A überträgt Chat an B');
select pg_temp.expect_eq((select count(*) from public.tasks), 1, 'Aufgabe von A unverändert vorhanden');
select pg_temp.expect_eq((select count(*) from public.tasks where title = 'Aufgabe von A'), 1, 'Titel von A unverändert');
select pg_temp.expect_eq((select count(*) from public.notes), 1, 'Notiz von A noch vorhanden');

-- Löschen eines Chats entfernt Nachrichten und Aktionen (Cascade)
delete from public.conversations where id = '11111111-1111-1111-1111-111111111111';
select pg_temp.expect_eq((select count(*) from public.messages), 0, 'Cascade löscht Nachrichten');
select pg_temp.expect_eq((select count(*) from public.agent_actions), 0, 'Cascade löscht Aktionen');

-- ---------------- Anonymer Zugriff ----------------
reset role;
set role anon;
select set_config('request.jwt.claims', '', false);
select pg_temp.expect_error($$select * from public.tasks$$, 'anon liest Aufgaben');
select pg_temp.expect_error($$select * from public.notes$$, 'anon liest Notizen');
select pg_temp.expect_error($$select * from public.memories$$, 'anon liest Erinnerungen');
select pg_temp.expect_error($$select * from public.conversations$$, 'anon liest Chats');
select pg_temp.expect_error($$select public.check_rate_limit('test', 2, 60)$$, 'anon nutzt Rate-Limit-Funktion');
reset role;

\warn 'ALLE RLS-TESTS BESTANDEN'
