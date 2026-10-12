import { requireApiUser } from "@/lib/auth";
import { jsonOk } from "@/lib/http";
import { searchQuerySchema } from "@/lib/validation";
import { searchAll } from "@/lib/data/search";
import { withDataErrors } from "@/lib/route-helpers";

/** Globale Suche für die Befehlspalette. */
export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const parsed = searchQuerySchema.safeParse(new URL(request.url).searchParams.get("q") ?? "");
  if (!parsed.success) return jsonOk({ results: [] });
  return withDataErrors(async () => jsonOk({ results: await searchAll(auth.supabase, parsed.data) }));
}
