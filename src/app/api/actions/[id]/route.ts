import { requireApiUser } from "@/lib/auth";
import { isUuid, jsonError, jsonOk, parseJsonBody } from "@/lib/http";
import { actionDecisionSchema } from "@/lib/validation";
import { decideAction } from "@/lib/agent/approve";
import { DataError } from "@/lib/data/errors";

export async function POST(request: Request, ctx: RouteContext<"/api/actions/[id]">) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError(400, "Ungültige ID.");

  const body = await parseJsonBody(request, actionDecisionSchema);
  if (body instanceof Response) return body;

  try {
    const result = await decideAction(auth.supabase, id, body.decision);
    if (!result.ok) return jsonError(result.status, result.error);
    return jsonOk(result);
  } catch (error) {
    if (error instanceof DataError) return jsonError(error.status, error.message);
    throw error;
  }
}
