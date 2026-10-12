-- Jarvis – Erweiterung: Einstellungen, Gewohnheiten, Fokus-Timer,
-- Aufgaben-Priorität und angeheftete Notizen.
--
-- Rein additiv: bestehende Tabellen bekommen nur neue Spalten mit
-- Standardwerten, vorhandene Daten bleiben unverändert.
-- Es gelten dieselben Regeln wie im Grundschema: jede Zeile gehört genau
-- einem Nutzer (user_id) und RLS lässt nur Zugriffe auf eigene Zeilen zu.

-- ---------------------------------------------------------------------------
-- Aufgaben: Priorität
-- ---------------------------------------------------------------------------
alter table public.tasks
  add column if not exists priority text not null default 'normal'
  check (priority in ('low', 'normal', 'high'));

-- ---------------------------------------------------------------------------
-- Notizen: anheften
-- ---------------------------------------------------------------------------
alter table public.notes
  add column if not exists pinned boolean not null default false;

-- ---------------------------------------------------------------------------
-- Persönliche Einstellungen (eine Zeile pro Nutzer)
-- ---------------------------------------------------------------------------
create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 60),
  -- Ort für die Wettervorhersage (vom Nutzer eingegeben, über Open-Meteo aufgelöst)
  city text check (city is null or char_length(city) between 1 and 120),
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null))
);

create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Gewohnheiten und ihre Einträge (ein Eintrag pro Tag und Gewohnheit)
-- ---------------------------------------------------------------------------
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  emoji text check (emoji is null or char_length(emoji) between 1 and 8),
  -- Ziel: an wie vielen Tagen pro Woche
  target_per_week smallint not null default 7 check (target_per_week between 1 and 7),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index habits_user_idx on public.habits (user_id, archived, created_at);

create trigger habits_set_updated_at
  before update on public.habits
  for each row execute function public.set_updated_at();

create table public.habit_logs (
  habit_id uuid not null references public.habits (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (habit_id, day)
);

create index habit_logs_user_day_idx on public.habit_logs (user_id, day);

-- ---------------------------------------------------------------------------
-- Abgeschlossene Fokus-Einheiten (Pomodoro)
-- ---------------------------------------------------------------------------
create table public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text check (label is null or char_length(label) between 1 and 100),
  minutes smallint not null check (minutes between 1 and 180),
  ended_at timestamptz not null default now()
);

create index focus_sessions_user_idx on public.focus_sessions (user_id, ended_at desc);

-- ---------------------------------------------------------------------------
-- Row-Level-Security
-- ---------------------------------------------------------------------------
alter table public.user_settings enable row level security;
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;
alter table public.focus_sessions enable row level security;

create policy "user_settings_select_own" on public.user_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy "user_settings_insert_own" on public.user_settings
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "user_settings_update_own" on public.user_settings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "habits_select_own" on public.habits
  for select to authenticated using (user_id = (select auth.uid()));
create policy "habits_insert_own" on public.habits
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "habits_update_own" on public.habits
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "habits_delete_own" on public.habits
  for delete to authenticated using (user_id = (select auth.uid()));

-- Einträge nur für eigene Gewohnheiten
create policy "habit_logs_select_own" on public.habit_logs
  for select to authenticated using (user_id = (select auth.uid()));
create policy "habit_logs_insert_own" on public.habit_logs
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.habits h
      where h.id = habit_id and h.user_id = (select auth.uid())
    )
  );
create policy "habit_logs_delete_own" on public.habit_logs
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "focus_sessions_select_own" on public.focus_sessions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "focus_sessions_insert_own" on public.focus_sessions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "focus_sessions_delete_own" on public.focus_sessions
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Tabellenrechte
-- ---------------------------------------------------------------------------
revoke all on public.user_settings, public.habits, public.habit_logs, public.focus_sessions from anon;
revoke all on public.user_settings, public.habits, public.habit_logs, public.focus_sessions from authenticated;

grant select, insert on public.user_settings to authenticated;
grant update (display_name, city, latitude, longitude) on public.user_settings to authenticated;
grant select, insert, update, delete on public.habits to authenticated;
grant select, insert, delete on public.habit_logs to authenticated;
grant select, insert, delete on public.focus_sessions to authenticated;
