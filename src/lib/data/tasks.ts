import "server-only";
import type { ServerSupabase } from "../supabase/server";
import type { TaskCreate, TaskUpdate } from "../validation";
import type { Task } from "./types";
import { dbError } from "./errors";

const COLUMNS = "id, title, details, due_date, done, completed_at, created_at, updated_at";

export type TaskFilter = "open" | "done" | "all";

export async function listTasks(sb: ServerSupabase, filter: TaskFilter = "all", limit = 500): Promise<Task[]> {
  let query = sb.from("tasks").select(COLUMNS);
  if (filter === "open") query = query.eq("done", false);
  if (filter === "done") query = query.eq("done", true);
  const { data, error } = await query
    .order("done", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) dbError("Laden der Aufgaben", error);
  return data as Task[];
}

export async function getTask(sb: ServerSupabase, id: string): Promise<Task | null> {
  const { data, error } = await sb.from("tasks").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) dbError("Laden der Aufgabe", error);
  return (data as Task | null) ?? null;
}

export async function createTask(sb: ServerSupabase, input: TaskCreate): Promise<Task> {
  const { data, error } = await sb
    .from("tasks")
    .insert({ title: input.title, details: input.details || null, due_date: input.due_date ?? null })
    .select(COLUMNS)
    .single();
  if (error) dbError("Anlegen der Aufgabe", error);
  return data as Task;
}

export async function updateTask(sb: ServerSupabase, id: string, patch: TaskUpdate): Promise<Task | null> {
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.details !== undefined) update.details = patch.details || null;
  if (patch.due_date !== undefined) update.due_date = patch.due_date;
  if (patch.done !== undefined) {
    update.done = patch.done;
    update.completed_at = patch.done ? new Date().toISOString() : null;
  }
  const { data, error } = await sb.from("tasks").update(update).eq("id", id).select(COLUMNS).maybeSingle();
  if (error) dbError("Ändern der Aufgabe", error);
  return (data as Task | null) ?? null;
}

export async function deleteTask(sb: ServerSupabase, id: string): Promise<boolean> {
  const { data, error } = await sb.from("tasks").delete().eq("id", id).select("id");
  if (error) dbError("Löschen der Aufgabe", error);
  return (data?.length ?? 0) > 0;
}
