import { requireApiUser } from "@/lib/auth";
import { jsonOk, parseJsonBody } from "@/lib/http";
import { memorySchema } from "@/lib/validation";
import { createMemory, listMemories } from "@/lib/data/memories";
import { withDataErrors } from "@/lib/route-helpers";

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  return withDataErrors(async () => jsonOk({ memories: await listMemories(auth.supabase) }));
}

export async function POST(request: Request) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const body = await parseJsonBody(request, memorySchema);
  if (body instanceof Response) return body;
  return withDataErrors(async () => jsonOk({ memory: await createMemory(auth.supabase, body.content) }, 201));
}
