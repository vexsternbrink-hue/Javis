import "server-only";
import type { ServerSupabase } from "../supabase/server";
import type { ContentBlock } from "../ai/types";
import type { AgentAction, Conversation } from "../data/types";
import { dbError } from "../data/errors";
import type { StoredActionResult, StoredMessage } from "./history";
import type { ClientAction, DisplayItem, DisplaySegment } from "./events";
import { TOOL_META, toolLabel } from "./tool-meta";

const MESSAGE_COLUMNS = "id, role, content, display_text, memory_hash, created_at";
const ACTION_COLUMNS =
  "id, conversation_id, message_id, tool_use_id, tool_name, input, preview, requires_confirmation, status, result, created_at, resolved_at";

/** Maximale Anzahl gespeicherter Nachrichten, die pro Chat geladen werden. */
const MAX_LOADED_MESSAGES = 400;

export async function getConversation(sb: ServerSupabase, id: string): Promise<Conversation | null> {
  const { data, error } = await sb
    .from("conversations")
    .select("id, title, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) dbError("Laden des Chats", error);
  return (data as Conversation | null) ?? null;
}

export async function createConversation(sb: ServerSupabase, title: string): Promise<Conversation> {
  const { data, error } = await sb
    .from("conversations")
    .insert({ title })
    .select("id, title, created_at, updated_at")
    .single();
  if (error) dbError("Anlegen des Chats", error);
  return data as Conversation;
}

export async function touchConversation(sb: ServerSupabase, id: string): Promise<void> {
  const { error } = await sb.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", id);
  if (error) dbError("Aktualisieren des Chats", error);
}

export async function loadMessages(sb: ServerSupabase, conversationId: string): Promise<StoredMessage[]> {
  const { data, error } = await sb
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .order("id", { ascending: false })
    .limit(MAX_LOADED_MESSAGES);
  if (error) dbError("Laden der Nachrichten", error);
  return (data as StoredMessage[]).reverse();
}

export async function insertMessage(
  sb: ServerSupabase,
  values: {
    conversationId: string;
    role: "user" | "assistant";
    content: ContentBlock[];
    displayText?: string | null;
    memoryHash?: string | null;
    inputTokens?: number;
    outputTokens?: number;
  },
): Promise<StoredMessage> {
  const { data, error } = await sb
    .from("messages")
    .insert({
      conversation_id: values.conversationId,
      role: values.role,
      content: values.content,
      display_text: values.displayText ?? null,
      memory_hash: values.memoryHash ?? null,
      input_tokens: values.inputTokens ?? null,
      output_tokens: values.outputTokens ?? null,
    })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error) dbError("Speichern der Nachricht", error);
  return data as StoredMessage;
}

export async function loadActionsForMessages(sb: ServerSupabase, messageIds: number[]): Promise<AgentAction[]> {
  if (messageIds.length === 0) return [];
  const { data, error } = await sb
    .from("agent_actions")
    .select(ACTION_COLUMNS)
    .in("message_id", messageIds)
    .order("created_at", { ascending: true });
  if (error) dbError("Laden der Aktionen", error);
  return data as AgentAction[];
}

export async function loadAction(sb: ServerSupabase, id: string): Promise<AgentAction | null> {
  const { data, error } = await sb.from("agent_actions").select(ACTION_COLUMNS).eq("id", id).maybeSingle();
  if (error) dbError("Laden der Aktion", error);
  return (data as AgentAction | null) ?? null;
}

export type NewAction = {
  conversation_id: string;
  message_id: number;
  tool_use_id: string;
  tool_name: string;
  input: Record<string, unknown>;
  preview: Record<string, unknown> | null;
  requires_confirmation: boolean;
  status: AgentAction["status"];
  result: StoredActionResult | null;
};

export async function insertActions(sb: ServerSupabase, actions: NewAction[]): Promise<AgentAction[]> {
  if (actions.length === 0) return [];
  const rows = actions.map((a) => ({
    ...a,
    resolved_at: a.status === "pending" ? null : new Date().toISOString(),
  }));
  const { data, error } = await sb.from("agent_actions").insert(rows).select(ACTION_COLUMNS);
  if (error) dbError("Speichern der Aktionen", error);
  return data as AgentAction[];
}

/**
 * Setzt den Status einer Aktion – nur wenn sie sich noch im erwarteten Status
 * befindet. So kann eine Aktion nicht doppelt freigegeben oder ausgeführt werden.
 */
export async function transitionAction(
  sb: ServerSupabase,
  id: string,
  from: AgentAction["status"],
  to: AgentAction["status"],
  result: StoredActionResult | null = null,
): Promise<AgentAction | null> {
  const update: Record<string, unknown> = { status: to };
  if (to !== "approved") {
    update.result = result;
    update.resolved_at = new Date().toISOString();
  }
  const { data, error } = await sb
    .from("agent_actions")
    .update(update)
    .eq("id", id)
    .eq("status", from)
    .select(ACTION_COLUMNS)
    .maybeSingle();
  if (error) dbError("Aktualisieren der Aktion", error);
  return (data as AgentAction | null) ?? null;
}

export async function cancelPendingActions(sb: ServerSupabase, messageId: number): Promise<void> {
  const { error } = await sb
    .from("agent_actions")
    .update({ status: "cancelled", resolved_at: new Date().toISOString() })
    .eq("message_id", messageId)
    .eq("status", "pending");
  if (error) dbError("Abbrechen offener Aktionen", error);
}

export async function latestMessageId(sb: ServerSupabase, conversationId: string): Promise<number | null> {
  const { data, error } = await sb
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) dbError("Laden der Nachrichten", error);
  return (data as { id: number } | null)?.id ?? null;
}

export function toClientAction(action: AgentAction): ClientAction {
  const result = action.result as StoredActionResult | null;
  return {
    id: action.id,
    toolName: action.tool_name,
    label: toolLabel(action.tool_name),
    kind: TOOL_META[action.tool_name]?.kind ?? "write",
    input: action.input,
    preview: action.preview,
    status: action.status,
    summary: result?.summary,
    error: result?.error,
  };
}

/** Wandelt den gespeicherten Verlauf in Anzeige-Elemente für die Oberfläche um. */
export function buildDisplayItems(messages: StoredMessage[], actions: AgentAction[]): DisplayItem[] {
  const actionsByToolUse = new Map(actions.map((a) => [`${a.message_id}:${a.tool_use_id}`, a]));
  const items: DisplayItem[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      if (message.display_text !== null) {
        items.push({ kind: "user", id: message.id, text: message.display_text, createdAt: message.created_at });
      }
      continue;
    }
    const segments: DisplaySegment[] = [];
    for (const block of message.content) {
      if (block.type === "text" && block.text.trim()) {
        segments.push({ type: "text", text: block.text });
      } else if (block.type === "tool_call") {
        const action = actionsByToolUse.get(`${message.id}:${block.id}`);
        if (action) segments.push({ type: "action", action: toClientAction(action) });
      }
    }
    if (segments.length === 0) continue;
    const previous = items[items.length - 1];
    if (previous?.kind === "assistant") {
      // Mehrere KI-Nachrichten eines Zugs (Tool-Schleife) als eine Antwort anzeigen.
      previous.segments.push(...segments);
    } else {
      items.push({ kind: "assistant", id: message.id, segments, createdAt: message.created_at });
    }
  }
  return items;
}
