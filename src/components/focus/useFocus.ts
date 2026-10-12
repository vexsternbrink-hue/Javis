"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { focusStore, remainingSeconds } from "@/lib/client/focus-store";

/** Aktueller Timer-Zustand + verbleibende Sekunden (aktualisiert sich jede Sekunde). */
export function useFocusTimer() {
  const state = useSyncExternalStore(focusStore.subscribe, focusStore.getSnapshot, focusStore.getServerSnapshot);
  const [now, setNow] = useState(0);
  const running = state.status === "running";

  useEffect(() => {
    if (!running) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 500);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [running]);

  // Bis zum ersten Tick die volle Restzeit zeigen
  const remaining = running && now === 0 ? state.remainingSec : remainingSeconds(state, now);
  return { state, remaining };
}
