import { describe, expect, it } from "vitest";
import { checkSupabaseUrl, classifySupabaseKey, describeGeminiKey, maskKey } from "@/lib/health";

describe("Einrichtungs-Check", () => {
  it("erkennt typische URL-Fehler", () => {
    expect(checkSupabaseUrl("https://abc.supabase.co").ok).toBe(true);
    expect(checkSupabaseUrl("https://abc.supabase.co/").ok).toBe(true);
    expect(checkSupabaseUrl("https://supabase.com/dashboard/project/abc").ok).toBe(false);
    expect(checkSupabaseUrl("https://abc.supabase.co/rest/v1").ok).toBe(false);
    expect(checkSupabaseUrl(" https://abc.supabase.co").ok).toBe(false);
    expect(checkSupabaseUrl(undefined).ok).toBe(false);
  });

  it("erkennt die Art des Schlüssels und zeigt ihn nur gekürzt", () => {
    expect(classifySupabaseKey("sb_publishable_abc")).toBe("publishable");
    expect(classifySupabaseKey("sb_secret_abc")).toBe("SECRET_FALSCH");
    expect(classifySupabaseKey("eyJhbGci")).toBe("legacy-anon-or-jwt");
    expect(classifySupabaseKey("HIER_DEIN_PUBLISHABLE_KEY")).toBe("PLATZHALTER");
    expect(classifySupabaseKey("irgendwas")).toBe("unbekannt");
    expect(maskKey("sb_publishable_1234567890abcdef")).toBe("sb_publishable_123… (31 Zeichen)");
  });

  it("erkennt Platzhalter beim Gemini-Schlüssel", () => {
    expect(describeGeminiKey("HIER_DEIN_GEMINI_SCHLUESSEL")).toContain("PLATZHALTER");
    expect(describeGeminiKey("AIza" + "x".repeat(35))).toBe("sieht gültig aus");
    expect(describeGeminiKey(undefined)).toBe("fehlt");
  });
});
