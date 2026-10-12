/** Verständliche Meldung zu den häufigsten Supabase-Fehlern beim Versand. */
export function magicLinkErrorMessage(status: number | undefined, code: string | undefined): string {
  switch (code) {
    case "email_address_not_authorized":
      return "Supabase verschickt mit dem eingebauten Mailversand nur E-Mails an Mitglieder deines Supabase-Teams. Melde dich mit der E-Mail-Adresse deines Supabase-Kontos an oder richte einen eigenen SMTP-Dienst ein (siehe README).";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Zu viele Anmelde-E-Mails in kurzer Zeit. Supabase erlaubt nur wenige pro Stunde – bitte später erneut versuchen.";
    case "signup_disabled":
      return "In Supabase sind neue Anmeldungen deaktiviert. Aktiviere „Allow new users to sign up“ (Authentication → Sign In / Providers), bis du dich einmal angemeldet hast.";
    case "email_provider_disabled":
    case "otp_disabled":
      return "In Supabase ist die Anmeldung per E-Mail ausgeschaltet. Aktiviere den Provider „Email“ (Authentication → Sign In / Providers).";
    case "email_address_invalid":
      return "Supabase hat diese E-Mail-Adresse als ungültig abgelehnt.";
  }
  if (status === 429) return "Zu viele Anmeldeversuche. Bitte warte ein paar Minuten.";
  if (status === 401 || status === 403) {
    return "Supabase hat den Schlüssel abgelehnt. Bitte NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in Vercel prüfen und neu deployen.";
  }
  const detail = [status, code].filter(Boolean).join(" / ");
  return `Die E-Mail konnte nicht gesendet werden${detail ? ` (Supabase: ${detail})` : ""}. Bitte später erneut versuchen.`;
}
