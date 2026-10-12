import "server-only";
import { getTimezone } from "./env";

/** Heutiges Datum (JJJJ-MM-TT) in der eingestellten Zeitzone. */
export function todayInTimezone(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: getTimezone(), year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
