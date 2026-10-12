import "server-only";
import { getAiConfig, getAllowedEmails } from "./env";
import { integrationStatus } from "./integrations/config";

// Einrichtungs-Check: zeigt nur öffentliche oder harmlose Informationen
// (keine Schlüssel im Klartext), damit Konfigurationsfehler schnell auffallen.

export type KeyKind = "publishable" | "legacy-anon-or-jwt" | "SECRET_FALSCH" | "PLATZHALTER" | "unbekannt" | "fehlt";

export function classifySupabaseKey(key: string | undefined): KeyKind {
  if (!key) return "fehlt";
  if (looksLikePlaceholder(key)) return "PLATZHALTER";
  if (key.startsWith("sb_publishable_")) return "publishable";
  if (key.startsWith("sb_secret_")) return "SECRET_FALSCH";
  if (key.startsWith("eyJ")) return "legacy-anon-or-jwt";
  return "unbekannt";
}

export function maskKey(key: string | undefined): string | null {
  if (!key) return null;
  return `${key.slice(0, 18)}… (${key.length} Zeichen)`;
}

/** Ist ein Wert offensichtlich noch ein Platzhalter aus .env.example? */
export function looksLikePlaceholder(value: string | undefined): boolean {
  if (!value) return false;
  return /HIER_|DEIN_|DEIN-PROJEKT|example\.com/i.test(value);
}

export function describeGeminiKey(key: string | undefined): string {
  if (!key) return "fehlt";
  if (looksLikePlaceholder(key)) return "PLATZHALTER – bitte echten Schlüssel aus Google AI Studio eintragen";
  if (key !== key.trim()) return "enthält Leerzeichen am Anfang/Ende";
  if (key.startsWith("AIza") && key.length >= 35) return "sieht gültig aus";
  return "anderes Format als üblich (siehe geminiVerbindung)";
}

export function checkSupabaseUrl(raw: string | undefined): { ok: boolean; hinweis?: string } {
  if (!raw) return { ok: false, hinweis: "NEXT_PUBLIC_SUPABASE_URL fehlt." };
  if (raw !== raw.trim()) return { ok: false, hinweis: "Die URL enthält Leerzeichen am Anfang oder Ende." };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, hinweis: "Die URL ist keine gültige Adresse." };
  }
  if (url.protocol !== "https:") return { ok: false, hinweis: "Die URL muss mit https:// beginnen." };
  if (!url.hostname.endsWith(".supabase.co")) {
    return { ok: false, hinweis: "Die URL muss so aussehen: https://DEINE-PROJEKT-ID.supabase.co (nicht die Dashboard-Adresse)." };
  }
  if (url.pathname !== "/" || url.search) {
    return { ok: false, hinweis: "Hinter .supabase.co darf nichts mehr stehen (auch kein Schrägstrich-Pfad)." };
  }
  return { ok: true };
}

/** Fragt bei Google nur die Modellliste ab – prüft den Schlüssel, ohne KI-Kontingent zu verbrauchen. */
async function checkGemini(apiKey: string | undefined): Promise<string> {
  if (!apiKey) return "nicht getestet (Schlüssel fehlt)";
  if (looksLikePlaceholder(apiKey)) return "nicht getestet (Platzhalter)";
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
      headers: { "x-goog-api-key": apiKey.trim() },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 200) return "OK – Google akzeptiert den Schlüssel";
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return `ABGELEHNT (${res.status}) – Schlüssel ungültig oder falsch kopiert`;
    }
    if (res.status === 429) return "Schlüssel ok, aber Limit gerade erreicht";
    return `Fehler bei Google (Status ${res.status})`;
  } catch {
    return "keine Verbindung zu Google";
  }
}

export async function runHealthCheck() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const urlCheck = checkSupabaseUrl(rawUrl);
  const keyKind = classifySupabaseKey(key);

  let supabaseVerbindung: string;
  if (!urlCheck.ok || !key) {
    supabaseVerbindung = "nicht getestet (URL oder Schlüssel fehlt/ungültig)";
  } else {
    try {
      const res = await fetch(new URL("/auth/v1/settings", rawUrl), {
        headers: { apikey: key.trim() },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      supabaseVerbindung =
        res.status === 200
          ? "OK – URL und Schlüssel passen zusammen"
          : res.status === 401 || res.status === 403
            ? `ABGELEHNT (${res.status}) – Schlüssel passt nicht zu diesem Projekt oder ist falsch kopiert`
            : `Fehler (Status ${res.status})`;
    } catch {
      supabaseVerbindung = "keine Verbindung – stimmt die Projekt-ID in der URL?";
    }
  }

  const ai = getAiConfig();
  const geminiVerbindung = await checkGemini(ai.gemini.apiKey);
  return {
    hinweis: "Diese Seite zeigt keine geheimen Werte.",
    supabase: {
      url: rawUrl ?? null,
      urlOk: urlCheck.ok,
      urlHinweis: urlCheck.hinweis ?? null,
      schluessel: maskKey(key),
      schluesselArt: keyKind,
      schluesselHatLeerzeichen: key ? key !== key.trim() : false,
      verbindung: supabaseVerbindung,
    },
    ki: {
      anbieter: ai.provider,
      geminiSchluessel: describeGeminiKey(process.env.GEMINI_API_KEY),
      geminiModell: ai.gemini.model,
      geminiVerbindung,
      anthropicSchluesselGesetzt: Boolean(ai.anthropic.apiKey),
    },
    dienste: {
      gmx: integrationStatus().mail === "configured" ? "eingerichtet" : "nicht eingerichtet",
      appleKalender: integrationStatus().calendar === "configured" ? "eingerichtet" : "nicht eingerichtet",
    },
    zugriff: {
      anzahlFreigeschalteterEmails: getAllowedEmails().length,
      emailsEnthaltenPlatzhalter: getAllowedEmails().some((e) => looksLikePlaceholder(e) || !e.includes("@")),
    },
  };
}
