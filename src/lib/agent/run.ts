import "server-only";
import { createHash } from "node:crypto";
import type { ServerSupabase } from "../supabase/server";
import { getChatProvider } from "../ai/provider";
import { SYSTEM_PROMPT } from "../ai/system-prompt";
import { ProviderError, type ContentBlock, type ToolCallBlock } from "../ai/types";
import { listMemories } from "../data/memories";
import { DataError } from "../data/errors";
import { getTimezone } from "../env";
import type { ChatEvent } from "./events";
import {
  buildContextText,
  buildToolResults,
  getOpenToolCalls,
  makeTitle,
  selectContextWindow,
  toChatMessages,
  type StoredActionResult,
  type StoredMessage,
} from "./history";
import {
  cancelPendingActions,
  createConversation,
  getConversation,
  insertActions,
  insertMessage,
  loadActionsForMessages,
  loadMessages,
  toClientAction,
  touchConversation,
  type NewAction,
} from "./store";
import {
  TOOL_SPECS,
  executeTool,
  outcomeToResultContent,
  prepareTool,
  toolRequiresConfirmation,
  validateToolCall,
} from "./tools";

/** Maximal so viele KI-Aufrufe pro Nutzeranfrage (verhindert Endlosschleifen). */
export const MAX_ROUNDS = 5;
/** Maximal so viele Tool-Aufrufe pro Nutzeranfrage. */
export const MAX_TOOL_CALLS = 8;
/** Grobe Obergrenze für den an die KI gesendeten Verlauf (Zeichen). */
export const MAX_CONTEXT_CHARS = 60_000;

export type AgentMode = { type: "message"; text: string } | { type: "continue" };

type RunOptions = {
  sb: ServerSupabase;
  conversationId?: string;
  mode: AgentMode;
  emit: (event: ChatEvent) => void;
  signal?: AbortSignal;
};

function hashMemories(memories: string[]): string {
  return createHash("sha256").update(JSON.stringify(memories)).digest("hex").slice(0, 32);
}

class UserFacingError extends Error {}

/**
 * Führt eine Chat-Anfrage aus: Nutzernachricht speichern, KI-Antwort streamen,
 * lesende Tools direkt ausführen, schreibende Tools zur Bestätigung vormerken.
 */
export async function runAgent({ sb, conversationId, mode, emit, signal }: RunOptions): Promise<void> {
  try {
    await runAgentInner({ sb, conversationId, mode, emit, signal });
  } catch (error) {
    if (error instanceof ProviderError || error instanceof DataError || error instanceof UserFacingError) {
      emit({ type: "error", message: error.message });
    } else if (signal?.aborted) {
      // Nutzer hat abgebrochen – nichts weiter zu tun.
    } else {
      console.error("Agent-Fehler:", error instanceof Error ? error.name : "unbekannt");
      emit({ type: "error", message: "Unerwarteter Fehler. Bitte versuche es noch einmal." });
    }
  } finally {
    emit({ type: "done" });
  }
}

async function runAgentInner({ sb, conversationId, mode, emit, signal }: RunOptions): Promise<void> {
  // Provider zuerst prüfen, damit bei fehlender Konfiguration nichts gespeichert wird.
  const provider = getChatProvider();

  // 1. Chat laden oder anlegen
  let conversation = conversationId ? await getConversation(sb, conversationId) : null;
  if (conversationId && !conversation) throw new UserFacingError("Chat nicht gefunden.");
  if (!conversation) {
    if (mode.type !== "message") throw new UserFacingError("Chat nicht gefunden.");
    conversation = await createConversation(sb, makeTitle(mode.text));
  }
  emit({ type: "conversation", conversationId: conversation.id, title: conversation.title });

  const history = await loadMessages(sb, conversation.id);

  // 2. Offene Tool-Aufrufe der letzten KI-Nachricht auflösen
  const open = getOpenToolCalls(history);
  let toolResults: ContentBlock[] = [];
  if (open) {
    if (mode.type === "message") {
      // Neue Nachricht statt Bestätigung: offene Vorschläge verfallen.
      await cancelPendingActions(sb, open.messageId);
    }
    const actions = await loadActionsForMessages(sb, [open.messageId]);
    const results = buildToolResults(
      open.calls,
      actions.map((a) => ({
        tool_use_id: a.tool_use_id,
        status: a.status,
        result: a.result as StoredActionResult | null,
      })),
    );
    if (!results) throw new UserFacingError("Es gibt noch Aktionen, die auf deine Bestätigung warten.");
    toolResults = results;
  } else if (mode.type === "continue") {
    throw new UserFacingError("Es gibt nichts fortzusetzen.");
  }

  // 3. Neue Nutzernachricht zusammenbauen (Tool-Ergebnisse + Kontext + Text)
  let newUserMessage: StoredMessage;
  if (mode.type === "message") {
    const memories = (await listMemories(sb)).map((m) => m.content);
    const memoryHash = hashMemories(memories);
    const window = selectContextWindow(history, MAX_CONTEXT_CHARS);
    const memoriesKnown = window.messages.some((m) => m.memory_hash === memoryHash);
    const context = buildContextText({
      now: new Date(),
      timeZone: getTimezone(),
      memories: memoriesKnown ? null : memories,
    });
    newUserMessage = await insertMessage(sb, {
      conversationId: conversation.id,
      role: "user",
      content: [...toolResults, { type: "text", text: context }, { type: "text", text: mode.text }],
      displayText: mode.text,
      memoryHash: memoriesKnown ? null : memoryHash,
    });
  } else {
    newUserMessage = await insertMessage(sb, {
      conversationId: conversation.id,
      role: "user",
      content: toolResults,
    });
  }
  history.push(newUserMessage);

  // 4. Agenten-Schleife
  let toolCallsUsed = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (signal?.aborted) return;
    const lastRound = round === MAX_ROUNDS - 1 || toolCallsUsed >= MAX_TOOL_CALLS;
    const window = selectContextWindow(history, MAX_CONTEXT_CHARS);

    const turn = await provider.streamTurn({
      system: SYSTEM_PROMPT,
      messages: toChatMessages(window.messages),
      tools: TOOL_SPECS,
      toolChoice: lastRound ? "none" : "auto",
      onTextDelta: (delta) => emit({ type: "text", delta }),
      signal,
    });
    emit({ type: "segment_end" });

    if (turn.stopReason === "refusal") {
      emit({ type: "notice", message: "Jarvis kann auf diese Anfrage nicht antworten." });
      return;
    }

    let content = turn.content;
    if (turn.stopReason === "max_tokens") {
      // Abgeschnittene Tool-Aufrufe niemals ausführen.
      content = content.filter((b) => b.type !== "tool_call");
      emit({ type: "notice", message: "Die Antwort wurde wegen des Längenlimits abgeschnitten." });
    }
    if (lastRound) content = content.filter((b) => b.type !== "tool_call");
    if (!content.some((b) => b.type === "text" || b.type === "tool_call")) {
      if (round === 0) emit({ type: "notice", message: "Jarvis hat keine Antwort geliefert. Bitte versuche es erneut." });
      return;
    }

    const assistant = await insertMessage(sb, {
      conversationId: conversation.id,
      role: "assistant",
      content,
      inputTokens: turn.usage.inputTokens,
      outputTokens: turn.usage.outputTokens,
    });
    history.push(assistant);
    await touchConversation(sb, conversation.id);

    const calls = content.filter((b): b is ToolCallBlock => b.type === "tool_call");
    if (calls.length === 0) return;

    // 5. Tool-Aufrufe verarbeiten
    const newActions: NewAction[] = [];
    for (const call of calls) {
      const base = {
        conversation_id: conversation.id,
        message_id: assistant.id,
        tool_use_id: call.id,
        tool_name: call.name,
        requires_confirmation: toolRequiresConfirmation(call.name),
      };
      toolCallsUsed++;
      if (toolCallsUsed > MAX_TOOL_CALLS) {
        const error = "Limit für Tool-Aufrufe in dieser Anfrage erreicht.";
        newActions.push({ ...base, input: call.input, preview: null, status: "failed", result: { ...outcomeToResultContent({ ok: false, error }), error } });
        continue;
      }
      const validated = validateToolCall(call.name, call.input);
      if (!validated.ok) {
        newActions.push({
          ...base,
          input: call.input,
          preview: null,
          status: "failed",
          result: { ...outcomeToResultContent({ ok: false, error: validated.error }), error: validated.error },
        });
        continue;
      }
      if (validated.tool.kind === "read") {
        const outcome = await executeTool(sb, call.name, validated.input);
        newActions.push({
          ...base,
          input: validated.input,
          preview: null,
          status: outcome.ok ? "executed" : "failed",
          result: {
            ...outcomeToResultContent(outcome),
            ...(outcome.ok ? { summary: outcome.summary } : { error: outcome.error }),
          },
        });
        continue;
      }
      // Schreibende Aktion: nur vormerken, Ausführung erst nach Bestätigung.
      const prepared = await prepareTool(sb, validated.tool, validated.input);
      if (!prepared.ok) {
        newActions.push({
          ...base,
          input: validated.input,
          preview: null,
          status: "failed",
          result: { ...outcomeToResultContent({ ok: false, error: prepared.error }), error: prepared.error },
        });
        continue;
      }
      newActions.push({ ...base, input: validated.input, preview: prepared.preview, status: "pending", result: null });
    }

    const saved = await insertActions(sb, newActions);
    for (const action of saved) emit({ type: "action", action: toClientAction(action) });

    if (saved.some((a) => a.status === "pending")) {
      emit({ type: "awaiting_confirmation" });
      return;
    }

    const results = buildToolResults(
      calls,
      saved.map((a) => ({ tool_use_id: a.tool_use_id, status: a.status, result: a.result as StoredActionResult | null })),
    );
    const resultMessage = await insertMessage(sb, {
      conversationId: conversation.id,
      role: "user",
      content: results ?? [],
    });
    history.push(resultMessage);
  }
}
