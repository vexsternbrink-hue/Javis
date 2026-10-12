import { requireApiUser } from "@/lib/auth";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/http";
import { eventCreateSchema, isoDate } from "@/lib/validation";
import { createCalendarEvent, listCalendarEvents } from "@/lib/integrations/calendar";
import { integrationErrorResponse, requireOwner } from "@/lib/integrations/route-guard";

export const maxDuration = 30;

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const denied = requireOwner(auth);
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const fromParam = params.get("from");
  if (fromParam && !isoDate.safeParse(fromParam).success) return jsonError(400, "Ungültiges Datum.");
  const days = Math.min(Math.max(Number(params.get("days")) || 7, 1), 62);
  // Der Browser schickt den Tagesbeginn in seiner Zeitzone als ISO-Zeitpunkt mit.
  const startParam = params.get("start");
  const from = startParam && !Number.isNaN(Date.parse(startParam)) ? new Date(startParam) : new Date(`${fromParam ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const to = new Date(from.getTime() + days * 24 * 3600_000);
  try {
    return jsonOk(await listCalendarEvents(from, to));
  } catch (error) {
    return integrationErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const denied = requireOwner(auth);
  if (denied) return denied;

  const body = await parseJsonBody(request, eventCreateSchema);
  if (body instanceof Response) return body;
  try {
    const created = await createCalendarEvent({
      title: body.title,
      allDay: body.all_day,
      start: body.start,
      end: body.end,
      location: body.location ?? null,
      notes: body.notes ?? null,
      calendar: body.calendar ?? null,
    });
    return jsonOk({ created }, 201);
  } catch (error) {
    return integrationErrorResponse(error);
  }
}
