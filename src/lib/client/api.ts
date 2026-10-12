// Kleiner fetch-Wrapper für den Browser: wirft Fehler mit deutscher Meldung.

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...rest.headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Keine Verbindung zum Server. Bist du online?", 0);
  }
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // keine JSON-Antwort
  }
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : `Fehler (${response.status})`;
    if (response.status === 401) goToLogin();
    throw new ApiError(message, response.status);
  }
  return data as T;
}

/** Sitzung abgelaufen: komplett neu laden, damit der Proxy zur Anmeldung umleitet. */
export function goToLogin() {
  if (typeof window !== "undefined") window.location.replace(new URL("/login", window.location.origin));
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unbekannter Fehler.";
}
