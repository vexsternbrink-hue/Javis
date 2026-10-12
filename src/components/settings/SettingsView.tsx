"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { UserSettings } from "@/lib/data/types";
import type { SystemStatus } from "@/lib/client/types";
import { api, errorMessage } from "@/lib/client/api";
import { germanVoices, saveVoicePrefs, speak, voicePrefsStore } from "@/lib/voice/speech";
import { CloudIcon, DownloadIcon, LogoutIcon, MicIcon, SettingsIcon, ShieldIcon, SpeakerIcon } from "../icons";
import { useSpeechInputSupported, useSpeechOutputSupported } from "../voice/hooks";
import { Button, ErrorBanner, PageHeader, Spinner, inputClass } from "../ui";

function subscribeVoices(callback: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return () => {};
  window.speechSynthesis.addEventListener("voiceschanged", callback);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", callback);
}
const voicesSnapshot = () =>
  germanVoices()
    .map((v) => `${v.voiceURI}\t${v.name}\t${v.lang}`)
    .join("\n");

export function SettingsView({ email }: { email: string }) {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<{ settings: UserSettings }>("/api/settings").then(
      (data) => {
        if (!active) return;
        setSettings(data.settings);
        setName(data.settings.display_name ?? "");
        setCity(data.settings.city ?? "");
      },
      (e) => active && setError(errorMessage(e)),
    );
    api<{ status: SystemStatus }>("/api/status").then(
      (data) => active && setStatus(data.status),
      () => {},
    );
    return () => {
      active = false;
    };
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const { settings: next } = await api<{ settings: UserSettings }>("/api/settings", {
        method: "PUT",
        json: { display_name: name.trim() || null, city: city.trim() || null },
      });
      setSettings(next);
      setName(next.display_name ?? "");
      setCity(next.city ?? "");
      setSaved(next.city ? `Gespeichert. Wetter-Ort: ${next.city}` : "Gespeichert.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const dirty = settings !== null && (name.trim() !== (settings.display_name ?? "") || city.trim() !== (settings.city ?? ""));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        <PageHeader title="Einstellungen" description="Persönliche Angaben, Wetter, Stimme und deine Daten." />

        <form onSubmit={save} className="hud-panel space-y-4 p-5">
          <SectionTitle icon={<SettingsIcon width={16} height={16} />} title="Profil & Wetter" />
          {settings === null && !error ? (
            <Spinner />
          ) : (
            <>
              <label className="block text-sm">
                <span className="text-muted">Wie soll Jarvis dich begrüßen?</span>
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Dein Vorname" className={`${inputClass} mt-1`} />
              </label>
              <label className="block text-sm">
                <span className="text-muted">Ort für die Wettervorhersage</span>
                <input value={city} onChange={(e) => setCity(e.target.value)} maxLength={120} placeholder="z. B. München" className={`${inputClass} mt-1`} />
                <span className="mt-1 block text-xs text-muted">
                  Wetterdaten von Open-Meteo (kostenlos, ohne Konto). Übertragen wird nur der Ortsname bzw. die Koordinaten des Ortes.
                </span>
              </label>
              {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
              {saved && !dirty && <p className="text-sm text-success">✓ {saved}</p>}
              <div className="flex justify-end">
                <Button type="submit" variant="primary" disabled={saving || !dirty}>
                  {saving ? "Speichert …" : "Speichern"}
                </Button>
              </div>
            </>
          )}
        </form>

        <VoiceSettings />

        <section className="hud-panel space-y-3 p-5">
          <SectionTitle icon={<ShieldIcon width={16} height={16} />} title="Verbundene Dienste" />
          {!status ? (
            <Spinner />
          ) : (
            <ul className="space-y-2 text-sm">
              <ServiceRow
                label="KI"
                detail={`${status.ai.provider === "gemini" ? "Google Gemini" : "Anthropic Claude"} · ${status.ai.model}`}
                ok={status.ai.configured}
              />
              <ServiceRow label="GMX-Postfach" detail="nur lesen" ok={status.mail === "configured"} missing={status.mail === "not_owner" ? "nur für den Besitzer" : undefined} />
              <ServiceRow label="Apple-Kalender" detail="iCloud" ok={status.calendar === "configured"} missing={status.calendar === "not_owner" ? "nur für den Besitzer" : undefined} />
              <ServiceRow label="Wetter" detail="Open-Meteo" ok={Boolean(settings?.latitude !== null && settings?.latitude !== undefined)} missing="Ort oben eintragen" />
            </ul>
          )}
          <p className="text-xs text-muted">
            GMX und iCloud werden mit Zugangsdaten in den Vercel-Umgebungsvariablen verbunden – niemals hier oder im Chat. Anleitung: README, Abschnitt „GMX &amp; Apple-Kalender“.
          </p>
        </section>

        <section className="hud-panel space-y-3 p-5">
          <SectionTitle icon={<DownloadIcon width={16} height={16} />} title="Deine Daten" />
          <p className="text-sm text-muted">
            Lade alle deine Chats, Aufgaben, Notizen, Erinnerungen, Gewohnheiten und Fokus-Einheiten als JSON-Datei herunter – z. B. als Sicherung.
          </p>
          <a
            href="/api/export"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line bg-surface-2 px-3.5 py-2 text-sm font-medium hover:border-accent/60"
          >
            <DownloadIcon width={16} height={16} /> Daten exportieren
          </a>
        </section>

        <section className="hud-panel space-y-3 p-5">
          <SectionTitle icon={<LogoutIcon width={16} height={16} />} title="Konto & Tastenkürzel" />
          <p className="text-sm">
            Angemeldet als <span className="text-accent">{email}</span>
          </p>
          <ul className="grid gap-1.5 text-sm text-muted sm:grid-cols-2">
            <li>
              <Kbd>Strg/⌘ K</Kbd> Suchen &amp; Befehle
            </li>
            <li>
              <Kbd>Enter</Kbd> Nachricht senden
            </li>
            <li>
              <Kbd>Umschalt Enter</Kbd> neue Zeile
            </li>
            <li>
              <Kbd>Esc</Kbd> Palette schließen
            </li>
          </ul>
          <form action="/auth/signout" method="post">
            <Button type="submit">
              <LogoutIcon width={16} height={16} /> Abmelden
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}

function VoiceSettings() {
  const outputSupported = useSpeechOutputSupported();
  const inputSupported = useSpeechInputSupported();
  const prefs = useSyncExternalStore(voicePrefsStore.subscribe, voicePrefsStore.getSnapshot, voicePrefsStore.getServerSnapshot);
  const voicesRaw = useSyncExternalStore(subscribeVoices, voicesSnapshot, () => "");
  const voices = voicesRaw
    ? voicesRaw.split("\n").map((line) => {
        const [uri, name, lang] = line.split("\t");
        return { uri, name, lang };
      })
    : [];

  return (
    <section className="hud-panel space-y-4 p-5">
      <SectionTitle icon={<SpeakerIcon width={16} height={16} />} title="Sprache (dieses Gerät)" />
      <ul className="space-y-1 text-sm">
        <li className="flex items-center gap-2">
          <MicIcon width={16} height={16} className={inputSupported ? "text-success" : "text-muted"} />
          Spracheingabe: {inputSupported ? "verfügbar (Mikrofon-Knopf im Chat)" : "von diesem Browser nicht unterstützt"}
        </li>
        <li className="flex items-center gap-2">
          <SpeakerIcon width={16} height={16} className={outputSupported ? "text-success" : "text-muted"} />
          Vorlesen: {outputSupported ? "verfügbar" : "von diesem Browser nicht unterstützt"}
        </li>
      </ul>
      {outputSupported && (
        <>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={prefs.autoSpeak}
              onChange={(e) => saveVoicePrefs({ ...prefs, autoSpeak: e.target.checked })}
              className="size-4 accent-[#3fd0ff]"
            />
            Antworten von Jarvis automatisch vorlesen
          </label>
          {voices.length > 0 && (
            <label className="block text-sm">
              <span className="text-muted">Stimme</span>
              <select
                value={prefs.voiceURI ?? ""}
                onChange={(e) => saveVoicePrefs({ ...prefs, voiceURI: e.target.value || null })}
                className={`${inputClass} mt-1`}
              >
                <option value="">Automatisch (erste deutsche Stimme)</option>
                {voices.map((v) => (
                  <option key={v.uri} value={v.uri}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-wrap items-center gap-3 text-sm text-muted">
            Tempo
            <input
              type="range"
              min={0.7}
              max={1.5}
              step={0.1}
              value={prefs.rate}
              onChange={(e) => saveVoicePrefs({ ...prefs, rate: Number(e.target.value) })}
              className="flex-1 accent-[#3fd0ff]"
            />
            <span className="w-10 text-right text-text">{prefs.rate.toFixed(1)}×</span>
          </label>
          <Button onClick={() => speak("Hallo, ich bin Jarvis. So klinge ich mit diesen Einstellungen.")}>
            <SpeakerIcon width={16} height={16} /> Probe hören
          </Button>
        </>
      )}
      <p className="text-xs text-muted">
        Spracheingabe und Vorlesen nutzen die eingebaute Sprachfunktion deines Browsers (kostenlos). Bei der Spracheingabe kann der Browser die Aufnahme zur
        Erkennung an seinen Hersteller senden (Chrome: Google, Safari: Apple). Das Mikrofon ist nur aktiv, solange du den Mikrofon-Knopf gedrückt hast.
      </p>
    </section>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h2 className="flex items-center gap-2">
      <span className="text-accent">{icon}</span>
      <span className="hud-title">{title}</span>
    </h2>
  );
}

function ServiceRow({ label, detail, ok, missing = "nicht eingerichtet" }: { label: string; detail: string; ok: boolean; missing?: string }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-line/60 bg-surface-2/50 px-3 py-2">
      <CloudIcon width={16} height={16} className="text-accent" />
      <span className="min-w-0 flex-1">
        <span className="font-medium">{label}</span> <span className="text-muted">· {detail}</span>
      </span>
      <span className={`flex items-center gap-1.5 whitespace-nowrap text-xs ${ok ? "text-success" : "text-warn"}`}>
        <span className="status-dot" /> {ok ? "Verbunden" : missing}
      </span>
    </li>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="mr-1.5 rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[0.7rem] text-text">{children}</kbd>;
}
