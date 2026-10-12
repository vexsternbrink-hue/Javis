// Gemeinsame Typen für Server und Browser: Streaming-Ereignisse und Anzeige.

import type { ActionStatus } from "../data/types";
import type { ToolKind } from "./tool-meta";

export type ClientAction = {
  id: string;
  toolName: string;
  label: string;
  kind: ToolKind;
  input: Record<string, unknown>;
  preview: Record<string, unknown> | null;
  status: ActionStatus;
  summary?: string;
  error?: string;
};

/** Ereignisse, die /api/chat als NDJSON (eine JSON-Zeile pro Ereignis) streamt. */
export type ChatEvent =
  | { type: "conversation"; conversationId: string; title: string }
  | { type: "text"; delta: string }
  | { type: "segment_end" }
  | { type: "action"; action: ClientAction }
  | { type: "awaiting_confirmation" }
  | { type: "notice"; message: string }
  | { type: "error"; message: string }
  | { type: "done" };

export type DisplaySegment = { type: "text"; text: string } | { type: "action"; action: ClientAction };

export type DisplayItem =
  | { kind: "user"; id: number; text: string; createdAt: string }
  | { kind: "assistant"; id: number; segments: DisplaySegment[]; createdAt: string };

/** Zerlegt einen NDJSON-Puffer in Ereignisse; gibt den unvollständigen Rest zurück. */
export function parseNdjson(buffer: string): { events: ChatEvent[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const events: ChatEvent[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as ChatEvent);
    } catch {
      // Defekte Zeile ignorieren
    }
  }
  return { events, rest };
}
