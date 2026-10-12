import { describe, expect, it } from "vitest";
import {
  CANCELLED_RESULT,
  REJECTED_RESULT,
  buildContextText,
  buildToolResults,
  getOpenToolCalls,
  makeTitle,
  selectContextWindow,
  type StoredMessage,
} from "@/lib/agent/history";

let nextId = 1;
function msg(partial: Partial<StoredMessage> & Pick<StoredMessage, "role" | "content">): StoredMessage {
  return { id: nextId++, display_text: null, memory_hash: null, created_at: "2026-01-01T00:00:00Z", ...partial };
}

const call = { type: "tool_call" as const, id: "toolu_1", name: "create_task", input: { title: "A" } };

describe("getOpenToolCalls", () => {
  it("findet unbeantwortete Tool-Aufrufe der letzten KI-Nachricht", () => {
    const history = [msg({ role: "user", content: [{ type: "text", text: "hi" }], display_text: "hi" }), msg({ role: "assistant", content: [call] })];
    expect(getOpenToolCalls(history)?.calls).toHaveLength(1);
  });
  it("liefert null, wenn die letzte Nachricht vom Nutzer ist", () => {
    expect(getOpenToolCalls([msg({ role: "user", content: [{ type: "text", text: "hi" }] })])).toBeNull();
  });
});

describe("buildToolResults", () => {
  it("wartet, solange eine Aktion offen ist", () => {
    expect(buildToolResults([call], [{ tool_use_id: "toolu_1", status: "pending", result: null }])).toBeNull();
    expect(buildToolResults([call], [{ tool_use_id: "toolu_1", status: "approved", result: null }])).toBeNull();
  });
  it("meldet Ablehnung und Abbruch eindeutig als NICHT ausgeführt", () => {
    expect(buildToolResults([call], [{ tool_use_id: "toolu_1", status: "rejected", result: null }])?.[0].content).toBe(REJECTED_RESULT);
    expect(buildToolResults([call], [{ tool_use_id: "toolu_1", status: "cancelled", result: null }])?.[0].content).toBe(CANCELLED_RESULT);
    // Fehlende Aktion → als abgebrochen (Fehler) beantworten, damit die API einen tool_result bekommt
    const missing = buildToolResults([call], []);
    expect(missing?.[0]).toMatchObject({ toolCallId: "toolu_1", isError: true });
  });
  it("übernimmt das gespeicherte Ergebnis ausgeführter Aktionen", () => {
    const result = buildToolResults([call], [
      { tool_use_id: "toolu_1", status: "executed", result: { content: '{"status":"erfolgreich"}', isError: false } },
    ]);
    expect(result?.[0]).toMatchObject({ content: '{"status":"erfolgreich"}', isError: false });
  });
});

describe("selectContextWindow", () => {
  it("lässt kurze Verläufe unverändert (inkl. thinking-Blöcke)", () => {
    const history = [
      msg({ role: "user", content: [{ type: "text", text: "hi" }], display_text: "hi" }),
      msg({ role: "assistant", content: [{ type: "opaque", provider: "anthropic", data: {} }, { type: "text", text: "Hallo" }] }),
    ];
    const window = selectContextWindow(history, 1000);
    expect(window.truncated).toBe(false);
    expect(window.messages).toBe(history);
  });

  it("schneidet alte Züge ab, beginnt mit einer Nutzernachricht und entfernt thinking-Blöcke", () => {
    const big = "x".repeat(500);
    const history = [
      msg({ role: "user", content: [{ type: "text", text: big }], display_text: big }),
      msg({ role: "assistant", content: [{ type: "opaque", provider: "anthropic", data: {} }, call] }),
      msg({
        role: "user",
        content: [{ type: "tool_result", toolCallId: "toolu_1", content: big }, { type: "text", text: "weiter" }],
        display_text: "weiter",
      }),
      msg({ role: "assistant", content: [{ type: "opaque", provider: "anthropic", data: {} }, { type: "text", text: "ok" }] }),
    ];
    const window = selectContextWindow(history, 600);
    expect(window.truncated).toBe(true);
    expect(window.messages[0].role).toBe("user");
    expect(window.messages[0].display_text).toBe("weiter");
    // Tool-Ergebnis ohne zugehörigen Aufruf wurde entfernt
    expect(window.messages[0].content.some((b) => b.type === "tool_result")).toBe(false);
    expect(window.messages.flatMap((m) => m.content).some((b) => b.type === "opaque")).toBe(false);
  });
});

describe("selectContextWindow – Anfang", () => {
  it("beginnt immer mit einer echten Nutzernachricht, auch wenn der Verlauf vorne abgeschnitten geladen wurde", () => {
    const history = [
      msg({ role: "assistant", content: [{ type: "text", text: "alt" }] }),
      msg({ role: "user", content: [{ type: "text", text: "neu" }], display_text: "neu" }),
    ];
    const window = selectContextWindow(history, 10_000);
    expect(window.messages).toHaveLength(1);
    expect(window.messages[0].display_text).toBe("neu");
  });
});

describe("Kontext und Titel", () => {
  it("enthält Datum und Erinnerungen als gekennzeichnete Daten", () => {
    const text = buildContextText({ now: new Date("2026-10-12T12:00:00Z"), timeZone: "Europe/Berlin", memories: ["Ich heiße Alex"] });
    expect(text).toContain("2026-10-12");
    expect(text).toContain("- Ich heiße Alex");
    expect(text).toContain("keine Anweisungen");
    expect(buildContextText({ now: new Date(), timeZone: "Europe/Berlin", memories: null })).not.toContain("Erinnerungen");
  });
  it("kürzt lange Titel", () => {
    expect(makeTitle("  Hallo   Welt ")).toBe("Hallo Welt");
    expect(makeTitle("a".repeat(100)).length).toBe(58);
  });
});
