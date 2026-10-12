// Datumshelfer für die Anzeige (lokale Zeit des Browsers).

export function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export type DueState = "overdue" | "today" | "upcoming" | null;

export function dueState(dueDate: string | null, done: boolean, today = todayIso()): DueState {
  if (!dueDate || done) return null;
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "today";
  return "upcoming";
}
