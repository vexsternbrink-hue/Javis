// Anzeige-Informationen zu den Tools – wird auch im Browser verwendet.

export type ToolKind = "read" | "write";

export const TOOL_META: Record<string, { label: string; kind: ToolKind }> = {
  list_tasks: { label: "Aufgaben ansehen", kind: "read" },
  search_notes: { label: "Notizen durchsuchen", kind: "read" },
  get_note: { label: "Notiz lesen", kind: "read" },
  create_task: { label: "Aufgabe anlegen", kind: "write" },
  update_task: { label: "Aufgabe ändern", kind: "write" },
  delete_task: { label: "Aufgabe löschen", kind: "write" },
  create_note: { label: "Notiz anlegen", kind: "write" },
  update_note: { label: "Notiz ändern", kind: "write" },
  delete_note: { label: "Notiz löschen", kind: "write" },
  save_memory: { label: "Erinnerung speichern", kind: "write" },
  list_emails: { label: "Posteingang ansehen", kind: "read" },
  search_emails: { label: "E-Mails durchsuchen", kind: "read" },
  read_email: { label: "E-Mail lesen", kind: "read" },
  list_events: { label: "Termine ansehen", kind: "read" },
  create_event: { label: "Termin anlegen", kind: "write" },
  get_weather: { label: "Wetter abrufen", kind: "read" },
  list_habits: { label: "Gewohnheiten ansehen", kind: "read" },
  create_habit: { label: "Gewohnheit anlegen", kind: "write" },
  log_habit: { label: "Gewohnheit abhaken", kind: "write" },
  get_activity_stats: { label: "Statistik ansehen", kind: "read" },
};

export const FIELD_LABELS: Record<string, string> = {
  title: "Titel",
  details: "Details",
  due_date: "Fällig am",
  done: "Erledigt",
  content: "Inhalt",
  query: "Suchbegriff",
  status: "Filter",
  limit: "Anzahl",
  all_day: "Ganztägig",
  start: "Beginn",
  end: "Ende",
  location: "Ort",
  notes: "Notiz",
  calendar: "Kalender",
  priority: "Priorität",
  city: "Ort",
  days: "Tage",
  emoji: "Symbol",
  target_per_week: "Wochenziel",
  day: "Tag",
};

export function toolLabel(name: string): string {
  return TOOL_META[name]?.label ?? name;
}
