import { requireApiUser } from "@/lib/auth";
import { isUuid, jsonError, jsonOk, parseJsonBody } from "@/lib/http";
import { conversationPatchSchema } from "@/lib/validation";
import { buildDisplayItems, getConversation, loadActionsForMessages, loadMessages } from "@/lib/agent/store";
import { getOpenToolCalls } from "@/lib/agent/history";
import { DataError } from "@/lib/data/errors";

function handle(error: unknown) {
  if (error instanceof DataError) return jsonError(error.status, error.message);
  throw error;
}

export async function GET(request: Request, ctx: RouteContext<"/api/conversations/[id]">) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(400, "Ungültige ID.");
  try {
    const conversation = await getConversation(auth.supabase, id);
    if (!conversation) return jsonError(404, "Chat nicht gefunden.");
    const messages = await loadMessages(auth.supabase, id);
    const assistantIds = messages.filter((m) => m.role === "assistant").map((m) => m.id);
    const actions = await loadActionsForMessages(auth.supabase, assistantIds);
    const open = getOpenToolCalls(messages);
    const openActions = open ? actions.filter((a) => a.message_id === open.messageId) : [];
    return jsonOk({
      conversation,
      items: buildDisplayItems(messages, actions),
      // Alle Vorschläge sind entschieden, aber die KI hat noch nicht geantwortet.
      needsContinue: open !== null && openActions.every((a) => a.status !== "pending" && a.status !== "approved"),
    });
  } catch (error) {
    return handle(error);
  }
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/conversations/[id]">) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(400, "Ungültige ID.");
  const body = await parseJsonBody(request, conversationPatchSchema);
  if (body instanceof Response) return body;
  const { data, error } = await auth.supabase
    .from("conversations")
    .update({ title: body.title })
    .eq("id", id)
    .select("id, title, created_at, updated_at")
    .maybeSingle();
  if (error) return jsonError(500, "Chat konnte nicht umbenannt werden.");
  if (!data) return jsonError(404, "Chat nicht gefunden.");
  return jsonOk({ conversation: data });
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/conversations/[id]">) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(400, "Ungültige ID.");
  const { data, error } = await auth.supabase.from("conversations").delete().eq("id", id).select("id");
  if (error) return jsonError(500, "Chat konnte nicht gelöscht werden.");
  if (!data?.length) return jsonError(404, "Chat nicht gefunden.");
  return jsonOk({ deleted: true });
}
