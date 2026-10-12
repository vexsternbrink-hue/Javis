import { requireApiUser } from "@/lib/auth";
import { jsonOk, parseJsonBody } from "@/lib/http";
import { noteCreateSchema } from "@/lib/validation";
import { createNote, listNotes } from "@/lib/data/notes";
import { withDataErrors } from "@/lib/route-helpers";

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  return withDataErrors(async () => jsonOk({ notes: await listNotes(auth.supabase) }));
}

export async function POST(request: Request) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const body = await parseJsonBody(request, noteCreateSchema);
  if (body instanceof Response) return body;
  return withDataErrors(async () => jsonOk({ note: await createNote(auth.supabase, body) }, 201));
}
