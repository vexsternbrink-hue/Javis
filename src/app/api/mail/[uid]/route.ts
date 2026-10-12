import { requireApiUser } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { readMail } from "@/lib/integrations/mail";
import { integrationErrorResponse, requireOwner } from "@/lib/integrations/route-guard";

export const maxDuration = 30;

export async function GET(request: Request, ctx: RouteContext<"/api/mail/[uid]">) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const denied = requireOwner(auth);
  if (denied) return denied;

  const { uid } = await ctx.params;
  const n = Number(uid);
  if (!Number.isInteger(n) || n <= 0) return jsonError(400, "Ungültige E-Mail-ID.");
  try {
    const mail = await readMail(n);
    return mail ? jsonOk({ mail }) : jsonError(404, "E-Mail nicht gefunden.");
  } catch (error) {
    return integrationErrorResponse(error);
  }
}
