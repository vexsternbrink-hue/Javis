import { requireApiUser } from "@/lib/auth";
import { isUuid, jsonError, jsonOk, parseJsonBody } from "@/lib/http";
import { noteUpdateSchema } from "@/lib/validation";
import { deleteNote, updateNote } from "@/lib/data/notes";
import { withDataErrors } from "@/lib/route-helpers";

export async function PATCH(request: Request, ctx: RouteContext<"/api/notes/[id]">) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(400, "Ungültige ID.");
  const body = await parseJsonBody(request, noteUpdateSchema);
  if (body instanceof Response) return body;
  return withDataErrors(async () => {
    const note = await updateNote(auth.supabase, id, body);
    return note ? jsonOk({ note }) : jsonError(404, "Notiz nicht gefunden.");
  });
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/notes/[id]">) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(400, "Ungültige ID.");
  return withDataErrors(async () =>
    (await deleteNote(auth.supabase, id)) ? jsonOk({ deleted: true }) : jsonError(404, "Notiz nicht gefunden."),
  );
}
