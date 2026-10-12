import { requireApiUser } from "@/lib/auth";
import { jsonOk } from "@/lib/http";
import { withDataErrors } from "@/lib/route-helpers";
import { listTasks } from "@/lib/data/tasks";
import { getSystemStatus } from "@/lib/status";

// Übersicht für das Command Center – nur echte Daten, keine Schätzungen.
export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const sb = auth.supabase;

  return withDataErrors(async () => {
    const [tasks, conversations, notes, memories] = await Promise.all([
      listTasks(sb, "open", 200),
      sb.from("conversations").select("id, title, updated_at").order("updated_at", { ascending: false }).limit(5),
      sb.from("notes").select("id", { count: "exact", head: true }),
      sb.from("memories").select("id", { count: "exact", head: true }),
    ]);
    return jsonOk({
      tasks: tasks.slice(0, 50),
      openTaskCount: tasks.length,
      recentConversations: conversations.data ?? [],
      noteCount: notes.count ?? 0,
      memoryCount: memories.count ?? 0,
      status: getSystemStatus(auth.user.email),
    });
  });
}
