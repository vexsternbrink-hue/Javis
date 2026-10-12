import { requireApiUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";

export const maxDuration = 30;

// [Tabelle, Spalten, eindeutige Sortierung für seitenweises Laden]
const TABLES: Array<[string, string, string]> = [
  ["conversations", "id, title, created_at, updated_at", "id"],
  ["messages", "id, conversation_id, role, display_text, content, created_at", "id"],
  ["agent_actions", "id, conversation_id, tool_name, input, status, result, created_at, resolved_at", "id"],
  ["tasks", "id, title, details, due_date, priority, done, completed_at, created_at, updated_at", "id"],
  ["notes", "id, title, content, pinned, created_at, updated_at", "id"],
  ["memories", "id, content, created_at, updated_at", "id"],
  ["habits", "id, title, emoji, target_per_week, archived, created_at, updated_at", "id"],
  ["habit_logs", "habit_id, day, created_at", "habit_id,day"],
  ["focus_sessions", "id, label, minutes, ended_at", "id"],
  ["user_settings", "display_name, city, latitude, longitude, updated_at", "updated_at"],
];

const PAGE = 1000; // Supabase liefert standardmäßig höchstens 1000 Zeilen pro Abfrage
const MAX_ROWS = 20000;

/** Lädt alle eigenen Daten als JSON-Datei herunter (RLS liefert nur eigene Zeilen). */
export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;

  const data: Record<string, unknown[]> = {};
  for (const [table, columns, order] of TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; from < MAX_ROWS; from += PAGE) {
      let query = auth.supabase.from(table).select(columns);
      for (const column of order.split(",")) query = query.order(column, { ascending: true });
      const { data: page, error } = await query.range(from, from + PAGE - 1);
      if (error) {
        console.error("Export-Fehler:", table, error.code);
        return jsonError(500, "Export fehlgeschlagen. Bitte später erneut versuchen.");
      }
      rows.push(...(page ?? []));
      if (!page || page.length < PAGE) break;
    }
    data[table] = rows;
  }

  const exportedAt = new Date().toISOString();
  const body = JSON.stringify({ app: "Jarvis", exportedAt, account: auth.user.email ?? null, data }, null, 2);
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="jarvis-export-${exportedAt.slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
