import "server-only";
import { getAiConfig } from "../env";
import { AnthropicProvider } from "./anthropic";
import { ProviderError, type ChatProvider } from "./types";

/**
 * Liefert den konfigurierten KI-Anbieter. Um später einen anderen Anbieter zu
 * nutzen, implementiert man das Interface ChatProvider (types.ts) und wählt
 * ihn hier aus – der restliche Code (Agent, Tools, Oberfläche) bleibt gleich.
 */
export function getChatProvider(): ChatProvider {
  const config = getAiConfig();
  if (!config.apiKey) {
    throw new ProviderError(
      "Der KI-Zugang ist noch nicht eingerichtet: ANTHROPIC_API_KEY fehlt (siehe README).",
      false,
      "config",
    );
  }
  return new AnthropicProvider({
    apiKey: config.apiKey,
    model: config.model,
    effort: config.effort,
    maxOutputTokens: config.maxOutputTokens,
  });
}
