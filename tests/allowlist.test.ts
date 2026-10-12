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
