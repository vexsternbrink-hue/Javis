import { requireApiUser } from "@/lib/auth";
import { jsonOk, parseJsonBody } from "@/lib/http";
import { habitCreateSchema } from "@/lib/validation";
import { createHabit, listHabits } from "@/lib/data/habits";
import { withDataErrors } from "@/lib/route-helpers";
import { addDays } from "@/lib/habits";
import { todayInTimezone } from "@/lib/server-dates";

/** Gewohnheiten mit den erledigten Tagen der letzten ~6 Monate. */
export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const includeArchived = new URL(request.url).searchParams.get("archived") === "1";
  return withDataErrors(async () =>
    jsonOk({ habits: await listHabits(auth.supabase, addDays(todayInTimezone(), -190), { includeArchived }) }),
  );
}

export async function POST(request: Request) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const body = await parseJsonBody(request, habitCreateSchema);
  if (body instanceof Response) return body;
  return withDataErrors(async () => {
    const habit = await createHabit(auth.supabase, body);
    return jsonOk({ habit: { ...habit, days: [] } }, 201);
  });
}
