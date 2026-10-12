import "server-only";
import { randomUUID } from "node:crypto";
import { ApiError, FunctionCallingConfigMode, GoogleGenAI, type Content, type Part } from "@google/genai";
import {
  ProviderError,
  type ChatMessage,
  type ChatProvider,
  type ContentBlock,
  type StopReason,
  type TurnRequest,
  type TurnResult,
} from "./types";

const PROVIDER_ID = "gemini";

/**
 * Platzhalter, den Google für Funktionsaufrufe ohne eigene "thought signature"
 * dokumentiert (z. B. Verlauf von einem anderen Anbieter oder gekürzter Verlauf).
 */
export const DUMMY_THOUGHT_SIGNATURE = "skip_thought_signature_validator";

/** Eigene IDs für Funktionsaufrufe, zu denen Gemini keine ID liefert. */
const LOCAL_ID_PREFIX = "gemini-local-";

type Options = {
  apiKey: string;
  model: string;
  maxOutputTokens: number;
  /** Nur für Tests: andere API-Adresse */
  baseUrl?: string;
};

type RawParts = { parts: Part[] };

function isGeminiOpaque(block: ContentBlock): block is Extract<ContentBlock, { type: "opaque" }> & { data: RawParts } {
  return (
    block.type === "opaque" &&
    block.provider === PROVIDER_ID &&
    typeof block.data === "object" &&
    block.data !== null &&
    Array.isArray((block.data as RawParts).parts)
  );
}

/**
 * Reduziert ein JSON-Schema auf die Schlüsselwörter, die für Funktionsdeklarationen
 * sicher unterstützt werden. Die eigentliche Prüfung macht ohnehin Zod auf dem Server.
 */
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== "object") return schema;
  const allowed = ["type", "description", "properties", "required", "enum", "items", "anyOf", "minimum", "maximum", "minLength", "maxLength"];
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (!allowed.includes(key)) continue;
    if (key === "properties" && value && typeof value === "object") {
      result.properties = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([name, sub]) => [name, toGeminiSchema(sub)]),
      );
    } else if (key === "items" || key === "anyOf") {
      result[key] = toGeminiSchema(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function parseResultObject(content: string, isError: boolean): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(content);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return isError ? { error: parsed } : (parsed as Record<string, unknown>);
    }
  } catch {
    // kein JSON
  }
  return isError ? { error: content } : { output: content };
}

/** Neutrales Format → Gemini-Format */
export function toGeminiContents(messages: ChatMessage[], keepOpaque = true): Content[] {
  // Funktionsnamen zu Aufruf-IDs merken (Gemini braucht den Namen in der Antwort).
  const names = new Map<string, string>();
  for (const message of messages) {
    for (const block of message.content) if (block.type === "tool_call") names.set(block.id, block.name);
  }

  const contents: Content[] = [];
  for (const message of messages) {
    let parts: Part[] = [];
    const raw = keepOpaque ? message.content.find(isGeminiOpaque) : undefined;
    if (message.role === "assistant" && raw) {
      // Originalteile inkl. thought signatures unverändert zurückgeben.
      parts = raw.data.parts;
    } else {
      for (const block of message.content) {
        switch (block.type) {
          case "text":
            if (block.text) parts.push({ text: block.text });
            break;
          case "tool_call":
            parts.push({
              functionCall: {
                ...(block.id.startsWith(LOCAL_ID_PREFIX) ? {} : { id: block.id }),
                name: block.name,
                args: block.input,
              },
              thoughtSignature: DUMMY_THOUGHT_SIGNATURE,
            });
            break;
          case "tool_result":
            parts.push({
              functionResponse: {
                ...(block.toolCallId.startsWith(LOCAL_ID_PREFIX) ? {} : { id: block.toolCallId }),
                name: names.get(block.toolCallId) ?? "unbekannt",
                response: parseResultObject(block.content, Boolean(block.isError)),
              },
            });
            break;
          case "opaque":
            break;
        }
      }
    }
    if (parts.length > 0) contents.push({ role: message.role === "assistant" ? "model" : "user", parts });
  }
  return contents;
}

/** Gesammelte Gemini-Teile → neutrales Format (Rohteile bleiben als "opaque" erhalten). */
export function fromGeminiParts(parts: Part[]): ContentBlock[] {
  const blocks: ContentBlock[] = [{ type: "opaque", provider: PROVIDER_ID, data: { parts } satisfies RawParts }];
  let text = "";
  const flush = () => {
    if (text) blocks.push({ type: "text", text });
    text = "";
  };
  for (const part of parts) {
    if (part.thought) continue;
    if (typeof part.text === "string") {
      text += part.text;
    } else if (part.functionCall?.name) {
      flush();
      blocks.push({
        type: "tool_call",
        id: part.functionCall.id || `${LOCAL_ID_PREFIX}${randomUUID()}`,
        name: part.functionCall.name,
        input: part.functionCall.args ?? {},
      });
    }
  }
  flush();
  return blocks;
}

/** Hängt einen Stream-Teil an; reine Textteile ohne Signatur werden zusammengefasst. */
export function appendPart(parts: Part[], part: Part): void {
  const last = parts[parts.length - 1];
  const plainText = (p: Part) => typeof p.text === "string" && !p.thought && !p.thoughtSignature && Object.keys(p).length === 1;
  if (last && plainText(last) && plainText(part)) {
    parts[parts.length - 1] = { text: (last.text ?? "") + part.text };
  } else {
    parts.push(part);
  }
}

export function mapFinishReason(reason: string | undefined, hasToolCalls: boolean): StopReason {
  if (hasToolCalls && (reason === undefined || reason === "STOP")) return "tool_use";
  switch (reason) {
    case undefined:
    case "STOP":
      return "end";
    case "MAX_TOKENS":
      return "max_tokens";
    case "SAFETY":
    case "RECITATION":
    case "BLOCKLIST":
    case "PROHIBITED_CONTENT":
    case "SPII":
    case "LANGUAGE":
      return "refusal";
    default:
      return "other";
  }
}

function hasOpaque(messages: ChatMessage[]): boolean {
  return messages.some((m) => m.content.some(isGeminiOpaque));
}

function toProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return new ProviderError(
          "Google hat die KI-Anfrage abgelehnt. Bitte GEMINI_API_KEY und GEMINI_MODEL prüfen.",
          false,
          "bad_request",
        );
      case 401:
      case 403:
        return new ProviderError("Der Gemini-API-Schlüssel wurde abgelehnt. Bitte GEMINI_API_KEY prüfen.", false, "auth");
      case 404:
        return new ProviderError("Das eingestellte Gemini-Modell wurde nicht gefunden. Bitte GEMINI_MODEL prüfen.", false, "bad_request");
      case 429:
        return new ProviderError(
          "Das kostenlose Gemini-Limit ist gerade erreicht. Bitte kurz warten (meist eine Minute, beim Tageslimit bis morgen).",
          true,
          "rate_limit",
        );
      default:
        if (error.status >= 500) {
          return new ProviderError("Google ist gerade überlastet. Bitte gleich noch einmal versuchen.", true, "overloaded");
        }
        return new ProviderError(`Fehler bei Google (Status ${error.status}).`, true, "unknown");
    }
  }
  if (error instanceof TypeError) {
    return new ProviderError("Keine Verbindung zu Google. Bitte erneut versuchen.", true, "network");
  }
  return new ProviderError("Unbekannter Fehler bei der KI-Anfrage.", true, "unknown");
}

export class GeminiProvider implements ChatProvider {
  readonly id = PROVIDER_ID;
  readonly model: string;
  private readonly client: GoogleGenAI;
  private readonly maxOutputTokens: number;

  constructor(options: Options) {
    this.client = new GoogleGenAI({
      apiKey: options.apiKey,
      ...(options.baseUrl ? { httpOptions: { baseUrl: options.baseUrl } } : {}),
    });
    this.model = options.model;
    this.maxOutputTokens = options.maxOutputTokens;
  }

  async streamTurn(request: TurnRequest): Promise<TurnResult> {
    let emittedText = false;
    const run = async (keepOpaque: boolean): Promise<TurnResult> => {
      const stream = await this.client.models.generateContentStream({
        model: this.model,
        contents: toGeminiContents(request.messages, keepOpaque),
        config: {
          systemInstruction: request.system,
          maxOutputTokens: this.maxOutputTokens,
          tools: [
            {
              functionDeclarations: request.tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                parametersJsonSchema: toGeminiSchema(tool.inputSchema),
              })),
            },
          ],
          toolConfig: {
            functionCallingConfig: {
              mode: request.toolChoice === "none" ? FunctionCallingConfigMode.NONE : FunctionCallingConfigMode.AUTO,
            },
          },
          abortSignal: request.signal,
        },
      });

      const parts: Part[] = [];
      let finishReason: string | undefined;
      let blocked = false;
      let usage = { inputTokens: 0, outputTokens: 0 };
      for await (const chunk of stream) {
        if (chunk.promptFeedback?.blockReason) blocked = true;
        const candidate = chunk.candidates?.[0];
        for (const part of candidate?.content?.parts ?? []) {
          if (typeof part.text === "string" && part.text && !part.thought) {
            emittedText = true;
            request.onTextDelta(part.text);
          }
          appendPart(parts, part);
        }
        if (candidate?.finishReason) finishReason = candidate.finishReason;
        if (chunk.usageMetadata) {
          usage = {
            inputTokens: chunk.usageMetadata.promptTokenCount ?? 0,
            outputTokens: (chunk.usageMetadata.candidatesTokenCount ?? 0) + (chunk.usageMetadata.thoughtsTokenCount ?? 0),
          };
        }
      }

      const content = fromGeminiParts(parts);
      const hasToolCalls = content.some((b) => b.type === "tool_call");
      return {
        content,
        stopReason: blocked ? "refusal" : mapFinishReason(finishReason, hasToolCalls),
        usage,
      };
    };

    try {
      return await run(true);
    } catch (error) {
      // Wie beim Anthropic-Adapter: Bei einer Ablehnung (400) einmal ohne gespeicherte
      // Rohteile wiederholen – Funktionsaufrufe bekommen dann die Platzhalter-Signatur.
      if (error instanceof ApiError && error.status === 400 && !emittedText && hasOpaque(request.messages)) {
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
