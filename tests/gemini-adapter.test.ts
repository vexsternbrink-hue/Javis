import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Part } from "@google/genai";
import {
  DUMMY_THOUGHT_SIGNATURE,
  GeminiProvider,
  appendPart,
  fromGeminiParts,
  mapFinishReason,
  toGeminiContents,
  toGeminiSchema,
} from "@/lib/ai/gemini";
import type { ChatMessage } from "@/lib/ai/types";

describe("Gemini-Adapter: Umwandlung", () => {
  it("gibt gespeicherte Rohteile (inkl. thought signature) unverändert zurück", () => {
    const raw: Part[] = [{ functionCall: { name: "list_tasks", args: {} }, thoughtSignature: "SIG123" }];
    const assistant = fromGeminiParts(raw);
    const messages: ChatMessage[] = [
      { role: "user", content: [{ type: "text", text: "Was steht an?" }] },
      { role: "assistant", content: assistant },
    ];
    const contents = toGeminiContents(messages);
    expect(contents[1]).toEqual({ role: "model", parts: raw });
  });

  it("nutzt die Platzhalter-Signatur, wenn keine Rohteile vorhanden sind", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: [{ type: "text", text: "hi" }] },
      {
        role: "assistant",
        content: [
          { type: "opaque", provider: "anthropic", data: { type: "thinking" } },
          { type: "tool_call", id: "toolu_1", name: "list_tasks", input: { status: "open" } },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", toolCallId: "toolu_1", content: '{"status":"erfolgreich"}' },
          { type: "text", text: "danke" },
        ],
      },
    ];
    const contents = toGeminiContents(messages);
    expect(contents[1].parts?.[0]).toEqual({
      functionCall: { id: "toolu_1", name: "list_tasks", args: { status: "open" } },
      thoughtSignature: DUMMY_THOUGHT_SIGNATURE,
    });
    expect(contents[2]).toEqual({
      role: "user",
      parts: [
        { functionResponse: { id: "toolu_1", name: "list_tasks", response: { status: "erfolgreich" } } },
        { text: "danke" },
      ],
    });
  });

  it("vergibt lokale IDs, wenn Gemini keine liefert, und schickt sie nicht an Google", () => {
    const blocks = fromGeminiParts([{ text: "Moment" }, { functionCall: { name: "get_note", args: { id: "x" } } }]);
    expect(blocks[0].type).toBe("opaque");
    expect(blocks[1]).toEqual({ type: "text", text: "Moment" });
    const call = blocks[2];
    expect(call.type === "tool_call" && call.id.startsWith("gemini-local-")).toBe(true);
    const id = call.type === "tool_call" ? call.id : "";
    const contents = toGeminiContents(
      [
        { role: "assistant", content: blocks },
        { role: "user", content: [{ type: "tool_result", toolCallId: id, content: "kein json", isError: true }] },
      ],
      false,
    );
    expect(contents[0].parts?.[1].functionCall).toEqual({ name: "get_note", args: { id: "x" } });
    expect(contents[1].parts?.[0].functionResponse).toEqual({ name: "get_note", response: { error: "kein json" } });
  });

  it("fasst Stream-Textteile zusammen, aber nicht solche mit Signatur", () => {
    const parts: Part[] = [];
    appendPart(parts, { text: "Hal" });
    appendPart(parts, { text: "lo" });
    appendPart(parts, { text: "", thoughtSignature: "S" });
    appendPart(parts, { text: "!" });
    expect(parts).toEqual([{ text: "Hallo" }, { text: "", thoughtSignature: "S" }, { text: "!" }]);
  });

  it("ordnet Abschlussgründe zu", () => {
    expect(mapFinishReason("STOP", true)).toBe("tool_use");
    expect(mapFinishReason("STOP", false)).toBe("end");
    expect(mapFinishReason("MAX_TOKENS", false)).toBe("max_tokens");
    expect(mapFinishReason("SAFETY", false)).toBe("refusal");
    expect(mapFinishReason("MALFORMED_FUNCTION_CALL", false)).toBe("other");
  });

  it("reduziert Schemas auf sichere Schlüsselwörter", () => {
    const schema = toGeminiSchema({
      type: "object",
      properties: {
        id: { type: "string", format: "uuid", pattern: "^x$" },
        due: { anyOf: [{ type: "string", pattern: "^d$" }, { type: "null" }] },
        status: { type: "string", enum: ["a"], default: "a" },
      },
      required: ["id"],
    });
    expect(schema).toEqual({
      type: "object",
      properties: {
        id: { type: "string" },
        due: { anyOf: [{ type: "string" }, { type: "null" }] },
        status: { type: "string", enum: ["a"] },
      },
      required: ["id"],
    });
  });
});

// ---------------------------------------------------------------------------
// Zusammenspiel mit dem echten Google-SDK gegen einen lokalen Test-Server
// (simuliert die Gemini-API – nur im Test!)
// ---------------------------------------------------------------------------
describe("Gemini-Adapter: Streaming mit dem SDK", () => {
  let server: http.Server;
  let baseUrl = "";
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  let reply: unknown[] = [];

  beforeAll(async () => {
    server = http.createServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      requests.push({ url: req.url ?? "", body: JSON.parse(body) });
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      for (const chunk of reply) res.write(`data: ${JSON.stringify(chunk)}\r\n\r\n`);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.close();
  });

  it("streamt Text, erkennt Funktionsaufrufe und schickt korrekte Anfragen", async () => {
    const p = new GeminiProvider({ apiKey: "test-key", model: "gemini-flash-latest", maxOutputTokens: 1000, baseUrl });

    reply = [
      { candidates: [{ content: { role: "model", parts: [{ text: "Ich schaue " }] } }] },
      { candidates: [{ content: { role: "model", parts: [{ text: "nach." }] } }] },
      {
        candidates: [
          {
            content: { role: "model", parts: [{ functionCall: { name: "list_tasks", args: { status: "open" } }, thoughtSignature: "SIG" }] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 10 },
      },
    ];

    const deltas: string[] = [];
    const result = await p.streamTurn({
      system: "System",
      messages: [{ role: "user", content: [{ type: "text", text: "Was steht an?" }] }],
      tools: [{ name: "list_tasks", description: "Listet Aufgaben", inputSchema: { type: "object", properties: {} } }],
      toolChoice: "auto",
      onTextDelta: (d) => deltas.push(d),
    });

    expect(deltas.join("")).toBe("Ich schaue nach.");
    expect(result.stopReason).toBe("tool_use");
    expect(result.usage).toEqual({ inputTokens: 50, outputTokens: 10 });
    expect(result.content.filter((b) => b.type !== "opaque")).toEqual([
      { type: "text", text: "Ich schaue nach." },
      expect.objectContaining({ type: "tool_call", name: "list_tasks", input: { status: "open" } }),
    ]);

    const request = requests[requests.length - 1];
    expect(request.url).toContain("gemini-flash-latest:streamGenerateContent");
    expect(request.body.contents).toEqual([{ role: "user", parts: [{ text: "Was steht an?" }] }]);
    expect(JSON.stringify(request.body)).toContain('"systemInstruction"');
    expect(JSON.stringify(request.body)).toContain('"functionDeclarations"');
    expect(JSON.stringify(request.body)).not.toContain("test-key");

    // Zweiter Aufruf: Rohteile mit Signatur werden zurückgeschickt
    reply = [{ candidates: [{ content: { role: "model", parts: [{ text: "Du hast nichts offen." }] }, finishReason: "STOP" }] }];
    const toolCall = result.content.find((b) => b.type === "tool_call");
    const second = await p.streamTurn({
      system: "System",
      messages: [
        { role: "user", content: [{ type: "text", text: "Was steht an?" }] },
        { role: "assistant", content: result.content },
        {
          role: "user",
          content: [{ type: "tool_result", toolCallId: toolCall?.type === "tool_call" ? toolCall.id : "", content: '{"count":0}' }],
        },
      ],
      tools: [],
      toolChoice: "none",
      onTextDelta: () => {},
    });
    expect(second.stopReason).toBe("end");
    const body = requests[requests.length - 1].body as { contents: Array<{ role: string; parts: Part[] }> };
    expect(body.contents[1].role).toBe("model");
    expect(JSON.stringify(body.contents[1].parts)).toContain('"thoughtSignature":"SIG"');
    expect(body.contents[2].parts[0].functionResponse).toEqual({ name: "list_tasks", response: { count: 0 } });
  });

  it("meldet Sperren durch den Sicherheitsfilter als Verweigerung", async () => {
    const p = new GeminiProvider({ apiKey: "k", model: "m", maxOutputTokens: 100, baseUrl });
    reply = [{ promptFeedback: { blockReason: "SAFETY" } }];
    const result = await p.streamTurn({
      system: "s",
      messages: [{ role: "user", content: [{ type: "text", text: "x" }] }],
      tools: [],
      toolChoice: "auto",
      onTextDelta: () => {},
    });
    expect(result.stopReason).toBe("refusal");
  });
});
