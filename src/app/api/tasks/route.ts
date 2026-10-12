import { requireApiUser } from "@/lib/auth";
import { jsonOk, parseJsonBody } from "@/lib/http";
import { taskCreateSchema } from "@/lib/validation";
import { createTask, listTasks } from "@/lib/data/tasks";
import { withDataErrors } from "@/lib/route-helpers";

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  return withDataErrors(async () => jsonOk({ tasks: await listTasks(auth.supabase) }));
}

export async function POST(request: Request) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const body = await parseJsonBody(request, taskCreateSchema);
  if (body instanceof Response) return body;
  return withDataErrors(async () => jsonOk({ task: await createTask(auth.supabase, body) }, 201));
}
