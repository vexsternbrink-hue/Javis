import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agent/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent/store")>();
  const fakes = await import("./fakes");
  return { ...actual, ...fakes.store };
});
vi.mock("@/lib/data/tasks", async () => (await import("./fakes")).tasks);
vi.mock("@/lib/data/memories", async () => (await import("./fakes")).memories);
vi.mock("@/lib/ai/provider", async () => {
  const fakes = await import("./fakes");
  return { getChatProvider: () => fakes.fakeProvider };
});

import { MAX_ROUNDS, runAgent } from "@/lib/agent/run";
import { decideAction } from "@/lib/agent/approve";
import type { ChatEvent } from "@/lib/agent/events";
import type { ServerSupabase } from "@/lib/supabase/server";
import { addTask, db, provider, resetDb } from "./fakes";

const sb = {} as ServerSupabase;

async function run(mode: { type: "message"; text: string } | { type: "continue" }, conversationId?: string) {
  const events: ChatEvent[] = [];
  await runAgent({ sb, conversationId, mode, emit: (e) => events.push(e) });
  const conv = events.find((e) => e.type === "conversation");
  return { events, conversationId: conv && conv.type === "conversation" ? conv.conversationId : conversationId };
}

function lastUserMessage() {
  const req = provider.requests[provider.requests.length - 1];
  return req.messages[req.messages.length - 1];
}

beforeEach(() => {
  resetDb();
  provider.fallback = null;
});

describe("Agent: lesende Tools", () => {
  it("führt lesende Tools automatisch aus und gibt das Ergebnis an die KI", async () => {
    addTask("Vokabeln lernen");
    provider.script = [
      { content: [{ type: "tool_call", id: "t1", name: "list_tasks", input: {} }] },
      { content: [{ type: "text", text: "Du hast 1 offene Aufgabe." }] },
    ];
    const { events } = await run({ type: "message", text: "Was steht an?" });

    expect(provider.requests).toHaveLength(2);
    const result = lastUserMessage().content.find((b) => b.type === "tool_result");
    expect(result && result.type === "tool_result" && result.content).toContain("Vokabeln lernen");
    expect(db.actions[0]).toMatchObject({ tool_name: "list_tasks", status: "executed", requires_confirmation: false });
    expect(events.some((e) => e.type === "awaiting_confirmation")).toBe(false);
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("schickt Datum und Erinnerungen im Kontext, aber nicht im System-Prompt", async () => {
    db.memories.push({ id: "m", content: "Ich heiße Alex", created_at: "", updated_at: "" });
    provider.script = [{ content: [{ type: "text", text: "Hallo Alex!" }] }];
    await run({ type: "message", text: "Hi" });
    const req = provider.requests[0];
    expect(req.system).not.toContain("Alex");
    expect(JSON.stringify(req.messages[0])).toContain("Ich heiße Alex");
    // Zweite Nachricht im selben Chat: Erinnerungen unverändert → nicht erneut senden
    const conversationId = db.conversations[0].id;
    provider.script = [{ content: [{ type: "text", text: "Klar." }] }];
    await run({ type: "message", text: "Noch was" }, conversationId);
    expect(JSON.stringify(lastUserMessage())).not.toContain("Ich heiße Alex");
  });
});

describe("Agent: schreibende Tools brauchen Bestätigung", () => {
  it("führt nichts aus, bevor der Nutzer bestätigt – und dann genau die gespeicherte Aktion", async () => {
    provider.script = [
      {
        content: [
          { type: "text", text: "Ich schlage vor, die Aufgabe anzulegen." },
          { type: "tool_call", id: "t1", name: "create_task", input: { title: "Mathe", due_date: "2026-10-20" } },
        ],
      },
    ];
    const first = await run({ type: "message", text: "Leg Mathe an" });

    expect(provider.requests).toHaveLength(1); // Schleife stoppt
    expect(db.calls.createTask).toHaveLength(0); // NICHT ausgeführt
    expect(db.actions[0]).toMatchObject({ status: "pending", requires_confirmation: true });
    expect(first.events.some((e) => e.type === "awaiting_confirmation")).toBe(true);

    // Eine Behauptung der KI ist keine Zustimmung: Nur decideAction führt aus.
    const decision = await decideAction(sb, db.actions[0].id, "approve");
    expect(decision.ok).toBe(true);
    expect(db.calls.createTask).toEqual([{ title: "Mathe", due_date: "2026-10-20" }]);
    expect(db.actions[0].status).toBe("executed");
    if (decision.ok) expect(decision.allResolved).toBe(true);

    // Zweites Bestätigen führt nicht noch einmal aus
    const again = await decideAction(sb, db.actions[0].id, "approve");
    expect(again).toMatchObject({ ok: false, status: 409 });
    expect(db.calls.createTask).toHaveLength(1);

    // Fortsetzen: KI erhält das echte Ergebnis
    provider.script = [{ content: [{ type: "text", text: "Erledigt." }] }];
    await run({ type: "continue" }, first.conversationId);
    const result = lastUserMessage().content[0];
    expect(result.type === "tool_result" && result.content).toContain("erfolgreich");
  });

  it("meldet abgelehnte Aktionen als nicht ausgeführt", async () => {
    const task = addTask("Wichtig");
    provider.script = [{ content: [{ type: "tool_call", id: "t1", name: "delete_task", input: { id: task.id } }] }];
    const first = await run({ type: "message", text: "Lösch das" });
    expect(db.actions[0].preview).toMatchObject({ target: { title: "Wichtig" } });

    const decision = await decideAction(sb, db.actions[0].id, "reject");
    expect(decision.ok).toBe(true);
    expect(db.calls.deleteTask).toHaveLength(0);
    expect(db.tasks).toHaveLength(1);

    provider.script = [{ content: [{ type: "text", text: "Okay, nicht gelöscht." }] }];
    await run({ type: "continue" }, first.conversationId);
    const result = lastUserMessage().content[0];
    expect(result.type === "tool_result" && result.content).toContain("abgelehnt");
  });

  it("verwirft offene Vorschläge, wenn der Nutzer stattdessen weiterschreibt", async () => {
    provider.script = [{ content: [{ type: "tool_call", id: "t1", name: "create_task", input: { title: "X" } }] }];
    const first = await run({ type: "message", text: "Leg X an" });
    provider.script = [{ content: [{ type: "text", text: "Alles klar." }] }];
    await run({ type: "message", text: "Doch nicht" }, first.conversationId);

    expect(db.actions[0].status).toBe("cancelled");
    expect(db.calls.createTask).toHaveLength(0);
    const blocks = lastUserMessage().content;
    expect(blocks[0].type === "tool_result" && blocks[0].content).toContain("NICHT ausgeführt");
    expect(blocks.at(-1)).toEqual({ type: "text", text: "Doch nicht" });

    // Der verworfene Vorschlag kann nachträglich nicht mehr freigegeben werden
    const late = await decideAction(sb, db.actions[0].id, "approve");
    expect(late).toMatchObject({ ok: false, status: 409 });
    expect(db.calls.createTask).toHaveLength(0);
  });

  it("lehnt Vorschläge ab, die nicht aus der neuesten KI-Nachricht stammen", async () => {
    provider.script = [{ content: [{ type: "tool_call", id: "t1", name: "create_task", input: { title: "Alt" } }] }];
    const first = await run({ type: "message", text: "a" });
    // Simuliert eine neuere Nachricht, ohne die Aktion zu verwerfen
    db.messages.push({ ...db.messages[db.messages.length - 1], id: 999 });
    const decision = await decideAction(sb, db.actions[0].id, "approve");
    expect(decision).toMatchObject({ ok: false, status: 409 });
    expect(db.calls.createTask).toHaveLength(0);
    expect(first.conversationId).toBeDefined();
  });
});

describe("Agent: Validierung und Grenzen", () => {
  it("weist ungültige Tool-Argumente und unbekannte Tools ab, ohne etwas auszuführen", async () => {
    provider.script = [
      {
        content: [
          { type: "tool_call", id: "t1", name: "create_task", input: { title: "" } },
          { type: "tool_call", id: "t2", name: "delete_task", input: { id: "keine-uuid" } },
          { type: "tool_call", id: "t3", name: "run_shell", input: { cmd: "rm -rf /" } },
        ],
      },
      { content: [{ type: "text", text: "Das ging nicht." }] },
    ];
    await run({ type: "message", text: "test" });
    expect(db.actions.map((a) => a.status)).toEqual(["failed", "failed", "failed"]);
    expect(db.calls.createTask).toHaveLength(0);
    expect(db.calls.deleteTask).toHaveLength(0);
    const results = lastUserMessage().content.filter((b) => b.type === "tool_result");
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.type === "tool_result" && r.isError)).toBe(true);
  });

  it("begrenzt die Anzahl der KI-Aufrufe pro Anfrage (keine Endlosschleife)", async () => {
    provider.fallback = { content: [{ type: "tool_call", id: "loop", name: "list_tasks", input: {} }] };
    let n = 0;
    provider.fallback = new Proxy(provider.fallback, {
      get(target, prop) {
        if (prop === "content") return [{ type: "tool_call", id: `loop${n++}`, name: "list_tasks", input: {} }];
        return Reflect.get(target, prop);
      },
    });
    await run({ type: "message", text: "Endlos" });
    expect(provider.requests.length).toBeLessThanOrEqual(MAX_ROUNDS);
    expect(provider.requests.at(-1)?.toolChoice).toBe("none");
  });

  it("speichert bei einer Verweigerung keine KI-Nachricht", async () => {
    provider.script = [{ content: [{ type: "text", text: "" }], stopReason: "refusal" }];
    const { events } = await run({ type: "message", text: "?" });
    expect(db.messages.filter((m) => m.role === "assistant")).toHaveLength(0);
    expect(events.some((e) => e.type === "notice")).toBe(true);
  });
});
