import { requireApiUser } from "@/lib/auth";
import { isUuid, jsonError, jsonOk, parseJsonBody } from "@/lib/http";
import { memorySchema } from "@/lib/validation";
import { deleteMemory, updateMemory } from "@/lib/data/memories";
import { withDataErrors } from "@/lib/route-helpers";

export async function PATCH(request: Request, ctx: RouteContext<"/api/memories/[id]">) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(400, "Ungültige ID.");
  const body = await parseJsonBody(request, memorySchema);
  if (body instanceof Response) return body;
  return withDataErrors(async () => {
    const memory = await updateMemory(auth.supabase, id, body.content);
    return memory ? jsonOk({ memory }) : jsonError(404, "Erinnerung nicht gefunden.");
  });
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/memories/[id]">) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(400, "Ungültige ID.");
  return withDataErrors(async () =>
    (await deleteMemory(auth.supabase, id)) ? jsonOk({ deleted: true }) : jsonError(404, "Erinnerung nicht gefunden."),
  );
}
