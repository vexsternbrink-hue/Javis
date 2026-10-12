// Spracheingabe und Vorlesen über die im Browser eingebaute Web Speech API
// (kostenlos, kein Schlüssel). Das Mikrofon wird nur nach ausdrücklichem
// Klick aktiviert – es gibt kein dauerhaftes Mithören.
//
// Hinweis Datenschutz: Je nach Browser wird die Aufnahme zur Erkennung an den
// Browser-Hersteller übertragen (Chrome → Google, Safari → Apple).

type RecognitionResultList = ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;

export type RecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { resultIndex: number; results: RecognitionResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type RecognitionCtor = new () => RecognitionLike;

export function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechInputSupported(): boolean {
  return getRecognitionCtor() !== null;
}

export function speechOutputSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

export function recognitionErrorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Mikrofon-Zugriff wurde nicht erlaubt. Bitte in den Browser-Einstellungen freigeben.";
    case "no-speech":
      return "Ich habe nichts gehört. Bitte noch einmal versuchen.";
    case "audio-capture":
      return "Kein Mikrofon gefunden.";
    case "network":
      return "Die Spracherkennung braucht eine Internetverbindung.";
    case "aborted":
      return "";
    default:
      return "Die Spracherkennung ist fehlgeschlagen.";
  }
}

// ---------------------------------------------------------------------------
// Vorlesen
// ---------------------------------------------------------------------------

/** Entfernt Markdown-Zeichen, damit der Text natürlich vorgelesen wird. */
export function toSpeakableText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " (Codeblock ausgelassen) ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, "")
    .replace(/\|/g, ", ")
    .replace(/(\*\*|__|\*|_|~~)/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Teilt langen Text in Stücke (manche Browser brechen lange Äußerungen ab). */
export function splitForSpeech(text: string, maxLength = 220): string[] {
  const sentences = text.match(/[^.!?…]+[.!?…]*\s*/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if ((current + sentence).length > maxLength && current) {
      chunks.push(current.trim());
      current = "";
    }
    if (sentence.length > maxLength) {
      for (let i = 0; i < sentence.length; i += maxLength) chunks.push(sentence.slice(i, i + maxLength).trim());
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

export type VoicePrefs = { autoSpeak: boolean; voiceURI: string | null; rate: number };
const PREFS_KEY = "jarvis.voice.v1";
export const DEFAULT_VOICE_PREFS: VoicePrefs = { autoSpeak: false, voiceURI: null, rate: 1 };

export function loadVoicePrefs(): VoicePrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_VOICE_PREFS;
    const p = JSON.parse(raw) as Partial<VoicePrefs>;
    return {
      autoSpeak: p.autoSpeak === true,
      voiceURI: typeof p.voiceURI === "string" ? p.voiceURI : null,
      rate: typeof p.rate === "number" && p.rate >= 0.5 && p.rate <= 2 ? p.rate : 1,
    };
  } catch {
    return DEFAULT_VOICE_PREFS;
  }
}

let cachedPrefs: VoicePrefs | null = null;
const prefListeners = new Set<() => void>();

export function saveVoicePrefs(prefs: VoicePrefs) {
  cachedPrefs = prefs;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Speicher nicht verfügbar (z. B. privater Modus) – Einstellung gilt nur für diese Sitzung
  }
  prefListeners.forEach((l) => l());
}

/** Gerätebezogene Spracheinstellungen als Store (für useSyncExternalStore). */
export const voicePrefsStore = {
  subscribe(listener: () => void) {
    prefListeners.add(listener);
    return () => prefListeners.delete(listener);
  },
  getSnapshot(): VoicePrefs {
    if (!cachedPrefs) cachedPrefs = loadVoicePrefs();
    return cachedPrefs;
  },
  getServerSnapshot(): VoicePrefs {
    return DEFAULT_VOICE_PREFS;
  },
};

export function germanVoices(): SpeechSynthesisVoice[] {
  if (!speechOutputSupported()) return [];
  return window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("de"));
}

function pickVoice(prefs: VoicePrefs): SpeechSynthesisVoice | null {
  const all = window.speechSynthesis.getVoices();
  if (prefs.voiceURI) {
    const chosen = all.find((v) => v.voiceURI === prefs.voiceURI);
    if (chosen) return chosen;
  }
  return all.find((v) => v.lang.toLowerCase().startsWith("de")) ?? null;
}

/** Liest Text vor. Gibt eine Funktion zurück, die das Vorlesen stoppt. */
export function speak(markdown: string, options: { onEnd?: () => void; prefs?: VoicePrefs } = {}): () => void {
  if (!speechOutputSupported()) return () => {};
  const synth = window.speechSynthesis;
  synth.cancel();
  const prefs = options.prefs ?? voicePrefsStore.getSnapshot();
  const voice = pickVoice(prefs);
  const chunks = splitForSpeech(toSpeakableText(markdown));
  let cancelled = false;
  chunks.forEach((chunk, index) => {
    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.lang = voice?.lang ?? "de-DE";
    if (voice) utterance.voice = voice;
    utterance.rate = prefs.rate;
    if (index === chunks.length - 1) {
      utterance.onend = () => {
        if (!cancelled) options.onEnd?.();
      };
    }
    utterance.onerror = () => {
      if (!cancelled) options.onEnd?.();
    };
    synth.speak(utterance);
  });
  if (chunks.length === 0) options.onEnd?.();
  return () => {
    cancelled = true;
    synth.cancel();
  };
}

export function stopSpeaking() {
  if (speechOutputSupported()) window.speechSynthesis.cancel();
}
