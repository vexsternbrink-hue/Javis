import { requireApiUser } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const { data, error } = await auth.supabase
    .from("conversations")
    .select("id, title, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) return jsonError(500, "Chats konnten nicht geladen werden.");
  return jsonOk({ conversations: data });
}
