import "server-only";
import { DataError } from "./data/errors";
import { jsonError } from "./http";

/** Wandelt DataError in eine verständliche Fehlerantwort um. */
export async function withDataErrors(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof DataError) return jsonError(error.status, error.message);
    console.error("API-Fehler:", error instanceof Error ? error.name : "unbekannt");
    return jsonError(500, "Interner Fehler.");
  }
}
