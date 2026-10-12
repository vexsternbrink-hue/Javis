// Reine Funktion, damit sie ohne Server-Umgebung getestet werden kann.

/**
 * Prüft, ob eine E-Mail-Adresse Jarvis benutzen darf.
 * - Ist die Liste gesetzt, muss die Adresse darin stehen.
 * - Ist die Liste leer, ist das nur in der lokalen Entwicklung erlaubt;
 *   in Produktion wird dann jeder abgewiesen (sicherer Standard).
 */
export function isEmailAllowed(
  email: string | null | undefined,
  allowed: string[],
  production: boolean,
): boolean {
  if (!email) return false;
  if (allowed.length === 0) return !production;
  return allowed.includes(email.trim().toLowerCase());
}
