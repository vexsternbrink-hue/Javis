"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { FocusSession } from "@/lib/data/types";
import { api, errorMessage } from "@/lib/client/api";
import { localDayOf, todayIso, weekdayShort } from "@/lib/client/dates";
import { focusActions, formatClock, type FocusMode } from "@/lib/client/focus-store";
import { lastDays } from "@/lib/habits";
import { PauseIcon, PlayIcon, ResetIcon, TimerIcon, TrashIcon } from "../icons";
import { Button, ErrorBanner, PageHeader, Spinner, inputClass } from "../ui";
import { FOCUS_SAVED_EVENT } from "./FocusRunner";
import { useFocusTimer } from "./useFocus";

const PRESETS: Array<{ mode: FocusMode; minutes: number; label: string }> = [
  { mode: "focus", minutes: 25, label: "Fokus 25" },
  { mode: "focus", minutes: 50, label: "Deep Work 50" },
  { mode: "break", minutes: 5, label: "Pause 5" },
  { mode: "break", minutes: 15, label: "Lange Pause 15" },
];

type NotifyState = "unsupported" | NotificationPermission;
const noopSubscribe = () => () => {};
const readPermission = (): NotifyState => (typeof Notification === "undefined" ? "unsupported" : Notification.permission);

export function FocusView() {
  const { state, remaining } = useFocusTimer();
  const [sessions, setSessions] = useState<FocusSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [reload, setReload] = useState(0);
  const permissionFromBrowser = useSyncExternalStore(noopSubscribe, readPermission, () => "unsupported" as NotifyState);
  const [permissionOverride, setPermissionOverride] = useState<NotifyState | null>(null);
  const permission = permissionOverride ?? permissionFromBrowser;

  useEffect(() => {
    let active = true;
    api<{ sessions: FocusSession[] }>("/api/focus").then(
      (data) => active && setSessions(data.sessions),
      (e) => active && setError(errorMessage(e)),
    );
    return () => {
      active = false;
    };
  }, [reload]);

  // Nach einer abgeschlossenen Einheit Liste neu laden
  useEffect(() => {
    const onSaved = (event: Event) => {
      if ((event as CustomEvent<{ error?: boolean }>).detail?.error) {
        setError("Die Fokus-Einheit konnte nicht gespeichert werden.");
      } else setReload((n) => n + 1);
    };
    window.addEventListener(FOCUS_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(FOCUS_SAVED_EVENT, onSaved);
  }, []);

  async function removeSession(session: FocusSession) {
    if (!window.confirm("Diese Fokus-Einheit aus der Statistik löschen?")) return;
    try {
      await api(`/api/focus/${session.id}`, { method: "DELETE" });
      setSessions((list) => list?.filter((s) => s.id !== session.id) ?? null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const progress = state.totalSec > 0 ? 1 - remaining / state.totalSec : 0;
  const running = state.status === "running";
  const today = todayIso();
  const todayMinutes = (sessions ?? []).filter((s) => localDayOf(s.ended_at) === today).reduce((sum, s) => sum + s.minutes, 0);
  const todayCount = (sessions ?? []).filter((s) => localDayOf(s.ended_at) === today).length;
  const week = lastDays(today, 7).map((day) => ({
    day,
    minutes: (sessions ?? []).filter((s) => localDayOf(s.ended_at) === day).reduce((sum, s) => sum + s.minutes, 0),
  }));
  const weekTotal = week.reduce((s, d) => s + d.minutes, 0);
  const maxMinutes = Math.max(25, ...week.map((d) => d.minutes));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <PageHeader title="Fokus-Timer" description="Pomodoro-Timer: konzentriert arbeiten, dann Pause. Der Timer läuft weiter, auch wenn du die Seite wechselst." />
        {error && (
          <div className="mb-4">
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-5 [&>*]:min-w-0">
          <section className="hud-panel flex flex-col items-center gap-5 p-6 lg:col-span-3">
            <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Voreinstellungen">
              {PRESETS.map((p) => {
                const selected = state.mode === p.mode && state.totalSec === p.minutes * 60;
                return (
                  <button
                    key={p.label}
                    type="button"
                    disabled={running}
                    onClick={() => focusActions.configure(p.mode, p.minutes)}
                    aria-pressed={selected}
                    className={`rounded-full border px-3.5 py-1.5 text-sm transition disabled:opacity-50 ${
                      selected ? "border-accent/70 bg-accent-soft text-text" : "border-line text-muted hover:border-accent/40 hover:text-text"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            <TimerRing progress={progress} mode={state.mode} running={running}>
              <span className="hud-title">{state.mode === "focus" ? "Fokus" : "Pause"}</span>
              <span className="glow-text font-mono text-5xl font-semibold tabular-nums tracking-wider text-accent sm:text-6xl" role="timer" aria-live="off">
                {formatClock(remaining)}
              </span>
              <span className="text-xs text-muted">
                {state.status === "paused" ? "pausiert" : running ? "läuft" : `${Math.round(state.totalSec / 60)} Minuten`}
              </span>
            </TimerRing>

            <input
              value={state.label}
              onChange={(e) => focusActions.setLabel(e.target.value)}
              placeholder="Woran arbeitest du? (optional)"
              maxLength={100}
              className={`${inputClass} max-w-sm text-center`}
              aria-label="Woran arbeitest du?"
            />

            <div className="flex flex-wrap justify-center gap-2">
              {running ? (
                <Button variant="primary" onClick={() => focusActions.pause()} className="min-w-32">
                  <PauseIcon width={18} height={18} /> Pause
                </Button>
              ) : (
                <Button variant="primary" onClick={() => focusActions.start()} className="min-w-32">
                  <PlayIcon width={18} height={18} /> {state.status === "paused" ? "Weiter" : "Start"}
                </Button>
              )}
              <Button onClick={() => focusActions.reset()} disabled={state.status === "idle" && remaining === state.totalSec}>
                <ResetIcon width={18} height={18} /> Zurücksetzen
              </Button>
            </div>

            <form
              className="flex items-center gap-2 text-sm text-muted"
              onSubmit={(e) => {
                e.preventDefault();
                const minutes = Number(custom);
                if (Number.isInteger(minutes) && minutes >= 1 && minutes <= 180) {
                  focusActions.configure("focus", minutes);
                  setCustom("");
                }
              }}
            >
              <label htmlFor="custom-minutes" className="whitespace-nowrap">
                Eigene Dauer
              </label>
              <input
                id="custom-minutes"
                type="number"
                min={1}
                max={180}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Min."
                disabled={running}
                className={`${inputClass} w-24 py-1.5`}
              />
              <Button type="submit" disabled={running || !custom}>
                Setzen
              </Button>
            </form>

            {permission === "default" && (
              <Button
                variant="ghost"
                onClick={() => {
                  void Notification.requestPermission().then((p) => setPermissionOverride(p));
                }}
              >
                🔔 Benachrichtigung am Ende erlauben
              </Button>
            )}
            {permission === "denied" && (
              <p className="text-center text-xs text-muted">Benachrichtigungen sind im Browser blockiert – am Ende ertönt nur ein Signalton, solange Jarvis geöffnet ist.</p>
            )}
          </section>

          <section className="space-y-4 lg:col-span-2">
            <div className="hud-panel grid grid-cols-3 gap-2 p-4 text-center">
              <Metric value={todayMinutes} label="Min. heute" />
              <Metric value={todayCount} label="Einheiten heute" />
              <Metric value={weekTotal} label="Min. 7 Tage" />
            </div>

            <div className="hud-panel p-4">
              <p className="hud-title mb-3">Fokuszeit · 7 Tage</p>
              {sessions === null ? (
                <Spinner />
              ) : (
                <div className="flex h-36 items-end gap-2" role="img" aria-label={`Fokusminuten der letzten 7 Tage, insgesamt ${weekTotal}`}>
                  {week.map((d) => (
                    <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                      <span className="text-[0.62rem] tabular-nums text-muted">{d.minutes || ""}</span>
                      <div
                        className={`w-full rounded-t-md ${d.day === today ? "bg-accent shadow-[0_0_14px_-2px_rgba(63,208,255,0.8)]" : "bg-accent/40"}`}
                        style={{ height: `${Math.max(2, (d.minutes / maxMinutes) * 100)}%` }}
                      />
                      <span className="text-[0.62rem] text-muted">{weekdayShort(d.day)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="hud-panel p-4">
              <p className="hud-title mb-2">Letzte Einheiten</p>
              {sessions && sessions.length === 0 && <p className="py-2 text-sm text-muted">Noch keine abgeschlossenen Einheiten. Starte deinen ersten Fokus!</p>}
              <ul className="space-y-1.5">
                {sessions?.slice(0, 8).map((s) => (
                  <li key={s.id} className="group flex items-center gap-2 rounded-lg bg-surface-2/60 px-2.5 py-1.5 text-sm">
                    <TimerIcon width={16} height={16} className="shrink-0 text-accent" />
                    <span className="min-w-0 flex-1 truncate">{s.label || "Fokus"}</span>
                    <span className="shrink-0 text-xs text-muted">
                      {s.minutes} Min · {new Date(s.ended_at).toLocaleString("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <button
                      type="button"
                      onClick={() => void removeSession(s)}
                      className="rounded p-1 text-muted hover:text-danger md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
                      aria-label="Einheit löschen"
                    >
                      <TrashIcon width={14} height={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg border border-line/60 bg-surface-2/50 px-1 py-2.5">
      <span className="glow-text block text-2xl font-semibold tabular-nums text-accent">{value}</span>
      <span className="block truncate text-[0.6rem] uppercase tracking-wider text-muted">{label}</span>
    </div>
  );
}

function TimerRing({ progress, mode, running, children }: { progress: number; mode: FocusMode; running: boolean; children: React.ReactNode }) {
  const r = 120;
  const c = 2 * Math.PI * r;
  const color = mode === "focus" ? "#3fd0ff" : "#3ee6a8";
  const ticks = Array.from({ length: 60 }, (_, i) => i);
  return (
    <div className="relative size-[min(78vw,300px)]">
      <svg viewBox="0 0 280 280" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <g stroke="#3fd0ff" strokeOpacity="0.25">
          {ticks.map((i) => {
            const a = (i / 60) * Math.PI * 2;
            const inner = i % 5 === 0 ? 128 : 132;
            return (
              <line key={i} x1={140 + Math.sin(a) * inner} y1={140 - Math.cos(a) * inner} x2={140 + Math.sin(a) * 136} y2={140 - Math.cos(a) * 136} strokeWidth={i % 5 === 0 ? 1.6 : 0.8} />
            );
          })}
        </g>
        <circle cx="140" cy="140" r={r} fill="none" stroke="#17324f" strokeWidth="8" />
        <circle
          cx="140"
          cy="140"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${Math.min(1, Math.max(0, progress)) * c} ${c}`}
          transform="rotate(-90 140 140)"
          style={{ filter: `drop-shadow(0 0 10px ${color}aa)`, transition: "stroke-dasharray 0.5s linear" }}
        />
        <circle cx="140" cy="140" r="100" fill="none" stroke="#3fd0ff" strokeOpacity="0.15" strokeDasharray="2 6" className={running ? "origin-center animate-spin-slow" : ""} style={{ transformBox: "fill-box" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">{children}</div>
    </div>
  );
}
