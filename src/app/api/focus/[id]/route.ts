import { requireApiUser } from "@/lib/auth";
import { isUuid, jsonError, jsonOk } from "@/lib/http";
import { deleteFocusSession } from "@/lib/data/focus";
import { withDataErrors } from "@/lib/route-helpers";

export async function DELETE(request: Request, ctx: RouteContext<"/api/focus/[id]">) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(400, "Ungültige ID.");
  return withDataErrors(async () =>
    (await deleteFocusSession(auth.supabase, id)) ? jsonOk({ deleted: true }) : jsonError(404, "Eintrag nicht gefunden."),
  );
}
