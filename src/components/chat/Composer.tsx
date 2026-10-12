"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { SendIcon, StopIcon } from "../icons";

export const MAX_MESSAGE_CHARS = 4000;

/**
 * Eingabefeld für Nachrichten. Bekommt den Text von außen (value/onChange),
 * damit später z. B. eine Spracheingabe denselben Text befüllen kann.
 */
export function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  streaming,
  disabled,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  streaming: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

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
          placeholder={placeholder ?? "Nachricht an Jarvis …"}
          disabled={disabled}
          className="max-h-56 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-base text-text placeholder:text-muted/70 focus:outline-none"
        />
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
        <span className="hidden sm:inline">Enter zum Senden, Umschalt+Enter für neue Zeile</span>
        {value.length > MAX_MESSAGE_CHARS * 0.8 && (
          <span className={tooLong ? "text-danger" : ""}>
            {value.length}/{MAX_MESSAGE_CHARS}
          </span>
        )}
      </div>
    </form>
  );
}
