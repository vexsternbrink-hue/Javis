import { z } from "zod";

// Gemeinsame Eingabe-Regeln für die REST-API und die KI-Tools.
// Die Datenbank prüft dieselben Grenzen noch einmal (CHECK-Constraints).

export const LIMITS = {
  messageChars: 4000,
  taskTitle: 300,
  taskDetails: 5000,
  noteTitle: 200,
  noteContent: 20000,
  memoryContent: 1000,
  maxMemories: 100,
} as const;

const trimmed = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} darf nicht leer sein`)
    .max(max, `${label} ist zu lang (max. ${max} Zeichen)`);

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum muss im Format JJJJ-MM-TT sein")
  .refine((value) => {
    const d = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
  }, "Ungültiges Datum");

export const uuid = z.uuid("Ungültige ID");

export const taskCreateSchema = z.object({
  title: trimmed(LIMITS.taskTitle, "Titel"),
  details: z.string().trim().max(LIMITS.taskDetails, "Details sind zu lang").nullish(),
  due_date: isoDate.nullish(),
});

export const taskUpdateFields = {
  title: trimmed(LIMITS.taskTitle, "Titel").optional(),
  details: z.string().trim().max(LIMITS.taskDetails, "Details sind zu lang").nullable().optional(),
  due_date: isoDate.nullable().optional(),
  done: z.boolean().optional(),
};

const hasTaskChange = (v: Record<string, unknown>) =>
  ["title", "details", "due_date", "done"].some((k) => v[k] !== undefined);

export const taskUpdateSchema = z
  .object(taskUpdateFields)
  .refine(hasTaskChange, "Keine Änderung angegeben");

export const taskUpdateWithIdSchema = z
  .object({ id: uuid, ...taskUpdateFields })
  .refine(hasTaskChange, "Keine Änderung angegeben");

export const noteCreateSchema = z.object({
  title: trimmed(LIMITS.noteTitle, "Titel"),
  content: z.string().max(LIMITS.noteContent, "Notiz ist zu lang").default(""),
});

export const noteUpdateFields = {
  title: trimmed(LIMITS.noteTitle, "Titel").optional(),
  content: z.string().max(LIMITS.noteContent, "Notiz ist zu lang").optional(),
};

const hasNoteChange = (v: { title?: string; content?: string }) =>
  v.title !== undefined || v.content !== undefined;

export const noteUpdateSchema = z.object(noteUpdateFields).refine(hasNoteChange, "Keine Änderung angegeben");

export const noteUpdateWithIdSchema = z
  .object({ id: uuid, ...noteUpdateFields })
  .refine(hasNoteChange, "Keine Änderung angegeben");

export const memorySchema = z.object({
  content: trimmed(LIMITS.memoryContent, "Erinnerung"),
});

export const chatRequestSchema = z.union([
  z.object({
    conversationId: uuid.optional(),
    message: trimmed(LIMITS.messageChars, "Nachricht"),
  }),
  z.object({
    conversationId: uuid,
    continue: z.literal(true),
  }),
]);

export const actionDecisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
});

export const conversationPatchSchema = z.object({
  title: trimmed(200, "Titel"),
});

export type TaskCreate = z.infer<typeof taskCreateSchema>;
export type TaskUpdate = z.infer<typeof taskUpdateSchema>;
export type NoteCreate = z.infer<typeof noteCreateSchema>;
export type NoteUpdate = z.infer<typeof noteUpdateSchema>;
