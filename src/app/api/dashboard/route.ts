import { requireApiUser } from "@/lib/auth";
import { jsonOk } from "@/lib/http";
import { withDataErrors } from "@/lib/route-helpers";
import { listCompletedSince, listTasks } from "@/lib/data/tasks";
import { listHabits } from "@/lib/data/habits";
import { listFocusSessions } from "@/lib/data/focus";
import { getSettings } from "@/lib/data/settings";
import { getSystemStatus } from "@/lib/status";
import { addDays } from "@/lib/habits";
import { todayInTimezone } from "@/lib/server-dates";

// Übersicht für das Command Center – nur echte Daten, keine Schätzungen.
export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const sb = auth.supabase;
  const since = new Date(Date.now() - 15 * 86400_000);

  return withDataErrors(async () => {
    const [tasks, conversations, notes, memories, completed, habits, focus, settings] = await Promise.all([
      listTasks(sb, "open", 200),
      sb.from("conversations").select("id, title, updated_at").order("updated_at", { ascending: false }).limit(6),
      sb.from("notes").select("id", { count: "exact", head: true }),
      sb.from("memories").select("id", { count: "exact", head: true }),
      listCompletedSince(sb, since),
      listHabits(sb, addDays(todayInTimezone(), -190)),
      listFocusSessions(sb, since),
      getSettings(sb),
    ]);
    return jsonOk({
      tasks: tasks.slice(0, 50),
      openTaskCount: tasks.length,
      recentConversations: conversations.data ?? [],
      noteCount: notes.count ?? 0,
      memoryCount: memories.count ?? 0,
      completedAt: completed,
      habits,
      focusSessions: focus.map((f) => ({ minutes: f.minutes, ended_at: f.ended_at })),
      displayName: settings.display_name,
      weatherConfigured: settings.latitude !== null,
      status: getSystemStatus(auth.user.email),
    });
  });
}
