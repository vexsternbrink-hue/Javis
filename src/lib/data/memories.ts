import "server-only";
import type { ServerSupabase } from "../supabase/server";
import { LIMITS } from "../validation";
import type { Memory } from "./types";
import { DataError, dbError } from "./errors";

const COLUMNS = "id, content, created_at, updated_at";

export async function listMemories(sb: ServerSupabase): Promise<Memory[]> {
  const { data, error } = await sb
    .from("memories")
    .select(COLUMNS)
    .order("created_at", { ascending: true })
    .limit(LIMITS.maxMemories);
  if (error) dbError("Laden der Erinnerungen", error);
  return data as Memory[];
}

export async function createMemory(sb: ServerSupabase, content: string): Promise<Memory> {
  const { count, error: countError } = await sb
    .from("memories")
    .select("id", { count: "exact", head: true });
  if (countError) dbError("Zählen der Erinnerungen", countError);
  if ((count ?? 0) >= LIMITS.maxMemories) {
    throw new DataError(`Maximal ${LIMITS.maxMemories} Erinnerungen möglich. Bitte lösche zuerst alte.`, 400);
  }
  const { data, error } = await sb.from("memories").insert({ content }).select(COLUMNS).single();
  if (error) dbError("Speichern der Erinnerung", error);
  return data as Memory;
}

export async function updateMemory(sb: ServerSupabase, id: string, content: string): Promise<Memory | null> {
  const { data, error } = await sb
    .from("memories")
    .update({ content })
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) dbError("Ändern der Erinnerung", error);
  return (data as Memory | null) ?? null;
}

export async function deleteMemory(sb: ServerSupabase, id: string): Promise<boolean> {
  const { data, error } = await sb.from("memories").delete().eq("id", id).select("id");
  if (error) dbError("Löschen der Erinnerung", error);
  return (data?.length ?? 0) > 0;
}
