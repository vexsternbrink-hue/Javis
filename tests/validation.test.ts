import { describe, expect, it } from "vitest";
import {
  chatRequestSchema,
  isoDate,
  memorySchema,
  noteUpdateSchema,
  taskCreateSchema,
  taskUpdateSchema,
  taskUpdateWithIdSchema,
} from "@/lib/validation";

describe("Validierung", () => {
  it("prüft Datumsangaben streng", () => {
    expect(isoDate.safeParse("2026-10-12").success).toBe(true);
    expect(isoDate.safeParse("2026-02-30").success).toBe(false);
    expect(isoDate.safeParse("12.10.2026").success).toBe(false);
  });

  it("verlangt einen nicht-leeren, begrenzten Aufgabentitel", () => {
    expect(taskCreateSchema.safeParse({ title: "  " }).success).toBe(false);
    expect(taskCreateSchema.safeParse({ title: "x".repeat(301) }).success).toBe(false);
    const ok = taskCreateSchema.parse({ title: "  Mathe  ", due_date: "2026-10-20" });
    expect(ok.title).toBe("Mathe");
  });

  it("lehnt leere Änderungen ab", () => {
    expect(taskUpdateSchema.safeParse({}).success).toBe(false);
    expect(taskUpdateSchema.safeParse({ done: true }).success).toBe(true);
    expect(noteUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("verlangt bei Tool-Änderungen eine gültige UUID", () => {
    expect(taskUpdateWithIdSchema.safeParse({ id: "abc", done: true }).success).toBe(false);
    expect(
      taskUpdateWithIdSchema.safeParse({ id: "3f1c2b9e-8f1a-4c6e-9b2a-1d2e3f4a5b6c", done: true }).success,
    ).toBe(true);
  });

  it("begrenzt Nachrichten und Erinnerungen", () => {
    expect(chatRequestSchema.safeParse({ message: "x".repeat(4001) }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ message: "Hallo" }).success).toBe(true);
    expect(chatRequestSchema.safeParse({ continue: true }).success).toBe(false); // continue braucht eine Chat-ID
    expect(memorySchema.safeParse({ content: "x".repeat(1001) }).success).toBe(false);
  });
});
