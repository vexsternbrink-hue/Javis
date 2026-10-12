import "server-only";
import { getAllowedEmails, isProduction } from "../env";

// Zugangsdaten für externe Dienste kommen ausschließlich aus Umgebungsvariablen
// (in Vercel als "Secret" gespeichert). Sie werden nie an den Browser geschickt
// und nie geloggt.

export type MailConfig = { host: string; port: number; user: string; pass: string };
export type CalendarConfig = { serverUrl: string; user: string; pass: string; calendarName?: string };

export function getMailConfig(): MailConfig | null {
  const user = process.env.GMX_EMAIL?.trim();
  const pass = process.env.GMX_PASSWORD?.trim();
  if (!user || !pass || /HIER_|DEIN_/i.test(user + pass)) return null;
  return { host: process.env.GMX_IMAP_HOST?.trim() || "imap.gmx.net", port: 993, user, pass };
}

export function getCalendarConfig(): CalendarConfig | null {
  const user = process.env.ICLOUD_APPLE_ID?.trim();
  const pass = process.env.ICLOUD_APP_PASSWORD?.trim();
  if (!user || !pass || /HIER_|DEIN_/i.test(user + pass)) return null;
  return {
    serverUrl: "https://caldav.icloud.com",
    user,
    pass,
    calendarName: process.env.ICLOUD_CALENDAR_NAME?.trim() || undefined,
  };
}

/**
 * Postfach und Kalender gehören genau einer Person. Damit nicht jeder
 * freigeschaltete Nutzer sie sieht, darf nur die ERSTE Adresse aus
 * ALLOWED_EMAILS darauf zugreifen (bzw. in der Entwicklung jeder).
 */
export function isIntegrationOwner(email: string | null | undefined): boolean {
  const allowed = getAllowedEmails();
  if (allowed.length === 0) return !isProduction();
  return Boolean(email) && email!.trim().toLowerCase() === allowed[0];
}

export function integrationStatus() {
  return {
    mail: getMailConfig() ? "configured" : "missing",
    calendar: getCalendarConfig() ? "configured" : "missing",
  } as const;
}
