import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { fromAnthropicContent, mapStopReason, toAnthropicMessages } from "@/lib/ai/anthropic";

describe("Anthropic-Adapter", () => {
  it("wandelt Antworten ins neutrale Format und bewahrt thinking-Blöcke", () => {
    const blocks = [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "text", text: "Hallo", citations: null },
      { type: "text", text: "", citations: null },
      { type: "tool_use", id: "toolu_1", name: "list_tasks", input: { status: "open" } },
    ] as unknown as Anthropic.ContentBlock[];
    const neutral = fromAnthropicContent(blocks);
    expect(neutral).toEqual([
      { type: "opaque", provider: "anthropic", data: { type: "thinking", thinking: "", signature: "sig" } },
      { type: "text", text: "Hallo" },
      { type: "tool_call", id: "toolu_1", name: "list_tasks", input: { status: "open" } },
    ]);
  });

  it("baut gültige API-Nachrichten und kann thinking-Blöcke entfernen", () => {
    const messages = [
      { role: "user" as const, content: [{ type: "text" as const, text: "hi" }] },
      {
        role: "assistant" as const,
        content: [
          { type: "opaque" as const, provider: "anthropic", data: { type: "thinking", thinking: "", signature: "s" } },
          { type: "opaque" as const, provider: "andere", data: { x: 1 } },
          { type: "tool_call" as const, id: "t1", name: "list_tasks", input: {} },
        ],
      },
      { role: "user" as const, content: [{ type: "tool_result" as const, toolCallId: "t1", content: "{}", isError: true }] },
    ];
    const withThinking = toAnthropicMessages(messages);
    expect(withThinking[1].content).toHaveLength(2);
    expect(withThinking[2].content).toEqual([{ type: "tool_result", tool_use_id: "t1", content: "{}", is_error: true }]);
    const stripped = toAnthropicMessages(messages, false);
    expect(stripped[1].content).toEqual([{ type: "tool_use", id: "t1", name: "list_tasks", input: {} }]);
  });

  it("ordnet Stop-Gründe zu", () => {
    expect(mapStopReason("end_turn")).toBe("end");
    expect(mapStopReason("tool_use")).toBe("tool_use");
    expect(mapStopReason("refusal")).toBe("refusal");
    expect(mapStopReason("model_context_window_exceeded")).toBe("max_tokens");
  });
});
