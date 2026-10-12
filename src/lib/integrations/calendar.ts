import "server-only";
import { randomUUID } from "node:crypto";
import { DAVClient, type DAVCalendar } from "tsdav";
import { getTimezone } from "../env";
import { getCalendarConfig, type CalendarConfig } from "./config";
import { buildEventIcs, parseCalendarData, type CalendarEvent, type NewEvent } from "./calendar-parse";

// iCloud-Kalender über CalDAV. Lesen ist erlaubt; neue Termine werden nur
// angelegt, nachdem der Nutzer die Aktion bestätigt hat (Agent) bzw. selbst
// das Formular abschickt. Löschen und Ändern gibt es bewusst nicht.

export class CalendarError extends Error {
  constructor(
    message: string,
    public readonly status = 502,
  ) {
    super(message);
    this.name = "CalendarError";
  }
}

function requireConfig(): CalendarConfig {
  const config = getCalendarConfig();
  if (!config) {
    throw new CalendarError("Der Apple-Kalender ist noch nicht verbunden (ICLOUD_APPLE_ID / ICLOUD_APP_PASSWORD fehlen).", 400);
  }
  return config;
}

/** Nur für Tests austauschbar. */
let fetchImpl: typeof fetch | undefined;
export function __setCalendarFetchForTests(f: typeof fetch | undefined) {
  fetchImpl = f;
}

async function connect(): Promise<{ client: DAVClient; calendars: DAVCalendar[]; config: CalendarConfig }> {
  const config = requireConfig();
  const client = new DAVClient({
    serverUrl: config.serverUrl,
    credentials: { username: config.user, password: config.pass },
    authMethod: "Basic",
    defaultAccountType: "caldav",
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });
  try {
    await client.login();
  } catch {
    throw new CalendarError(
      "iCloud hat die Anmeldung abgelehnt oder ist nicht erreichbar. Prüfe ICLOUD_APPLE_ID und das app-spezifische Passwort.",
    );
  }
  let calendars: DAVCalendar[];
  try {
    calendars = await client.fetchCalendars();
  } catch {
    throw new CalendarError("Die Kalenderliste konnte nicht von iCloud geladen werden.");
  }
  calendars = calendars.filter((c) => !c.components || c.components.includes("VEVENT"));
  return { client, calendars, config };
}

function calendarName(calendar: DAVCalendar): string {
  const name = calendar.displayName;
  return typeof name === "string" && name.trim() ? name.trim() : "Kalender";
}

export async function listCalendarEvents(from: Date, to: Date): Promise<{ calendars: string[]; events: CalendarEvent[] }> {
  const { client, calendars } = await connect();
  const objects: Array<{ data: string; calendar: string }> = [];
  for (const calendar of calendars) {
    try {
      const items = await client.fetchCalendarObjects({
        calendar,
        timeRange: { start: from.toISOString(), end: to.toISOString() },
      });
      for (const item of items) {
        if (typeof item.data === "string") objects.push({ data: item.data, calendar: calendarName(calendar) });
      }
    } catch {
      // Ein einzelner Kalender darf nicht alles blockieren.
    }
  }
  return { calendars: calendars.map(calendarName), events: parseCalendarData(objects, from, to) };
}

export async function createCalendarEvent(event: NewEvent & { calendar?: string | null }) {
  const { client, calendars, config } = await connect();
  if (calendars.length === 0) throw new CalendarError("In iCloud wurde kein Kalender für Termine gefunden.", 400);
  const wanted = (event.calendar || config.calendarName || "").toLowerCase();
  const target = (wanted && calendars.find((c) => calendarName(c).toLowerCase() === wanted)) || calendars[0];
  const uid = `${randomUUID()}@jarvis`;
  const ics = buildEventIcs(event, uid, getTimezone());
  let response: Response;
  try {
    response = await client.createCalendarObject({ calendar: target, filename: `${uid}.ics`, iCalString: ics });
  } catch {
    throw new CalendarError("Der Termin konnte nicht bei iCloud gespeichert werden.");
  }
  if (!response.ok) throw new CalendarError(`iCloud hat den Termin abgelehnt (Status ${response.status}).`);
  return { uid, calendar: calendarName(target) };
}
