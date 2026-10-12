import { requireApiUser } from "@/lib/auth";
import { isUuid, jsonError, jsonOk, parseJsonBody } from "@/lib/http";
import { taskUpdateSchema } from "@/lib/validation";
import { deleteTask, updateTask } from "@/lib/data/tasks";
import { withDataErrors } from "@/lib/route-helpers";

export async function PATCH(request: Request, ctx: RouteContext<"/api/tasks/[id]">) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(400, "Ungültige ID.");
  const body = await parseJsonBody(request, taskUpdateSchema);
  if (body instanceof Response) return body;
  return withDataErrors(async () => {
    const task = await updateTask(auth.supabase, id, body);
    return task ? jsonOk({ task }) : jsonError(404, "Aufgabe nicht gefunden.");
  });
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/tasks/[id]">) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(400, "Ungültige ID.");
  return withDataErrors(async () =>
    (await deleteTask(auth.supabase, id)) ? jsonOk({ deleted: true }) : jsonError(404, "Aufgabe nicht gefunden."),
  );
}
