/** Fehler mit einer für Nutzer verständlichen, deutschen Meldung. */
export class DataError extends Error {
  constructor(
    message: string,
    public readonly status = 500,
  ) {
    super(message);
    this.name = "DataError";
  }
}

export function dbError(action: string, error: { code?: string } | null): never {
  // Keine Datenbankdetails an Nutzer oder Logs mit Inhalten weitergeben.
  console.error(`Datenbankfehler bei "${action}":`, error?.code ?? "unbekannt");
  throw new DataError(`Datenbankfehler beim ${action}.`);
}
