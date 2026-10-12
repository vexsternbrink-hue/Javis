import "server-only";
import type { ServerSupabase } from "../supabase/server";
import type { NoteCreate, NoteUpdate } from "../validation";
import type { Note } from "./types";
import { dbError } from "./errors";

const COLUMNS = "id, title, content, created_at, updated_at";

export async function listNotes(sb: ServerSupabase, limit = 500): Promise<Note[]> {
  const { data, error } = await sb
    .from("notes")
    .select(COLUMNS)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) dbError("Laden der Notizen", error);
  return data as Note[];
}

/**
 * Baut ein sicheres ILIKE-Muster. Zeichen, die als Platzhalter (% _ *) oder
 * als PostgREST-Steuerzeichen wirken könnten, werden entfernt.
 */
export function toIlikePattern(query: string): string | null {
  const cleaned = query
    .slice(0, 100)
    .replace(/[\\%_*,()"'.:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? `%${cleaned}%` : null;
}

export async function searchNotes(sb: ServerSupabase, query: string, limit = 10): Promise<Note[]> {
  const pattern = toIlikePattern(query);
  if (!pattern) return listNotes(sb, limit);
  const { data, error } = await sb
    .from("notes")
    .select(COLUMNS)
    .or(`title.ilike."${pattern}",content.ilike."${pattern}"`)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) dbError("Durchsuchen der Notizen", error);
  return data as Note[];
}

export async function getNote(sb: ServerSupabase, id: string): Promise<Note | null> {
  const { data, error } = await sb.from("notes").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) dbError("Laden der Notiz", error);
  return (data as Note | null) ?? null;
}

export async function createNote(sb: ServerSupabase, input: NoteCreate): Promise<Note> {
  const { data, error } = await sb
    .from("notes")
    .insert({ title: input.title, content: input.content ?? "" })
    .select(COLUMNS)
    .single();
  if (error) dbError("Anlegen der Notiz", error);
  return data as Note;
}

export async function updateNote(sb: ServerSupabase, id: string, patch: NoteUpdate): Promise<Note | null> {
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.content !== undefined) update.content = patch.content;
  const { data, error } = await sb.from("notes").update(update).eq("id", id).select(COLUMNS).maybeSingle();
  if (error) dbError("Ändern der Notiz", error);
  return (data as Note | null) ?? null;
}

export async function deleteNote(sb: ServerSupabase, id: string): Promise<boolean> {
  const { data, error } = await sb.from("notes").delete().eq("id", id).select("id");
  if (error) dbError("Löschen der Notiz", error);
  return (data?.length ?? 0) > 0;
}
