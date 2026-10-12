import "server-only";
import type { AuthedContext } from "../auth";
import { jsonError } from "../http";
import { isIntegrationOwner } from "./config";
import { MailError } from "./mail";
import { CalendarError } from "./calendar";

export function requireOwner(auth: AuthedContext): Response | null {
  if (!isIntegrationOwner(auth.user.email)) {
    return jsonError(403, "Postfach und Kalender sind nur für den Besitzer dieser Jarvis-Installation freigegeben.");
  }
  return null;
}

export function integrationErrorResponse(error: unknown): Response {
  if (error instanceof MailError || error instanceof CalendarError) return jsonError(error.status, error.message);
  console.error("Integrationsfehler:", error instanceof Error ? error.name : "unbekannt");
  return jsonError(500, "Interner Fehler.");
}
