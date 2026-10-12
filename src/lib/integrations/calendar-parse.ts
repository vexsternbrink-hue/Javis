// Reine Kalender-Hilfsfunktionen (ohne Netzwerk, gut testbar).
import ICAL from "ical.js";

export type CalendarEvent = {
  id: string;
  calendar: string;
  title: string;
  start: string; // ISO (UTC) bzw. JJJJ-MM-TT bei ganztägigen Terminen
  end: string;
  allDay: boolean;
  location: string | null;
  notes: string | null;
};

const MAX_OCCURRENCES_PER_EVENT = 200;

function timeToValue(time: ICAL.Time): string {
  if (time.isDate) {
    const y = String(time.year).padStart(4, "0");
    const m = String(time.month).padStart(2, "0");
    const d = String(time.day).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return time.toJSDate().toISOString();
}

function registerTimezones(root: ICAL.Component) {
  for (const vtimezone of root.getAllSubcomponents("vtimezone")) {
    const tzid = vtimezone.getFirstPropertyValue("tzid");
    if (typeof tzid === "string" && !ICAL.TimezoneService.has(tzid)) {
      ICAL.TimezoneService.register(vtimezone);
    }
  }
}

function overlaps(start: Date, end: Date, from: Date, to: Date) {
  return start < to && end > from;
}

/**
 * Zerlegt iCalendar-Daten in Termine im Zeitraum [from, to).
 * Wiederkehrende Termine werden einzeln ausgerollt (inkl. Ausnahmen).
 */
export function parseCalendarData(
  objects: Array<{ data: string; calendar: string }>,
  from: Date,
  to: Date,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const object of objects) {
    let root: ICAL.Component;
    try {
      root = new ICAL.Component(ICAL.parse(object.data));
    } catch {
      continue; // defekte Einträge überspringen
    }
    registerTimezones(root);
    const vevents = root.getAllSubcomponents("vevent");
    const masters = vevents.filter((v) => !v.hasProperty("recurrence-id"));
    const exceptions = vevents.filter((v) => v.hasProperty("recurrence-id"));

    for (const master of masters) {
      const event = new ICAL.Event(master, {
        exceptions: exceptions.filter((e) => e.getFirstPropertyValue("uid") === master.getFirstPropertyValue("uid")),
      });
      const base = {
        calendar: object.calendar,
        title: event.summary?.trim() || "(ohne Titel)",
        location: event.location?.trim() || null,
        notes: event.description?.trim() ? event.description.trim().slice(0, 2000) : null,
      };

      if (!event.isRecurring()) {
        if (!event.startDate) continue;
        const end = event.endDate ?? event.startDate;
        if (!overlaps(event.startDate.toJSDate(), end.toJSDate(), from, to)) continue;
        events.push({
          id: `${event.uid}`,
          ...base,
          start: timeToValue(event.startDate),
          end: timeToValue(end),
          allDay: event.startDate.isDate,
        });
        continue;
      }

      const iterator = event.iterator();
      let next: ICAL.Time | null;
      let count = 0;
      while ((next = iterator.next()) && count < MAX_OCCURRENCES_PER_EVENT) {
        count++;
        const details = event.getOccurrenceDetails(next);
        const start = details.startDate.toJSDate();
        if (start >= to) break;
        if (!overlaps(start, details.endDate.toJSDate(), from, to)) continue;
        const item = details.item;
        events.push({
          id: `${event.uid}:${details.recurrenceId.toString()}`,
          ...base,
          title: item.summary?.trim() || base.title,
          location: item.location?.trim() || base.location,
          start: timeToValue(details.startDate),
          end: timeToValue(details.endDate),
          allDay: details.startDate.isDate,
        });
      }
    }
  }
  return events.sort((a, b) => a.start.localeCompare(b.start));
}

/** Offset einer Zeitzone (in Minuten) zu einem bestimmten Zeitpunkt. */
function timezoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** Wandelt eine lokale Uhrzeit "JJJJ-MM-TTTHH:MM" in der Zeitzone in einen UTC-Zeitpunkt um. */
export function localToUtc(local: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) throw new Error("Ungültige Zeitangabe");
  const [, y, mo, d, h, mi] = match.map(Number);
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi));
  // Zweimal korrigieren, damit auch Tage mit Zeitumstellung stimmen.
  let utc = new Date(guess.getTime() - timezoneOffsetMinutes(guess, timeZone) * 60000);
  utc = new Date(guess.getTime() - timezoneOffsetMinutes(utc, timeZone) * 60000);
  return utc;
}

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function formatUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Faltet lange Zeilen gemäß RFC 5545 (max. 75 Zeichen). */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const chunks = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) chunks.push(` ${line.slice(i, i + 74)}`);
  return chunks.join("\r\n");
}

export type NewEvent = {
  title: string;
  allDay: boolean;
  /** Ganztägig: JJJJ-MM-TT, sonst JJJJ-MM-TTTHH:MM (lokale Zeit) */
  start: string;
  /** Ganztägig: letzter Tag (inklusive), sonst Endzeit */
  end: string;
  location?: string | null;
  notes?: string | null;
};

export function buildEventIcs(event: NewEvent, uid: string, timeZone: string, now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Jarvis//DE",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatUtc(now)}`,
  ];
  if (event.allDay) {
    const endExclusive = new Date(`${event.end}T00:00:00Z`);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    lines.push(`DTSTART;VALUE=DATE:${event.start.replace(/-/g, "")}`);
    lines.push(`DTEND;VALUE=DATE:${endExclusive.toISOString().slice(0, 10).replace(/-/g, "")}`);
  } else {
    lines.push(`DTSTART:${formatUtc(localToUtc(event.start, timeZone))}`);
    lines.push(`DTEND:${formatUtc(localToUtc(event.end, timeZone))}`);
  }
  lines.push(`SUMMARY:${escapeText(event.title)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.notes) lines.push(`DESCRIPTION:${escapeText(event.notes)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
