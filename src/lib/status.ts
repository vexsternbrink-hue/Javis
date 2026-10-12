import "server-only";
import { getAiConfig } from "./env";
import { integrationStatus, isIntegrationOwner } from "./integrations/config";

export type ServiceState = "configured" | "missing" | "not_owner" | "ok";

export type SystemStatus = {
  ai: { provider: string; model: string; configured: boolean };
  database: "ok";
  mail: ServiceState;
  calendar: ServiceState;
};

/** Echter Einrichtungsstatus (keine Messwerte, keine Schätzungen). */
export function getSystemStatus(userEmail: string | null | undefined): SystemStatus {
  const ai = getAiConfig();
  const owner = isIntegrationOwner(userEmail);
  const integrations = integrationStatus();
  return {
    ai: {
      provider: ai.provider,
      model: ai.provider === "gemini" ? ai.gemini.model : ai.anthropic.model,
      configured: ai.provider === "gemini" ? Boolean(ai.gemini.apiKey) : Boolean(ai.anthropic.apiKey),
    },
    database: "ok",
    mail: owner ? integrations.mail : "not_owner",
    calendar: owner ? integrations.calendar : "not_owner",
  };
}
