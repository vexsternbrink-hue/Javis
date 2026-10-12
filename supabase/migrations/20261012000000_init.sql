-- Jarvis – Datenbankschema (MVP)
--
-- Grundprinzip: Jede Tabelle hat eine Spalte user_id. Row-Level-Security (RLS)
-- sorgt dafür, dass jeder angemeldete Nutzer ausschließlich seine eigenen Zeilen
-- sehen und verändern kann. Der Server der App greift nur mit dem Login-Token
-- des Nutzers auf die Datenbank zu (kein Service-Role-Key), daher gelten diese
-- Regeln auch für alle API-Endpunkte und KI-Tools.

-- ---------------------------------------------------------------------------
-- Hilfsfunktion: updated_at automatisch setzen
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Chats
-- ---------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'Neuer Chat' check (char_length(title) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_user_updated_idx on public.conversations (user_id, updated_at desc);

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Nachrichten (Chatverlauf). Append-only: Nachrichten werden nie verändert.
-- content enthält die Inhaltsblöcke im neutralen Format der App
-- (siehe src/lib/ai/types.ts).
-- ---------------------------------------------------------------------------
create table public.messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content jsonb not null check (jsonb_typeof(content) = 'array'),
  -- Der vom Nutzer getippte Text (nur bei Nutzernachrichten, für die Anzeige).
  display_text text check (display_text is null or char_length(display_text) <= 20000),
  -- Hash der Erinnerungen, die mit dieser Nachricht an die KI gingen (oder null).
  memory_hash text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);

create index messages_conversation_idx on public.messages (conversation_id, id);
create index messages_user_idx on public.messages (user_id);

-- ---------------------------------------------------------------------------
-- Agenten-Aktionen: jeder Tool-Aufruf der KI wird hier protokolliert.
-- Schreibende Aktionen starten mit status = 'pending' und werden erst nach
-- Bestätigung in der Oberfläche ausgeführt. tool_name und input sind nach dem
-- Anlegen unveränderlich (siehe Rechte weiter unten).
-- ---------------------------------------------------------------------------
create table public.agent_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  message_id bigint not null references public.messages (id) on delete cascade,
  tool_use_id text not null check (char_length(tool_use_id) <= 200),
  tool_name text not null check (char_length(tool_name) <= 100),
  input jsonb not null,
  preview jsonb,
  requires_confirmation boolean not null,
  status text not null check (
    status in ('pending', 'approved', 'executed', 'failed', 'rejected', 'cancelled')
  ),
  result jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (conversation_id, tool_use_id)
);

create index agent_actions_message_idx on public.agent_actions (message_id);
create index agent_actions_user_idx on public.agent_actions (user_id);

-- ---------------------------------------------------------------------------
-- Dauerhafte Erinnerungen
-- ---------------------------------------------------------------------------
create table public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index memories_user_idx on public.memories (user_id, created_at);

create trigger memories_set_updated_at
  before update on public.memories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Aufgaben
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 300),
  details text check (details is null or char_length(details) <= 5000),
  due_date date,
  done boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_user_idx on public.tasks (user_id, done, due_date);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Notizen
-- ---------------------------------------------------------------------------
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  content text not null default '' check (char_length(content) <= 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notes_user_idx on public.notes (user_id, updated_at desc);

create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Rate-Limiting (funktioniert auf Vercel, weil der Zähler in der Datenbank
-- liegt und nicht im Speicher einer einzelnen Serverless-Funktion).
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (user_id, bucket, window_start)
);

-- Zählt eine Anfrage des aktuellen Nutzers und gibt zurück, ob sie innerhalb
-- des Limits liegt. Läuft als security definer, damit Nutzer die Tabelle
-- rate_limits nicht direkt lesen oder verändern können.
create or replace function public.check_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_window timestamptz;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_limit < 1 or p_window_seconds < 1 or p_window_seconds > 604800
     or p_bucket is null or char_length(p_bucket) > 50 then
    raise exception 'invalid rate limit parameters' using errcode = '22023';
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limits as r (user_id, bucket, window_start, count)
  values (v_uid, p_bucket || ':' || p_window_seconds, v_window, 1)
  on conflict (user_id, bucket, window_start)
  do update set count = r.count + 1
  returning r.count into v_count;

  -- Alte Zähler aufräumen (nur die des aktuellen Nutzers).
  delete from public.rate_limits
  where user_id = v_uid and window_start < now() - interval '8 days';

  return v_count <= p_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row-Level-Security
-- ---------------------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.agent_actions enable row level security;
alter table public.memories enable row level security;
alter table public.tasks enable row level security;
alter table public.notes enable row level security;
alter table public.rate_limits enable row level security; -- bewusst ohne Policies

-- Chats
create policy "conversations_select_own" on public.conversations
  for select to authenticated using (user_id = (select auth.uid()));
create policy "conversations_insert_own" on public.conversations
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "conversations_update_own" on public.conversations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "conversations_delete_own" on public.conversations
  for delete to authenticated using (user_id = (select auth.uid()));

-- Nachrichten: lesen und anhängen, nur im eigenen Chat
create policy "messages_select_own" on public.messages
  for select to authenticated using (user_id = (select auth.uid()));
create policy "messages_insert_own" on public.messages
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );

-- Agenten-Aktionen
create policy "agent_actions_select_own" on public.agent_actions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "agent_actions_insert_own" on public.agent_actions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and m.conversation_id = agent_actions.conversation_id
        and m.user_id = (select auth.uid())
    )
  );
create policy "agent_actions_update_own" on public.agent_actions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Erinnerungen, Aufgaben, Notizen: volle Verwaltung der eigenen Zeilen
create policy "memories_select_own" on public.memories
  for select to authenticated using (user_id = (select auth.uid()));
create policy "memories_insert_own" on public.memories
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "memories_update_own" on public.memories
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "memories_delete_own" on public.memories
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "tasks_select_own" on public.tasks
  for select to authenticated using (user_id = (select auth.uid()));
create policy "tasks_insert_own" on public.tasks
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "tasks_update_own" on public.tasks
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "tasks_delete_own" on public.tasks
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "notes_select_own" on public.notes
  for select to authenticated using (user_id = (select auth.uid()));
create policy "notes_insert_own" on public.notes
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "notes_update_own" on public.notes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "notes_delete_own" on public.notes
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Tabellenrechte (zusätzlich zu RLS): anonyme Besucher bekommen nichts,
-- Nachrichten sind unveränderlich, bei Agenten-Aktionen dürfen nur Status und
-- Ergebnis geändert werden – nie das Tool oder seine Argumente.
-- ---------------------------------------------------------------------------
revoke all on public.conversations, public.messages, public.agent_actions,
  public.memories, public.tasks, public.notes, public.rate_limits from anon;
revoke all on public.conversations, public.messages, public.agent_actions,
  public.memories, public.tasks, public.notes, public.rate_limits from authenticated;

grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;
grant select, insert on public.agent_actions to authenticated;
grant update (status, result, resolved_at) on public.agent_actions to authenticated;
grant select, insert, update, delete on public.memories to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.notes to authenticated;

revoke all on function public.check_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.check_rate_limit(text, integer, integer) to authenticated;
