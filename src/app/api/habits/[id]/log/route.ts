import { requireApiUser } from "@/lib/auth";
import { isUuid, jsonError, jsonOk, parseJsonBody } from "@/lib/http";
import { habitLogSchema } from "@/lib/validation";
import { getHabit, setHabitDay } from "@/lib/data/habits";
import { withDataErrors } from "@/lib/route-helpers";
import { addDays } from "@/lib/habits";
import { todayInTimezone } from "@/lib/server-dates";

/** Tag abhaken oder Haken entfernen. Zukünftige Tage sind nicht erlaubt. */
export async function POST(request: Request, ctx: RouteContext<"/api/habits/[id]/log">) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(400, "Ungültige ID.");
  const body = await parseJsonBody(request, habitLogSchema);
  if (body instanceof Response) return body;
  // Einen Tag Puffer, weil Browser und Server in unterschiedlichen Zeitzonen sein können.
  if (body.day > addDays(todayInTimezone(), 1)) return jsonError(400, "Zukünftige Tage können nicht abgehakt werden.");
  return withDataErrors(async () => {
    if (!(await getHabit(auth.supabase, id))) return jsonError(404, "Gewohnheit nicht gefunden.");
    await setHabitDay(auth.supabase, id, body.day, body.done);
    return jsonOk({ day: body.day, done: body.done });
  });
}
