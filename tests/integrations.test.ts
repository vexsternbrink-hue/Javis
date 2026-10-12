import { describe, expect, it } from "vitest";
import { buildEventIcs, localToUtc, parseCalendarData } from "@/lib/integrations/calendar-parse";
import { cleanText, displayName, formatAddress, sanitizeQuery } from "@/lib/integrations/mail-format";
import { eventCreateSchema } from "@/lib/validation";

const ics = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:test\r\n${body}END:VCALENDAR\r\n`;

const BERLIN_TZ = `BEGIN:VTIMEZONE\r
TZID:Europe/Berlin\r
BEGIN:DAYLIGHT\r
TZOFFSETFROM:+0100\r
TZOFFSETTO:+0200\r
TZNAME:CEST\r
DTSTART:19700329T020000\r
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU\r
END:DAYLIGHT\r
BEGIN:STANDARD\r
TZOFFSETFROM:+0200\r
TZOFFSETTO:+0100\r
TZNAME:CET\r
DTSTART:19701025T030000\r
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU\r
END:STANDARD\r
END:VTIMEZONE\r
`;

describe("Kalender: iCalendar lesen", () => {
  const from = new Date("2026-10-12T00:00:00Z");
  const to = new Date("2026-10-26T00:00:00Z");

  it("liest normale Termine mit Zeitzone korrekt (UTC)", () => {
    const data = ics(
      `${BERLIN_TZ}BEGIN:VEVENT\r\nUID:a\r\nDTSTAMP:20261001T000000Z\r\nDTSTART;TZID=Europe/Berlin:20261014T150000\r\nDTEND;TZID=Europe/Berlin:20261014T160000\r\nSUMMARY:Mathe Nachhilfe\r\nLOCATION:Bibliothek\r\nEND:VEVENT\r\n`,
    );
    const events = parseCalendarData([{ data, calendar: "Schule" }], from, to);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: "Mathe Nachhilfe",
      location: "Bibliothek",
      calendar: "Schule",
      allDay: false,
      start: "2026-10-14T13:00:00.000Z", // 15:00 Sommerzeit = 13:00 UTC
      end: "2026-10-14T14:00:00.000Z",
    });
  });

  it("rollt wiederkehrende Termine aus und beachtet Ausnahmen", () => {
    const data = ics(
      `BEGIN:VEVENT\r\nUID:r\r\nDTSTAMP:20261001T000000Z\r\nDTSTART:20261005T170000Z\r\nDTEND:20261005T180000Z\r\nRRULE:FREQ=WEEKLY;COUNT=10\r\nSUMMARY:Training\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:r\r\nDTSTAMP:20261001T000000Z\r\nRECURRENCE-ID:20261019T170000Z\r\nDTSTART:20261019T180000Z\r\nDTEND:20261019T190000Z\r\nSUMMARY:Training (verschoben)\r\nEND:VEVENT\r\n`,
    );
    const events = parseCalendarData([{ data, calendar: "Sport" }], from, to);
    expect(events.map((e) => e.start)).toEqual(["2026-10-12T17:00:00.000Z", "2026-10-19T18:00:00.000Z"]);
    expect(events[1].title).toBe("Training (verschoben)");
  });

  it("erkennt ganztägige Termine und überspringt defekte Daten", () => {
    const data = ics(
      `BEGIN:VEVENT\r\nUID:g\r\nDTSTAMP:20261001T000000Z\r\nDTSTART;VALUE=DATE:20261020\r\nDTEND;VALUE=DATE:20261021\r\nSUMMARY:Ausflug\r\nEND:VEVENT\r\n`,
    );
    const events = parseCalendarData([{ data, calendar: "K" }, { data: "kaputt", calendar: "K" }], from, to);
    expect(events).toEqual([expect.objectContaining({ title: "Ausflug", allDay: true, start: "2026-10-20", end: "2026-10-21" })]);
  });
});

describe("Kalender: Termine erzeugen", () => {
  it("rechnet lokale Zeit inkl. Sommer-/Winterzeit nach UTC um", () => {
    expect(localToUtc("2026-07-01T12:00", "Europe/Berlin").toISOString()).toBe("2026-07-01T10:00:00.000Z");
    expect(localToUtc("2026-12-01T12:00", "Europe/Berlin").toISOString()).toBe("2026-12-01T11:00:00.000Z");
  });

  it("baut gültiges iCalendar, das sich wieder einlesen lässt", () => {
    const text = buildEventIcs(
      { title: "Zahnarzt; Kontrolle, kurz", allDay: false, start: "2026-10-15T09:30", end: "2026-10-15T10:00", location: "Praxis" },
      "uid-1@jarvis",
      "Europe/Berlin",
      new Date("2026-10-12T00:00:00Z"),
    );
    expect(text).toContain("DTSTART:20261015T073000Z");
    expect(text).toContain("SUMMARY:Zahnarzt\\; Kontrolle\\, kurz");
    const events = parseCalendarData([{ data: text, calendar: "K" }], new Date("2026-10-15T00:00:00Z"), new Date("2026-10-16T00:00:00Z"));
    expect(events[0]).toMatchObject({ title: "Zahnarzt; Kontrolle, kurz", location: "Praxis", start: "2026-10-15T07:30:00.000Z" });
  });

  it("legt ganztägige Termine mit exklusivem Ende an", () => {
    const text = buildEventIcs({ title: "Ferien", allDay: true, start: "2026-10-26", end: "2026-10-30" }, "u", "Europe/Berlin");
    expect(text).toContain("DTSTART;VALUE=DATE:20261026");
    expect(text).toContain("DTEND;VALUE=DATE:20261031");
  });

  it("validiert Termin-Eingaben", () => {
    expect(eventCreateSchema.safeParse({ title: "x", start: "2026-10-15T09:30", end: "2026-10-15T10:00" }).success).toBe(true);
    expect(eventCreateSchema.safeParse({ title: "x", start: "2026-10-15T10:00", end: "2026-10-15T09:00" }).success).toBe(false);
    expect(eventCreateSchema.safeParse({ title: "x", all_day: true, start: "2026-10-15T10:00", end: "2026-10-15" }).success).toBe(false);
    expect(eventCreateSchema.safeParse({ title: "", start: "2026-10-15T09:30", end: "2026-10-15T10:00" }).success).toBe(false);
  });
});

describe("E-Mail-Hilfsfunktionen", () => {
  it("formatiert Absender", () => {
    expect(displayName([{ name: "Lisa", address: "lisa@gmx.de" }])).toBe("Lisa");
    expect(displayName([{ address: "lisa@gmx.de" }])).toBe("lisa@gmx.de");
    expect(formatAddress([{ name: "A", address: "a@x.de" }, { address: "b@x.de" }])).toBe("A <a@x.de>, b@x.de");
    expect(displayName(undefined)).toBe("(unbekannt)");
  });

  it("bereinigt und kürzt Text", () => {
    expect(cleanText("Hallo\u0007\r\n\n\n\nWelt  \n", 100)).toEqual({ text: "Hallo\n\nWelt", truncated: false });
    expect(cleanText("x".repeat(20), 10)).toEqual({ text: `${"x".repeat(10)}…`, truncated: true });
  });

  it("entschärft Suchbegriffe", () => {
    expect(sanitizeQuery(' "Rechnung"\\ \n Mai ')).toBe("Rechnung Mai");
    expect(sanitizeQuery("a".repeat(200)).length).toBe(100);
  });
});
