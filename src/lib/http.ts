import "server-only";
import type { z } from "zod";

export function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export function jsonOk(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

const MAX_BODY_BYTES = 64 * 1024;

/** Liest und validiert einen JSON-Body. Gibt bei Fehlern eine Response zurück. */
export async function parseJsonBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T> | Response> {
  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader && Number(lengthHeader) > MAX_BODY_BYTES) {
    return jsonError(413, "Die Anfrage ist zu groß.");
  }
  let text: string;
  try {
    text = await request.text();
  } catch {
    return jsonError(400, "Die Anfrage konnte nicht gelesen werden.");
  }
  if (text.length > MAX_BODY_BYTES) return jsonError(413, "Die Anfrage ist zu groß.");
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    return jsonError(400, "Ungültiges JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return jsonError(400, first?.message ? `Ungültige Eingabe: ${first.message}` : "Ungültige Eingabe.");
  }
  return parsed.data;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Schutz gegen Cross-Site-Requests: schreibende Anfragen müssen von der eigenen Seite kommen. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    // Browser senden bei fetch()-POSTs immer einen Origin-Header.
    // Fehlt er, lehnen wir ab, außer bei GET/HEAD.
    return request.method === "GET" || request.method === "HEAD";
  }
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
