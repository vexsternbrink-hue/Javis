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

const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Zeit muss im Format JJJJ-MM-TTTHH:MM sein");

export const eventCreateSchema = z
  .object({
    title: trimmed(200, "Titel"),
    all_day: z.boolean().default(false),
    start: z.string(),
    end: z.string(),
    location: z.string().trim().max(200, "Ort ist zu lang").nullish(),
    notes: z.string().trim().max(2000, "Notiz ist zu lang").nullish(),
    calendar: z.string().trim().max(100).nullish(),
  })
  .superRefine((v, ctx) => {
    const format = v.all_day ? isoDate : localDateTime;
    for (const key of ["start", "end"] as const) {
      const r = format.safeParse(v[key]);
      if (!r.success) ctx.addIssue({ code: "custom", path: [key], message: r.error.issues[0]?.message ?? "Ungültig" });
    }
    if (v.end < v.start) ctx.addIssue({ code: "custom", path: ["end"], message: "Ende liegt vor dem Beginn" });
  });

export type EventCreate = z.infer<typeof eventCreateSchema>;
