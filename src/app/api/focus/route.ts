import { requireApiUser } from "@/lib/auth";
import { jsonOk, parseJsonBody } from "@/lib/http";
import { focusCreateSchema } from "@/lib/validation";
import { createFocusSession, listFocusSessions } from "@/lib/data/focus";
import { withDataErrors } from "@/lib/route-helpers";

/** Fokus-Einheiten der letzten 30 Tage. */
export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  return withDataErrors(async () =>
    jsonOk({ sessions: await listFocusSessions(auth.supabase, new Date(Date.now() - 31 * 86400_000)) }),
  );
}

export async function POST(request: Request) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const body = await parseJsonBody(request, focusCreateSchema);
  if (body instanceof Response) return body;
  return withDataErrors(async () => jsonOk({ session: await createFocusSession(auth.supabase, body) }, 201));
}
