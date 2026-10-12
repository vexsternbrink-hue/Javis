import "server-only";
import type { ServerSupabase } from "../supabase/server";
import type { HabitCreate, HabitUpdate } from "../validation";
import type { Habit, HabitWithLogs } from "./types";
import { DataError, dbError } from "./errors";

const COLUMNS = "id, title, emoji, target_per_week, archived, created_at, updated_at";
export const MAX_HABITS = 30;

/** Gewohnheiten samt erledigten Tagen ab `sinceDay` (JJJJ-MM-TT). */
export async function listHabits(
  sb: ServerSupabase,
  sinceDay: string,
  options: { includeArchived?: boolean } = {},
): Promise<HabitWithLogs[]> {
  let query = sb.from("habits").select(COLUMNS);
  if (!options.includeArchived) query = query.eq("archived", false);
  const [habits, logs] = await Promise.all([
    query.order("created_at", { ascending: true }).limit(MAX_HABITS * 2),
    sb.from("habit_logs").select("habit_id, day").gte("day", sinceDay).order("day", { ascending: true }).limit(5000),
  ]);
  if (habits.error) dbError("Laden der Gewohnheiten", habits.error);
  if (logs.error) dbError("Laden der Gewohnheiten", logs.error);
  const byHabit = new Map<string, string[]>();
  for (const log of logs.data ?? []) {
    const list = byHabit.get(log.habit_id as string) ?? [];
    list.push(log.day as string);
    byHabit.set(log.habit_id as string, list);
  }
  return (habits.data as Habit[]).map((h) => ({ ...h, days: byHabit.get(h.id) ?? [] }));
}

export async function getHabit(sb: ServerSupabase, id: string): Promise<Habit | null> {
  const { data, error } = await sb.from("habits").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) dbError("Laden der Gewohnheit", error);
  return (data as Habit | null) ?? null;
}

export async function createHabit(sb: ServerSupabase, input: HabitCreate): Promise<Habit> {
  const { count, error: countError } = await sb
    .from("habits")
    .select("id", { count: "exact", head: true })
    .eq("archived", false);
  if (countError) dbError("Zählen der Gewohnheiten", countError);
  if ((count ?? 0) >= MAX_HABITS) throw new DataError(`Maximal ${MAX_HABITS} aktive Gewohnheiten möglich.`, 400);
  const { data, error } = await sb
    .from("habits")
    .insert({ title: input.title, emoji: input.emoji || null, target_per_week: input.target_per_week })
    .select(COLUMNS)
    .single();
  if (error) dbError("Anlegen der Gewohnheit", error);
  return data as Habit;
}

export async function updateHabit(sb: ServerSupabase, id: string, patch: HabitUpdate): Promise<Habit | null> {
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.emoji !== undefined) update.emoji = patch.emoji || null;
  if (patch.target_per_week !== undefined) update.target_per_week = patch.target_per_week;
  if (patch.archived !== undefined) update.archived = patch.archived;
  const { data, error } = await sb.from("habits").update(update).eq("id", id).select(COLUMNS).maybeSingle();
  if (error) dbError("Ändern der Gewohnheit", error);
  return (data as Habit | null) ?? null;
}

export async function deleteHabit(sb: ServerSupabase, id: string): Promise<boolean> {
  const { data, error } = await sb.from("habits").delete().eq("id", id).select("id");
  if (error) dbError("Löschen der Gewohnheit", error);
  return (data?.length ?? 0) > 0;
}

/** Markiert einen Tag als erledigt (done) oder entfernt die Markierung. Idempotent. */
export async function setHabitDay(sb: ServerSupabase, habitId: string, day: string, done: boolean): Promise<void> {
  if (done) {
    const { error } = await sb
      .from("habit_logs")
      .upsert({ habit_id: habitId, day }, { onConflict: "habit_id,day", ignoreDuplicates: true });
    if (error) dbError("Speichern des Eintrags", error);
  } else {
    const { error } = await sb.from("habit_logs").delete().eq("habit_id", habitId).eq("day", day);
    if (error) dbError("Entfernen des Eintrags", error);
  }
}
