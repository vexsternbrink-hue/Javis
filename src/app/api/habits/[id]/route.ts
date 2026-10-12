import { requireApiUser } from "@/lib/auth";
import { isUuid, jsonError, jsonOk, parseJsonBody } from "@/lib/http";
import { habitUpdateSchema } from "@/lib/validation";
import { deleteHabit, updateHabit } from "@/lib/data/habits";
import { withDataErrors } from "@/lib/route-helpers";

export async function PATCH(request: Request, ctx: RouteContext<"/api/habits/[id]">) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(400, "Ungültige ID.");
  const body = await parseJsonBody(request, habitUpdateSchema);
  if (body instanceof Response) return body;
  return withDataErrors(async () => {
    const habit = await updateHabit(auth.supabase, id, body);
    return habit ? jsonOk({ habit }) : jsonError(404, "Gewohnheit nicht gefunden.");
  });
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/habits/[id]">) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(400, "Ungültige ID.");
  return withDataErrors(async () =>
    (await deleteHabit(auth.supabase, id)) ? jsonOk({ deleted: true }) : jsonError(404, "Gewohnheit nicht gefunden."),
  );
}
