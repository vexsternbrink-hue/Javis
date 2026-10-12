import { describe, expect, it } from "vitest";
import { afterEach, vi } from "vitest";
import { getToolSpecs, toolRequiresConfirmation, validateToolCall } from "@/lib/agent/tools";
import { TOOL_META } from "@/lib/agent/tool-meta";
import { toIlikePattern } from "@/lib/data/notes";

describe("Tool-Registry", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("bietet Postfach-/Kalender-Tools nur an, wenn sie eingerichtet sind", () => {
    const without = getToolSpecs().map((t) => t.name);
    expect(without).not.toContain("list_emails");
    expect(without).not.toContain("create_event");
    vi.stubEnv("GMX_EMAIL", "ich@gmx.de");
    vi.stubEnv("GMX_PASSWORD", "geheim");
    vi.stubEnv("ICLOUD_APPLE_ID", "ich@icloud.com");
    vi.stubEnv("ICLOUD_APP_PASSWORD", "abcd-efgh-ijkl-mnop");
    expect(getToolSpecs().length).toBe(Object.keys(TOOL_META).length);
  });

  it("erzeugt für jedes Tool ein Objekt-Schema ohne $schema-Feld", () => {
    vi.stubEnv("GMX_EMAIL", "ich@gmx.de");
    vi.stubEnv("GMX_PASSWORD", "geheim");
    vi.stubEnv("ICLOUD_APPLE_ID", "ich@icloud.com");
    vi.stubEnv("ICLOUD_APP_PASSWORD", "abcd-efgh-ijkl-mnop");
    for (const spec of getToolSpecs()) {
      expect(spec.inputSchema.type).toBe("object");
      expect(spec.inputSchema).not.toHaveProperty("$schema");
      expect(spec.description.length).toBeGreaterThan(20);
    }
  });

  it("verlangt Bestätigung für alle schreibenden und unbekannten Tools", () => {
    for (const name of [
      "create_task",
      "update_task",
      "delete_task",
      "create_note",
      "update_note",
      "delete_note",
      "save_memory",
      "create_event",
      "create_habit",
      "log_habit",
    ]) {
      expect(toolRequiresConfirmation(name)).toBe(true);
    }
    for (const name of [
      "list_tasks",
      "search_notes",
      "get_note",
      "list_emails",
      "search_emails",
      "read_email",
      "list_events",
      "get_weather",
      "list_habits",
      "get_activity_stats",
    ]) {
      expect(toolRequiresConfirmation(name)).toBe(false);
    }
    expect(toolRequiresConfirmation("irgendwas")).toBe(true);
  });

  it("wendet Standardwerte an und entfernt unbekannte Felder", () => {
    const result = validateToolCall("list_tasks", { foo: "bar" });
    expect(result.ok && result.input).toEqual({ status: "open", limit: 30 });
    const bad = validateToolCall("list_tasks", { limit: 1000 });
    expect(bad.ok).toBe(false);
  });

  it("bietet Wetter, Gewohnheiten und Statistik immer an", () => {
    const names = getToolSpecs().map((t) => t.name);
    for (const name of ["get_weather", "list_habits", "create_habit", "log_habit", "get_activity_stats"]) {
      expect(names).toContain(name);
    }
  });

  it("prüft Priorität und Gewohnheits-Eingaben", () => {
    expect(validateToolCall("create_task", { title: "Test", priority: "high" }).ok).toBe(true);
    expect(validateToolCall("create_task", { title: "Test", priority: "dringend" }).ok).toBe(false);
    expect(validateToolCall("update_task", { id: "00000000-0000-4000-8000-000000000001", priority: "low" }).ok).toBe(true);
    const habit = validateToolCall("create_habit", { title: "Lesen" });
    expect(habit.ok && habit.input).toEqual({ title: "Lesen", target_per_week: 7 });
    expect(validateToolCall("create_habit", { title: "Lesen", target_per_week: 9 }).ok).toBe(false);
    const log = validateToolCall("log_habit", { id: "00000000-0000-4000-8000-000000000001" });
    expect(log.ok && log.input).toEqual({ id: "00000000-0000-4000-8000-000000000001", done: true });
    expect(validateToolCall("log_habit", { id: "x" }).ok).toBe(false);
    expect(validateToolCall("get_weather", { days: 30 }).ok).toBe(false);
  });

  it("entschärft Platzhalter in der Notizsuche", () => {
    expect(toIlikePattern("100% _sicher_")).toBe("%100 sicher%");
    expect(toIlikePattern("a,b),title.eq.x")).toBe("%a b title eq x%");
    expect(toIlikePattern("  %%  ")).toBeNull();
  });
});
