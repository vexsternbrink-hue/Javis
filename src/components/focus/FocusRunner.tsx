"use client";

import { useEffect, useSyncExternalStore } from "react";
import { api } from "@/lib/client/api";
import { focusActions, focusStore } from "@/lib/client/focus-store";

export const FOCUS_SAVED_EVENT = "jarvis:focus-saved";

/** Kurzer Signalton über die Web Audio API (keine Audiodatei nötig). */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [660, 880, 990].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.22;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.55);
    });
    setTimeout(() => void ctx.close(), 1500);
  } catch {
    // Audio nicht verfügbar
  }
}

function notify(title: string, body: string) {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, { body, icon: "/icon.svg", tag: "jarvis-focus" });
    }
  } catch {
    // Benachrichtigungen nicht verfügbar (z. B. iOS ohne installierte App)
  }
}

/**
 * Unsichtbarer Begleiter im App-Rahmen: prüft, ob der Timer abgelaufen ist,
 * speichert abgeschlossene Fokus-Einheiten und gibt Ton/Benachrichtigung aus.
 */
export function FocusRunner() {
  const state = useSyncExternalStore(focusStore.subscribe, focusStore.getSnapshot, focusStore.getServerSnapshot);
  const running = state.status === "running";

  useEffect(() => {
    if (!running) return;
    const check = () => {
      const finished = focusActions.finishIfElapsed();
      if (!finished) return;
      // Längst abgelaufene Timer (Seite war lange zu) still beenden, nicht nachträglich zählen
      if (Date.now() - finished.endedAt > 6 * 3600_000) return;
      chime();
      if (finished.mode === "focus") {
        notify("Fokus-Einheit geschafft! 🎯", `${finished.minutes} Minuten${finished.label ? ` · ${finished.label}` : ""}. Zeit für eine Pause.`);
        api("/api/focus", { method: "POST", json: { minutes: finished.minutes, label: finished.label || null } }).then(
          () => window.dispatchEvent(new CustomEvent(FOCUS_SAVED_EVENT)),
          () => window.dispatchEvent(new CustomEvent(FOCUS_SAVED_EVENT, { detail: { error: true } })),
        );
      } else {
        notify("Pause vorbei", "Bereit für die nächste Fokus-Einheit?");
      }
    };
    const first = setTimeout(check, 0);
    const timer = setInterval(check, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [running]);

  return null;
}
