import { requireApiUser } from "@/lib/auth";
import { jsonOk } from "@/lib/http";
import { listRecentMails, searchMails } from "@/lib/integrations/mail";
import { integrationErrorResponse, requireOwner } from "@/lib/integrations/route-guard";

export const maxDuration = 30;

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const denied = requireOwner(auth);
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const limit = Math.min(Math.max(Number(params.get("limit")) || 20, 1), 30);
  const q = params.get("q")?.trim() ?? "";
  try {
    const result = q ? await searchMails(q, limit) : await listRecentMails({ limit, unreadOnly: params.get("unread") === "1" });
    return jsonOk(result);
  } catch (error) {
    return integrationErrorResponse(error);
  }
}
