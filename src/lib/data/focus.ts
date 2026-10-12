import "server-only";
import type { ServerSupabase } from "../supabase/server";
import type { FocusCreate } from "../validation";
import type { FocusSession } from "./types";
import { dbError } from "./errors";

const COLUMNS = "id, label, minutes, ended_at";

export async function listFocusSessions(sb: ServerSupabase, since: Date, limit = 500): Promise<FocusSession[]> {
  const { data, error } = await sb
    .from("focus_sessions")
    .select(COLUMNS)
    .gte("ended_at", since.toISOString())
    .order("ended_at", { ascending: false })
    .limit(limit);
  if (error) dbError("Laden der Fokus-Einheiten", error);
  return data as FocusSession[];
}

export async function createFocusSession(sb: ServerSupabase, input: FocusCreate): Promise<FocusSession> {
  const { data, error } = await sb
    .from("focus_sessions")
    .insert({ minutes: input.minutes, label: input.label || null })
    .select(COLUMNS)
    .single();
  if (error) dbError("Speichern der Fokus-Einheit", error);
  return data as FocusSession;
}

export async function deleteFocusSession(sb: ServerSupabase, id: string): Promise<boolean> {
  const { data, error } = await sb.from("focus_sessions").delete().eq("id", id).select("id");
  if (error) dbError("Löschen der Fokus-Einheit", error);
  return (data?.length ?? 0) > 0;
}
