// Vorbereitung für spätere Spracheingabe und Vorlesen – NOCH NICHT IMPLEMENTIERT.
//
// Geplanter Weg (ohne zusätzliche Kosten): die im Browser eingebaute Web Speech
// API. Spracheingabe liefert Text, der in den Composer geschrieben wird
// (Composer bekommt seinen Text bereits über value/onChange von außen).
// Vorlesen nutzt window.speechSynthesis mit dem Text der KI-Antwort.
//
// Wichtig für die Umsetzung: Mikrofon nur nach ausdrücklichem Klick aktivieren
// (kein dauerhaftes Mithören) und in next.config.ts die Permissions-Policy für
// "microphone" auf die eigene Seite erlauben: microphone=(self).

export interface SpeechInput {
  readonly supported: boolean;
  /** Startet eine einzelne Aufnahme; liefert den erkannten Text. */
  listenOnce(options?: { lang?: string; signal?: AbortSignal }): Promise<string>;
}

export interface SpeechOutput {
  readonly supported: boolean;
  speak(text: string, options?: { lang?: string }): void;
  stop(): void;
}
