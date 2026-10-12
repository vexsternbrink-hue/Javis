// Neutrales Nachrichtenformat von Jarvis.
//
// So wird der Chatverlauf in der Datenbank gespeichert. Es ist unabhängig vom
// KI-Anbieter: Ein anderer Anbieter muss nur einen eigenen Adapter schreiben
// (siehe provider.ts). Anbieter-spezifische Blöcke (z. B. "thinking" von
// Anthropic) werden als "opaque" gespeichert und unverändert zurückgegeben;
// andere Anbieter ignorieren sie.

export type TextBlock = { type: "text"; text: string };

export type ToolCallBlock = {
  type: "tool_call";
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type ToolResultBlock = {
  type: "tool_result";
  toolCallId: string;
  content: string;
  isError?: boolean;
};

export type OpaqueBlock = {
  type: "opaque";
  provider: string;
  data: unknown;
};

export type ContentBlock = TextBlock | ToolCallBlock | ToolResultBlock | OpaqueBlock;

export type ChatMessage = {
  role: "user" | "assistant";
  content: ContentBlock[];
};

export type ToolSpec = {
  name: string;
  description: string;
  /** JSON-Schema der Eingabe */
  inputSchema: Record<string, unknown>;
};

export type StopReason = "end" | "tool_use" | "max_tokens" | "refusal" | "other";

export type TurnResult = {
  content: ContentBlock[];
  stopReason: StopReason;
  usage: { inputTokens: number; outputTokens: number };
};

export type TurnRequest = {
  system: string;
  messages: ChatMessage[];
  tools: ToolSpec[];
  /** "none" zwingt eine reine Textantwort (z. B. wenn das Tool-Limit erreicht ist). */
  toolChoice: "auto" | "none";
  onTextDelta: (delta: string) => void;
  signal?: AbortSignal;
};

/** Fehler des KI-Anbieters mit verständlicher Meldung für die Oberfläche. */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly kind: "config" | "auth" | "rate_limit" | "overloaded" | "bad_request" | "network" | "unknown",
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface ChatProvider {
  readonly id: string;
  readonly model: string;
  streamTurn(request: TurnRequest): Promise<TurnResult>;
}
