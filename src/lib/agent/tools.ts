import "server-only";
import { z } from "zod";
import type { ServerSupabase } from "../supabase/server";
import type { ToolSpec } from "../ai/types";
import {
  LIMITS,
  memorySchema,
  noteCreateSchema,
  noteUpdateWithIdSchema,
  taskCreateSchema,
  taskUpdateWithIdSchema,
  uuid,
} from "../validation";
import { createTask, deleteTask, getTask, listTasks, updateTask } from "../data/tasks";
import { createNote, deleteNote, getNote, searchNotes, updateNote } from "../data/notes";
import { createMemory } from "../data/memories";
import { DataError } from "../data/errors";
import { TOOL_META, type ToolKind } from "./tool-meta";

// ---------------------------------------------------------------------------
// Tool-Registry
//
// Jedes Tool hat ein Zod-Schema. Eingaben der KI werden IMMER serverseitig
// damit geprüft – zuerst beim Vorschlag und noch einmal direkt vor der
// Ausführung. Alle Datenbankzugriffe laufen über den Supabase-Client des
// angemeldeten Nutzers, d. h. RLS verhindert Zugriffe auf fremde Daten.
// Tools haben keinen Zugriff auf Shell, Dateisystem, URLs oder externe Dienste.
// ---------------------------------------------------------------------------

export type ToolOutcome =
  | { ok: true; summary: string; data: unknown }
  | { ok: false; error: string };

export type PrepareOutcome = { ok: true; preview: Record<string, unknown> } | { ok: false; error: string };

type ToolDefinition<S extends z.ZodType = z.ZodType> = {
  name: string;
  description: string;
  schema: S;
  kind: ToolKind;
  /** Nur für schreibende Tools: prüft das Ziel und erzeugt eine Vorschau für die Bestätigung. */
  prepare?: (sb: ServerSupabase, input: z.infer<S>) => Promise<PrepareOutcome>;
  execute: (sb: ServerSupabase, input: z.infer<S>) => Promise<ToolOutcome>;
};

function defineTool<S extends z.ZodType>(def: ToolDefinition<S>): ToolDefinition {
  return def as unknown as ToolDefinition;
}

const snippet = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

const taskForModel = (t: { id: string; title: string; details: string | null; due_date: string | null; done: boolean }) => ({
  id: t.id,
  title: t.title,
  details: t.details ? snippet(t.details, 500) : null,
  due_date: t.due_date,
  done: t.done,
});

const TOOLS: ToolDefinition[] = [
  defineTool({
    name: "list_tasks",
    kind: "read",
    description:
      "Listet die Aufgaben des Nutzers auf (mit ID, Titel, Details, Fälligkeitsdatum, Status). Nutze dies, wenn der Nutzer nach seinen Aufgaben fragt oder bevor du eine Aufgabe änderst oder löschst.",
    schema: z.object({
      status: z.enum(["open", "done", "all"]).default("open").describe("open = offen, done = erledigt, all = alle"),
      limit: z.number().int().min(1).max(50).default(30),
    }),
    async execute(sb, input) {
      const tasks = await listTasks(sb, input.status, input.limit);
      return {
        ok: true,
        summary: `${tasks.length} Aufgabe(n) gelesen`,
        data: { count: tasks.length, tasks: tasks.map(taskForModel) },
      };
    },
  }),
  defineTool({
    name: "search_notes",
    kind: "read",
    description:
      "Durchsucht Titel und Inhalt der Notizen des Nutzers (Teilwort-Suche). Leerer Suchbegriff liefert die neuesten Notizen. Liefert ID, Titel und Ausschnitt.",
    schema: z.object({
      query: z.string().max(100).default("").describe("Suchbegriff, z. B. 'Mathe'"),
    }),
    async execute(sb, input) {
      const notes = await searchNotes(sb, input.query, 10);
      return {
        ok: true,
        summary: `${notes.length} Notiz(en) gefunden`,
        data: {
          count: notes.length,
          notes: notes.map((n) => ({ id: n.id, title: n.title, excerpt: snippet(n.content, 300), updated_at: n.updated_at })),
        },
      };
    },
  }),
  defineTool({
    name: "get_note",
    kind: "read",
    description: "Liest den vollständigen Inhalt einer Notiz anhand ihrer ID.",
    schema: z.object({ id: uuid }),
    async execute(sb, input) {
      const note = await getNote(sb, input.id);
      if (!note) return { ok: false, error: "Notiz nicht gefunden." };
      return {
        ok: true,
        summary: `Notiz „${snippet(note.title, 60)}“ gelesen`,
        data: { id: note.id, title: note.title, content: snippet(note.content, 8000), updated_at: note.updated_at },
      };
    },
  }),
  defineTool({
    name: "create_task",
    kind: "write",
    description:
      "Schlägt vor, eine neue Aufgabe anzulegen (wird erst nach Bestätigung durch den Nutzer ausgeführt). due_date optional im Format JJJJ-MM-TT.",
    schema: taskCreateSchema,
    async prepare() {
      return { ok: true, preview: {} };
    },
    async execute(sb, input) {
      const task = await createTask(sb, input);
      return { ok: true, summary: `Aufgabe „${snippet(task.title, 60)}“ angelegt`, data: { task: taskForModel(task) } };
    },
  }),
  defineTool({
    name: "update_task",
    kind: "write",
    description:
      "Schlägt vor, eine bestehende Aufgabe zu ändern oder abzuhaken (done: true). Nur die angegebenen Felder werden geändert; due_date: null entfernt das Datum. Wird erst nach Bestätigung ausgeführt.",
    schema: taskUpdateWithIdSchema,
    async prepare(sb, input) {
      const task = await getTask(sb, input.id);
      if (!task) return { ok: false, error: "Aufgabe nicht gefunden." };
      return { ok: true, preview: { target: { title: task.title, due_date: task.due_date, done: task.done } } };
    },
    async execute(sb, input) {
      const { id, ...patch } = input;
      const task = await updateTask(sb, id, patch);
      if (!task) return { ok: false, error: "Aufgabe nicht gefunden." };
      return { ok: true, summary: `Aufgabe „${snippet(task.title, 60)}“ geändert`, data: { task: taskForModel(task) } };
    },
  }),
  defineTool({
    name: "delete_task",
    kind: "write",
    description: "Schlägt vor, eine Aufgabe endgültig zu löschen. Wird erst nach Bestätigung ausgeführt.",
    schema: z.object({ id: uuid }),
    async prepare(sb, input) {
      const task = await getTask(sb, input.id);
      if (!task) return { ok: false, error: "Aufgabe nicht gefunden." };
      return { ok: true, preview: { target: { title: task.title, due_date: task.due_date, done: task.done } } };
    },
    async execute(sb, input) {
      const deleted = await deleteTask(sb, input.id);
      if (!deleted) return { ok: false, error: "Aufgabe nicht gefunden." };
      return { ok: true, summary: "Aufgabe gelöscht", data: { deleted: true } };
    },
  }),
  defineTool({
    name: "create_note",
    kind: "write",
    description: "Schlägt vor, eine neue Notiz anzulegen (Titel und Inhalt). Wird erst nach Bestätigung ausgeführt.",
    schema: noteCreateSchema,
    async prepare() {
      return { ok: true, preview: {} };
    },
    async execute(sb, input) {
      const note = await createNote(sb, input);
      return {
        ok: true,
        summary: `Notiz „${snippet(note.title, 60)}“ angelegt`,
        data: { note: { id: note.id, title: note.title } },
      };
    },
  }),
  defineTool({
    name: "update_note",
    kind: "write",
    description:
      "Schlägt vor, Titel und/oder Inhalt einer Notiz zu ersetzen. content ersetzt den gesamten Inhalt – lies die Notiz vorher mit get_note, wenn du nur etwas ergänzen willst. Wird erst nach Bestätigung ausgeführt.",
    schema: noteUpdateWithIdSchema,
    async prepare(sb, input) {
      const note = await getNote(sb, input.id);
      if (!note) return { ok: false, error: "Notiz nicht gefunden." };
      return { ok: true, preview: { target: { title: note.title } } };
    },
    async execute(sb, input) {
      const { id, ...patch } = input;
      const note = await updateNote(sb, id, patch);
      if (!note) return { ok: false, error: "Notiz nicht gefunden." };
      return { ok: true, summary: `Notiz „${snippet(note.title, 60)}“ geändert`, data: { note: { id: note.id, title: note.title } } };
    },
  }),
  defineTool({
    name: "delete_note",
    kind: "write",
    description: "Schlägt vor, eine Notiz endgültig zu löschen. Wird erst nach Bestätigung ausgeführt.",
    schema: z.object({ id: uuid }),
    async prepare(sb, input) {
      const note = await getNote(sb, input.id);
      if (!note) return { ok: false, error: "Notiz nicht gefunden." };
      return { ok: true, preview: { target: { title: note.title } } };
    },
    async execute(sb, input) {
      const deleted = await deleteNote(sb, input.id);
      if (!deleted) return { ok: false, error: "Notiz nicht gefunden." };
      return { ok: true, summary: "Notiz gelöscht", data: { deleted: true } };
    },
  }),
  defineTool({
    name: "save_memory",
    kind: "write",
    description: `Schlägt vor, eine dauerhafte Erinnerung über den Nutzer zu speichern (z. B. Name, Interessen, Antwortstil; max. ${LIMITS.memoryContent} Zeichen, ein kurzer Satz). Nur verwenden, wenn der Nutzer das Speichern wünscht oder zustimmt. Wird erst nach Bestätigung ausgeführt.`,
    schema: memorySchema,
    async prepare() {
      return { ok: true, preview: {} };
    },
    async execute(sb, input) {
      const memory = await createMemory(sb, input.content);
      return { ok: true, summary: "Erinnerung gespeichert", data: { memory: { id: memory.id, content: memory.content } } };
    },
  }),
];

const BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

// Sicherheitsnetz: Die Einstufung lesend/schreibend muss mit der Anzeige übereinstimmen.
for (const tool of TOOLS) {
  if (TOOL_META[tool.name]?.kind !== tool.kind) {
    throw new Error(`Tool-Metadaten für ${tool.name} fehlen oder sind inkonsistent.`);
  }
  if (tool.kind === "write" && !tool.prepare) {
    throw new Error(`Schreibendes Tool ${tool.name} braucht prepare().`);
  }
}

export function getTool(name: string): ToolDefinition | undefined {
  return BY_NAME.get(name);
}

export function toolRequiresConfirmation(name: string): boolean {
  // Unbekannte Tools gelten sicherheitshalber als schreibend.
  return getTool(name)?.kind !== "read";
}

function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

export const TOOL_SPECS: ToolSpec[] = TOOLS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  inputSchema: toJsonSchema(tool.schema),
}));

export type ValidatedCall =
  | { ok: true; tool: ToolDefinition; input: Record<string, unknown> }
  | { ok: false; error: string };

/** Prüft Toolname und Argumente gegen das Schema. */
export function validateToolCall(name: string, rawInput: unknown): ValidatedCall {
  const tool = getTool(name);
  if (!tool) return { ok: false, error: `Unbekanntes Tool: ${name}` };
  const parsed = tool.schema.safeParse(rawInput);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.length ? `${issue.path.join(".")}: ` : "";
    return { ok: false, error: `Ungültige Argumente – ${path}${issue?.message ?? "unbekannter Fehler"}` };
  }
  return { ok: true, tool, input: parsed.data as Record<string, unknown> };
}

async function guard<T>(fn: () => Promise<T>, fallback: (message: string) => T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof DataError) return fallback(error.message);
    console.error("Tool-Fehler:", error instanceof Error ? error.name : "unbekannt");
    return fallback("Interner Fehler bei der Ausführung.");
  }
}

export async function prepareTool(sb: ServerSupabase, tool: ToolDefinition, input: Record<string, unknown>) {
  if (!tool.prepare) return { ok: true, preview: {} } as PrepareOutcome;
  const prepare = tool.prepare;
  return guard<PrepareOutcome>(() => prepare(sb, input), (error) => ({ ok: false, error }));
}

/**
 * Führt ein Tool aus. Die Eingabe wird unmittelbar vorher NOCHMALS validiert,
 * auch wenn sie aus der Datenbank (freigegebene Aktion) stammt.
 */
export async function executeTool(sb: ServerSupabase, name: string, rawInput: unknown): Promise<ToolOutcome> {
  const validated = validateToolCall(name, rawInput);
  if (!validated.ok) return { ok: false, error: validated.error };
  const { tool, input } = validated;
  return guard<ToolOutcome>(() => tool.execute(sb, input), (error) => ({ ok: false, error }));
}

const MAX_RESULT_CHARS = 12000;

/** Formatiert ein Tool-Ergebnis für die KI. */
export function outcomeToResultContent(outcome: ToolOutcome): { content: string; isError: boolean } {
  const payload = outcome.ok
    ? { status: "erfolgreich", ergebnis: outcome.data }
    : { status: "fehlgeschlagen", fehler: outcome.error };
  let content = JSON.stringify(payload);
  if (content.length > MAX_RESULT_CHARS) content = `${content.slice(0, MAX_RESULT_CHARS)}… [gekürzt]`;
  return { content, isError: !outcome.ok };
}
