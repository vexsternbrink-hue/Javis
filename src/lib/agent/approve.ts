import "server-only";
import type { ServerSupabase } from "../supabase/server";
import type { AgentAction } from "../data/types";
import type { StoredActionResult } from "./history";
import { latestMessageId, loadAction, loadActionsForMessages, toClientAction, transitionAction } from "./store";
import { executeTool, outcomeToResultContent, toolRequiresConfirmation } from "./tools";
import type { ClientAction } from "./events";

/** Vorschläge verfallen nach dieser Zeit. */
const ACTION_TTL_MS = 24 * 60 * 60 * 1000;

export type DecisionResult =
  | { ok: true; action: ClientAction; allResolved: boolean; conversationId: string }
  | { ok: false; status: number; error: string };

/**
 * Bestätigt oder verwirft eine vorgeschlagene Aktion.
 *
 * Sicherheit:
 * - Die Aktion wird über den Supabase-Client des Nutzers geladen (RLS): fremde
 *   Aktionen sind unsichtbar.
 * - Ausgeführt werden ausschließlich tool_name und input, die beim Vorschlag
 *   serverseitig gespeichert wurden. Der Browser schickt nur die ID und
 *   "approve"/"reject" – Argumente können dabei nicht verändert werden
 *   (die Datenbank verbietet Änderungen an tool_name/input zusätzlich).
 * - Der Statuswechsel pending → approved ist atomar, daher wird eine Aktion
 *   höchstens einmal ausgeführt.
 */
export async function decideAction(
  sb: ServerSupabase,
  actionId: string,
  decision: "approve" | "reject",
): Promise<DecisionResult> {
  const action = await loadAction(sb, actionId);
  if (!action) return { ok: false, status: 404, error: "Aktion nicht gefunden." };
  if (!action.requires_confirmation || !toolRequiresConfirmation(action.tool_name)) {
    return { ok: false, status: 400, error: "Diese Aktion benötigt keine Bestätigung." };
  }
  if (action.status !== "pending") {
    return { ok: false, status: 409, error: "Über diese Aktion wurde bereits entschieden." };
  }

  // Nur Vorschläge aus der neuesten KI-Nachricht dürfen ausgeführt werden.
  const latest = await latestMessageId(sb, action.conversation_id);
  const expired = Date.now() - new Date(action.created_at).getTime() > ACTION_TTL_MS;
  if (latest !== action.message_id || expired) {
    await transitionAction(sb, action.id, "pending", "cancelled");
    return { ok: false, status: 409, error: "Dieser Vorschlag ist veraltet und wurde verworfen." };
  }

  let final: AgentAction | null;
  if (decision === "reject") {
    final = await transitionAction(sb, action.id, "pending", "rejected", null);
    if (!final) return { ok: false, status: 409, error: "Über diese Aktion wurde bereits entschieden." };
  } else {
    const claimed = await transitionAction(sb, action.id, "pending", "approved");
    if (!claimed) return { ok: false, status: 409, error: "Über diese Aktion wurde bereits entschieden." };
    const outcome = await executeTool(sb, claimed.tool_name, claimed.input);
    const result: StoredActionResult = {
      ...outcomeToResultContent(outcome),
      ...(outcome.ok ? { summary: outcome.summary } : { error: outcome.error }),
    };
    final = await transitionAction(sb, action.id, "approved", outcome.ok ? "executed" : "failed", result);
    if (!final) return { ok: false, status: 500, error: "Status der Aktion konnte nicht gespeichert werden." };
  }

  const siblings = await loadActionsForMessages(sb, [action.message_id]);
  const allResolved = siblings.every((a) => a.status !== "pending" && a.status !== "approved");
  return { ok: true, action: toClientAction(final), allResolved, conversationId: action.conversation_id };
}
