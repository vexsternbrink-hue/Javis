import "server-only";
import type { User } from "@supabase/supabase-js";
import { createClient, type ServerSupabase } from "./supabase/server";
import { getSupabaseConfig } from "./supabase/config";
import { getAllowedEmails, getLimits, isProduction } from "./env";
import { isEmailAllowed } from "./allowlist";
import { jsonError, isSameOrigin } from "./http";

export type AuthedContext = { supabase: ServerSupabase; user: User };

type RateLimitKind = "api" | "chat";

/** Liefert den angemeldeten Nutzer (für Server Components) oder null. */
export async function getCurrentUser(): Promise<User | null> {
  if (!getSupabaseConfig()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export function userIsAllowed(user: User | null): boolean {
  return isEmailAllowed(user?.email, getAllowedEmails(), isProduction());
}

async function checkRateLimit(
  supabase: ServerSupabase,
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean | "error"> {
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("Rate-Limit-Prüfung fehlgeschlagen:", error.code);
    return "error";
  }
  return data === true;
}

/**
 * Schutz für alle API-Routen: Anmeldung, E-Mail-Allowlist, Herkunftsprüfung
 * und Rate-Limit. Gibt entweder den Kontext oder eine Fehler-Response zurück.
 */
export async function requireApiUser(
  request: Request,
  kind: RateLimitKind = "api",
): Promise<AuthedContext | Response> {
  if (!getSupabaseConfig()) {
    return jsonError(500, "Supabase ist noch nicht eingerichtet. Siehe README.");
  }
  if (!isSameOrigin(request)) {
    return jsonError(403, "Anfrage von fremder Herkunft abgelehnt.");
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "Bitte melde dich an.");
  if (!userIsAllowed(user)) {
    return jsonError(403, "Dieses Konto ist für Jarvis nicht freigeschaltet.");
  }

  const limits = getLimits();
  const checks: Array<[string, number, number]> =
    kind === "chat"
      ? [
          ["chat", limits.chatPerMinute, 60],
          ["chat", limits.chatPerDay, 86400],
        ]
      : [["api", limits.apiPerMinute, 60]];

  for (const [bucket, limit, windowSeconds] of checks) {
    const ok = await checkRateLimit(supabase, bucket, limit, windowSeconds);
    if (ok === "error") {
      return jsonError(500, "Datenbankfehler. Wurde die SQL-Migration ausgeführt? (siehe README)");
    }
    if (!ok) {
      return jsonError(
        429,
        windowSeconds === 60
          ? "Zu viele Anfragen. Bitte warte kurz und versuche es dann erneut."
          : "Das Tageslimit für KI-Anfragen ist erreicht. Morgen geht es weiter.",
      );
    }
  }
  return { supabase, user };
}
