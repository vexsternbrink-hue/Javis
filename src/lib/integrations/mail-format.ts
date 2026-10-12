// Reine Hilfsfunktionen für E-Mails (ohne Netzwerk, gut testbar).

export type MailAddress = { name?: string; address?: string };

export type MailSummary = {
  uid: number;
  from: string;
  fromAddress: string | null;
  subject: string;
  date: string | null;
  unread: boolean;
};

export type MailDetail = MailSummary & {
  to: string;
  text: string;
  truncated: boolean;
};

export function formatAddress(list: MailAddress[] | undefined): string {
  if (!list || list.length === 0) return "(unbekannt)";
  return list
    .map((a) => (a.name ? `${a.name}${a.address ? ` <${a.address}>` : ""}` : a.address ?? "(unbekannt)"))
    .join(", ");
}

export function displayName(list: MailAddress[] | undefined): string {
  const first = list?.[0];
  if (!first) return "(unbekannt)";
  return first.name?.trim() || first.address || "(unbekannt)";
}

export function toIso(date: Date | string | undefined | null): string | null {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Text bereinigen: Steuerzeichen raus, Leerzeilen begrenzen, Länge kappen. */
export function cleanText(text: string, max: number): { text: string; truncated: boolean } {
  const cleaned = text
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (cleaned.length <= max) return { text: cleaned, truncated: false };
  return { text: `${cleaned.slice(0, max)}…`, truncated: true };
}

/** Suchbegriff begrenzen und Steuerzeichen entfernen (IMAP-Suche). */
export function sanitizeQuery(query: string): string {
  return query.replace(/[\u0000-\u001F\u007F"\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}
