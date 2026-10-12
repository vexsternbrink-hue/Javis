"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { MicIcon, SendIcon, StopIcon } from "../icons";
import { useSpeechInput, useSpeechInputSupported } from "../voice/hooks";

export const MAX_MESSAGE_CHARS = 4000;

/**
 * Eingabefeld für Nachrichten. Bekommt den Text von außen (value/onChange);
 * die Spracheingabe schreibt live in dasselbe Feld und sendet nach der
 * Sprechpause automatisch (onVoiceSubmit).
 */
export function Composer({
  value,
  onChange,
  onSubmit,
  onVoiceSubmit,
  onStop,
  streaming,
  disabled,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onVoiceSubmit?: (text: string) => void;
  onStop: () => void;
  streaming: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const micSupported = useSpeechInputSupported();
  const baseRef = useRef("");
  const speech = useSpeechInput((text, final) => {
    const combined = `${baseRef.current}${baseRef.current && text ? " " : ""}${text}`.slice(0, MAX_MESSAGE_CHARS);
    onChange(combined);
    if (final && onVoiceSubmit && combined.trim()) onVoiceSubmit(combined.trim());
  });

  function toggleMic() {
    if (speech.listening) {
      speech.stop();
      return;
    }
    baseRef.current = value.trim();
    speech.start();
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value]);

  const tooLong = value.length > MAX_MESSAGE_CHARS;
  const canSend = !streaming && !disabled && value.trim().length > 0 && !tooLong;

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sendet, Umschalt+Enter macht eine neue Zeile (nicht während der IME-Eingabe)
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (canSend) onSubmit();
    }
  }

  return (
    <form
      className="mx-auto w-full max-w-3xl"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSubmit();
      }}
    >
      <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-2 focus-within:border-accent/70">
        <label htmlFor="chat-input" className="sr-only">
          Nachricht an Jarvis
        </label>
        <textarea
          id="chat-input"
          ref={ref}
          rows={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={speech.listening ? "Ich höre zu … sprich jetzt" : (placeholder ?? "Nachricht an Jarvis …")}
          disabled={disabled}
          className="max-h-56 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-base text-text placeholder:text-muted/70 focus:outline-none"
        />
        {micSupported && !streaming && (
          <button
            type="button"
            onClick={toggleMic}
            disabled={disabled}
            className={`flex size-10 shrink-0 items-center justify-center rounded-xl border transition ${
              speech.listening
                ? "animate-pulse border-danger/70 bg-danger-soft text-danger shadow-[0_0_16px_-4px_rgba(255,107,122,0.9)]"
                : "border-line bg-surface-2 text-muted hover:border-accent/60 hover:text-accent"
            } disabled:opacity-50`}
            aria-label={speech.listening ? "Aufnahme beenden" : "Spracheingabe starten"}
            aria-pressed={speech.listening}
            title={speech.listening ? "Aufnahme beenden" : "Spracheingabe"}
          >
            <MicIcon />
          </button>
        )}
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 text-text hover:border-danger/60"
            aria-label="Antwort stoppen"
          >
            <StopIcon />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-strong text-white hover:bg-accent disabled:bg-surface-2 disabled:text-muted"
            aria-label="Senden"
          >
            <SendIcon />
          </button>
        )}
      </div>
      <div className="flex justify-between px-2 pt-1.5 text-xs text-muted">
        {speech.error ? (
          <span className="text-danger">{speech.error}</span>
        ) : (
          <span className="hidden sm:inline">
            Enter zum Senden, Umschalt+Enter für neue Zeile{micSupported ? " · Mikrofon für Spracheingabe" : ""}
          </span>
        )}
        {value.length > MAX_MESSAGE_CHARS * 0.8 && (
          <span className={tooLong ? "text-danger" : ""}>
            {value.length}/{MAX_MESSAGE_CHARS}
          </span>
        )}
      </div>
    </form>
  );
}
