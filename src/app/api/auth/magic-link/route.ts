import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { getAllowedEmails, isProduction } from "@/lib/env";
import { isEmailAllowed } from "@/lib/allowlist";
import { magicLinkErrorMessage } from "@/lib/auth-messages";
import { isSameOrigin, jsonError, jsonOk, parseJsonBody } from "@/lib/http";

const schema = z.object({ email: z.email("Bitte gib eine gültige E-Mail-Adresse ein.").max(254) });

export async function POST(request: Request) {
  if (!getSupabaseConfig()) return jsonError(500, "Supabase ist noch nicht eingerichtet. Siehe README.");
  if (!isSameOrigin(request)) return jsonError(403, "Anfrage von fremder Herkunft abgelehnt.");

  const body = await parseJsonBody(request, schema);
  if (body instanceof Response) return body;
  const email = body.email.trim().toLowerCase();

  if (!isEmailAllowed(email, getAllowedEmails(), isProduction())) {
    return jsonError(
      403,
      getAllowedEmails().length === 0
        ? "Es ist noch keine E-Mail-Adresse freigeschaltet (ALLOWED_EMAILS fehlt)."
        : "Diese E-Mail-Adresse ist für Jarvis nicht freigeschaltet.",
    );
  }

  const supabase = await createClient();
  const origin = new URL(request.url).origin;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  });
  if (error) {
    console.error("Magic-Link-Versand fehlgeschlagen:", error.status ?? "", error.code ?? "");
    return jsonError(error.status === 429 ? 429 : 500, magicLinkErrorMessage(error.status, error.code));
  }
  return jsonOk({ sent: true });
}

