import "server-only";

// Zentrale, serverseitige Konfiguration. Geheime Werte (ANTHROPIC_API_KEY)
// werden hier nur gelesen, nie geloggt und nie an den Browser geschickt.

function intFromEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

export type Effort = "low" | "medium" | "high";

export function getAiConfig() {
  const effortRaw = (process.env.ANTHROPIC_EFFORT ?? "").trim();
  const effort: Effort | undefined =
    effortRaw === "low" || effortRaw === "medium" || effortRaw === "high" ? effortRaw : undefined;
  return {
    apiKey: process.env.ANTHROPIC_API_KEY?.trim() || undefined,
    model: process.env.ANTHROPIC_MODEL?.trim() || "claude-haiku-5-5",
    effort,
    maxOutputTokens: intFromEnv("AI_MAX_OUTPUT_TOKENS", 4000, 512, 32000),
  };
}

export function getLimits() {
  return {
    chatPerMinute: intFromEnv("RATE_LIMIT_CHAT_PER_MINUTE", 10, 1, 1000),
    chatPerDay: intFromEnv("RATE_LIMIT_CHAT_PER_DAY", 150, 1, 100000),
    apiPerMinute: intFromEnv("RATE_LIMIT_API_PER_MINUTE", 120, 1, 10000),
  };
}

export function getTimezone(): string {
  const tz = process.env.APP_TIMEZONE?.trim() || "Europe/Berlin";
  try {
    new Intl.DateTimeFormat("de-DE", { timeZone: tz });
    return tz;
  } catch {
    return "Europe/Berlin";
  }
}

export function getAllowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
