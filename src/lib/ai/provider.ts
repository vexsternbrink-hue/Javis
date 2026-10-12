import "server-only";
import { getAiConfig } from "../env";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { ProviderError, type ChatProvider } from "./types";

/**
 * Liefert den konfigurierten KI-Anbieter (AI_PROVIDER). Ein weiterer Anbieter
 * braucht nur einen eigenen Adapter, der das Interface ChatProvider (types.ts)
 * erfüllt – Agent, Tools und Oberfläche bleiben gleich.
 */
export function getChatProvider(): ChatProvider {
  const config = getAiConfig();
  if (config.provider === "gemini") {
    if (!config.gemini.apiKey) {
      throw new ProviderError(
        "Der KI-Zugang ist noch nicht eingerichtet: GEMINI_API_KEY fehlt (siehe README).",
        false,
        "config",
      );
    }
    return new GeminiProvider({
      apiKey: config.gemini.apiKey,
      model: config.gemini.model,
      maxOutputTokens: config.maxOutputTokens,
    });
  }
  if (!config.anthropic.apiKey) {
    throw new ProviderError(
      "Der KI-Zugang ist noch nicht eingerichtet: Es fehlt GEMINI_API_KEY (kostenlos) oder ANTHROPIC_API_KEY (siehe README).",
      false,
      "config",
    );
  }
  return new AnthropicProvider({
    apiKey: config.anthropic.apiKey,
    model: config.anthropic.model,
    effort: config.anthropic.effort,
    maxOutputTokens: config.maxOutputTokens,
  });
}
