import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  ProviderError,
  type ChatMessage,
  type ChatProvider,
  type ContentBlock,
  type StopReason,
  type TurnRequest,
  type TurnResult,
} from "./types";

const PROVIDER_ID = "anthropic";

type Options = {
  apiKey: string;
  model: string;
  effort?: "low" | "medium" | "high";
  maxOutputTokens: number;
};

/** Neutrales Format → Anthropic-Format */
export function toAnthropicMessages(messages: ChatMessage[], keepOpaque = true): Anthropic.MessageParam[] {
  const result: Anthropic.MessageParam[] = [];
  for (const message of messages) {
    const content: Anthropic.ContentBlockParam[] = [];
    for (const block of message.content) {
      switch (block.type) {
        case "text":
          if (block.text) content.push({ type: "text", text: block.text });
          break;
        case "tool_call":
          content.push({ type: "tool_use", id: block.id, name: block.name, input: block.input });
          break;
        case "tool_result":
          content.push({
            type: "tool_result",
            tool_use_id: block.toolCallId,
            content: block.content,
            ...(block.isError ? { is_error: true } : {}),
          });
          break;
        case "opaque":
          // "thinking"-Blöcke werden unverändert zurückgegeben (nur an Anthropic).
          if (keepOpaque && block.provider === PROVIDER_ID) {
            content.push(block.data as Anthropic.ContentBlockParam);
          }
          break;
      }
    }
    if (content.length > 0) result.push({ role: message.role, content });
  }
  return result;
}

/** Anthropic-Antwort → neutrales Format */
export function fromAnthropicContent(blocks: Anthropic.ContentBlock[]): ContentBlock[] {
  const result: ContentBlock[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "text":
        if (block.text) result.push({ type: "text", text: block.text });
        break;
      case "tool_use":
        result.push({
          type: "tool_call",
          id: block.id,
          name: block.name,
          input: (block.input ?? {}) as Record<string, unknown>,
        });
        break;
      case "thinking":
        result.push({
          type: "opaque",
          provider: PROVIDER_ID,
          data: { type: "thinking", thinking: block.thinking, signature: block.signature },
        });
        break;
      case "redacted_thinking":
        result.push({
          type: "opaque",
          provider: PROVIDER_ID,
          data: { type: "redacted_thinking", data: block.data },
        });
        break;
      default:
        // Server-Tools werden von Jarvis nicht verwendet.
        break;
    }
  }
  return result;
}

export function mapStopReason(reason: Anthropic.StopReason | null): StopReason {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "end";
    case "tool_use":
      return "tool_use";
    case "max_tokens":
    case "model_context_window_exceeded":
      return "max_tokens";
    case "refusal":
      return "refusal";
    default:
      return "other";
  }
}

function hasOpaque(messages: ChatMessage[]): boolean {
  return messages.some((m) => m.content.some((b) => b.type === "opaque" && b.provider === PROVIDER_ID));
}

function toProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new ProviderError(
      "Der Anthropic-API-Schlüssel wurde abgelehnt. Bitte ANTHROPIC_API_KEY prüfen.",
      false,
      "auth",
    );
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new ProviderError(
      "Das eingestellte KI-Modell wurde nicht gefunden. Bitte ANTHROPIC_MODEL prüfen.",
      false,
      "bad_request",
    );
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new ProviderError(
      "Das Limit beim KI-Anbieter ist erreicht. Bitte später erneut versuchen.",
      true,
      "rate_limit",
    );
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new ProviderError(
      "Die KI-Anfrage wurde abgelehnt. Häufige Ursachen: kein Guthaben im Anthropic-Konto oder ein ungültiger Modellname.",
      false,
      "bad_request",
    );
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new ProviderError("Keine Verbindung zum KI-Anbieter. Bitte erneut versuchen.", true, "network");
  }
  if (error instanceof Anthropic.APIError) {
    if (error.status === 529 || (error.status ?? 0) >= 500) {
      return new ProviderError("Der KI-Anbieter ist gerade überlastet. Bitte gleich noch einmal versuchen.", true, "overloaded");
    }
    return new ProviderError(`Fehler beim KI-Anbieter (Status ${error.status ?? "?"}).`, true, "unknown");
  }
  return new ProviderError("Unbekannter Fehler bei der KI-Anfrage.", true, "unknown");
}

export class AnthropicProvider implements ChatProvider {
  readonly id = PROVIDER_ID;
  readonly model: string;
  private readonly client: Anthropic;
  private readonly effort?: Options["effort"];
  private readonly maxOutputTokens: number;

  constructor(options: Options) {
    this.client = new Anthropic({ apiKey: options.apiKey, maxRetries: 2, timeout: 120_000 });
    this.model = options.model;
    this.effort = options.effort;
    this.maxOutputTokens = options.maxOutputTokens;
  }

  async streamTurn(request: TurnRequest): Promise<TurnResult> {
    let emittedText = false;
    const run = async (keepOpaque: boolean): Promise<TurnResult> => {
      const stream = this.client.messages.stream(
        {
          model: this.model,
          max_tokens: this.maxOutputTokens,
          // Automatisches Prompt-Caching: wiederholte Gesprächsanfänge werden
          // günstiger abgerechnet. Zu kurze Anfragen werden einfach nicht gecacht.
          cache_control: { type: "ephemeral" },
          system: request.system,
          messages: toAnthropicMessages(request.messages, keepOpaque),
          tools: request.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
          })),
          tool_choice: { type: request.toolChoice },
          ...(this.effort ? { output_config: { effort: this.effort } } : {}),
        },
        { signal: request.signal },
      );
      stream.on("text", (delta) => {
        emittedText = true;
        request.onTextDelta(delta);
      });
      const message = await stream.finalMessage();
      return {
        content: fromAnthropicContent(message.content),
        stopReason: mapStopReason(message.stop_reason),
        usage: {
          inputTokens:
            message.usage.input_tokens +
            (message.usage.cache_read_input_tokens ?? 0) +
            (message.usage.cache_creation_input_tokens ?? 0),
          outputTokens: message.usage.output_tokens,
        },
      };
    };

    try {
      return await run(true);
    } catch (error) {
      // Dokumentierte Wiederherstellung: Wird ein gespeicherter "thinking"-Block
      // abgelehnt (400), einmal ohne alle thinking-Blöcke wiederholen.
      if (
        error instanceof Anthropic.BadRequestError &&
        !emittedText &&
        hasOpaque(request.messages)
      ) {
        try {
          return await run(false);
        } catch (retryError) {
          throw toProviderError(retryError);
        }
      }
      throw toProviderError(error);
    }
  }
}
