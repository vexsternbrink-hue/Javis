// Zustand des Fokus-Timers – im Browser gespeichert (localStorage), damit der
// Timer beim Seitenwechsel und Neuladen weiterläuft. Gezählt wird über den
// Endzeitpunkt, nicht über Intervalle; dadurch bleibt die Zeit genau.

export type FocusMode = "focus" | "break";
export type FocusStatus = "idle" | "running" | "paused";

export type FocusState = {
  mode: FocusMode;
  /** geplante Dauer in Sekunden */
  totalSec: number;
  label: string;
  status: FocusStatus;
  /** Endzeitpunkt (ms) während der Timer läuft */
  endAt: number | null;
  /** verbleibende Sekunden im Zustand idle/paused */
  remainingSec: number;
};

export type FinishedRun = { mode: FocusMode; minutes: number; label: string; endedAt: number };

const KEY = "jarvis.focus.v1";
export const FOCUS_DEFAULT: FocusState = {
  mode: "focus",
  totalSec: 25 * 60,
  label: "",
  status: "idle",
  endAt: null,
  remainingSec: 25 * 60,
};

let state: FocusState = FOCUS_DEFAULT;
let loaded = false;
const listeners = new Set<() => void>();

function isValid(value: unknown): value is FocusState {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    (v.mode === "focus" || v.mode === "break") &&
    typeof v.totalSec === "number" &&
    v.totalSec > 0 &&
    v.totalSec <= 180 * 60 &&
    typeof v.label === "string" &&
    (v.status === "idle" || v.status === "running" || v.status === "paused") &&
    (v.endAt === null || typeof v.endAt === "number") &&
    typeof v.remainingSec === "number"
  );
}

function readStorage(): FocusState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function ensureLoaded() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  state = readStorage() ?? FOCUS_DEFAULT;
  // Andere Tabs halten den Timer synchron
  window.addEventListener("storage", (event) => {
    if (event.key !== KEY) return;
    state = readStorage() ?? FOCUS_DEFAULT;
    listeners.forEach((l) => l());
  });
}

function set(next: FocusState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ohne Speicher läuft der Timer nur in diesem Tab
  }
  listeners.forEach((l) => l());
}

export const focusStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): FocusState {
    ensureLoaded();
    return state;
  },
  getServerSnapshot(): FocusState {
    return FOCUS_DEFAULT;
  },
};

export function remainingSeconds(s: FocusState, now: number): number {
  if (s.status === "running" && s.endAt !== null) return Math.max(0, Math.ceil((s.endAt - now) / 1000));
  return s.remainingSec;
}

export const focusActions = {
  configure(mode: FocusMode, minutes: number) {
    ensureLoaded();
    const totalSec = Math.round(Math.min(Math.max(minutes, 1), 180) * 60);
    set({ ...state, mode, totalSec, status: "idle", endAt: null, remainingSec: totalSec });
  },
  setLabel(label: string) {
    ensureLoaded();
    set({ ...state, label: label.slice(0, 100) });
  },
  start(now = Date.now()) {
    ensureLoaded();
    if (state.status === "running") return;
    const remaining = state.remainingSec > 0 ? state.remainingSec : state.totalSec;
    set({ ...state, status: "running", endAt: now + remaining * 1000, remainingSec: remaining });
  },
  pause(now = Date.now()) {
    ensureLoaded();
    if (state.status !== "running") return;
    set({ ...state, status: "paused", endAt: null, remainingSec: remainingSeconds(state, now) });
  },
  reset() {
    ensureLoaded();
    set({ ...state, status: "idle", endAt: null, remainingSec: state.totalSec });
  },
  /**
   * Beendet einen abgelaufenen Timer genau einmal (auch über mehrere Tabs).
   * Gibt die beendete Einheit zurück oder null, wenn nichts zu tun war.
   */
  finishIfElapsed(now = Date.now()): FinishedRun | null {
    ensureLoaded();
    const stored = readStorage() ?? state;
    if (stored.status !== "running" || stored.endAt === null || stored.endAt > now) return null;
    const finished: FinishedRun = {
      mode: stored.mode,
      minutes: Math.max(1, Math.round(stored.totalSec / 60)),
      label: stored.label,
      endedAt: stored.endAt,
    };
    // Nach Fokus folgt eine 5-Minuten-Pause, danach wieder Fokus mit 25 Minuten
    const nextMode: FocusMode = stored.mode === "focus" ? "break" : "focus";
    const nextSec = nextMode === "break" ? 5 * 60 : 25 * 60;
    set({ ...stored, mode: nextMode, totalSec: nextSec, status: "idle", endAt: null, remainingSec: nextSec });
    return finished;
  },
};

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
