import { describe, expect, it } from "vitest";
import { isEmailAllowed } from "@/lib/allowlist";

describe("isEmailAllowed", () => {
  it("erlaubt nur Adressen aus der Liste (unabhängig von Groß-/Kleinschreibung)", () => {
    const list = ["ich@example.com"];
    expect(isEmailAllowed("Ich@Example.com", list, true)).toBe(true);
    expect(isEmailAllowed("fremd@example.com", list, true)).toBe(false);
  });

  it("weist in Produktion alle ab, wenn die Liste leer ist", () => {
    expect(isEmailAllowed("ich@example.com", [], true)).toBe(false);
  });

  it("erlaubt in der Entwicklung alle, wenn die Liste leer ist", () => {
    expect(isEmailAllowed("ich@example.com", [], false)).toBe(true);
  });

  it("weist fehlende Adressen ab", () => {
    expect(isEmailAllowed(undefined, ["a@b.de"], false)).toBe(false);
    expect(isEmailAllowed(null, [], false)).toBe(false);
  });
});

import { magicLinkErrorMessage } from "@/lib/auth-messages";

describe("magicLinkErrorMessage", () => {
  it("erklärt die häufigsten Supabase-Fehler verständlich", () => {
    expect(magicLinkErrorMessage(400, "email_address_not_authorized")).toContain("Supabase-Kontos");
    expect(magicLinkErrorMessage(429, "over_email_send_rate_limit")).toContain("Zu viele");
    expect(magicLinkErrorMessage(422, "signup_disabled")).toContain("Allow new users to sign up");
    expect(magicLinkErrorMessage(401, undefined)).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    expect(magicLinkErrorMessage(500, "unexpected_failure")).toContain("Supabase: 500 / unexpected_failure");
  });
});
