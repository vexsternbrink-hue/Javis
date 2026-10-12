import { requireApiUser } from "@/lib/auth";
import { jsonOk } from "@/lib/http";
import { getSystemStatus } from "@/lib/status";

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  return jsonOk({ status: getSystemStatus(auth.user.email) });
}
