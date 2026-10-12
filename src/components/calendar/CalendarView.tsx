"use client";

import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { todayIso } from "@/lib/client/dates";
import type { CalendarEvent } from "@/lib/client/types";
import { BackIcon, CalendarIcon, PlusIcon } from "../icons";
import { Button, EmptyState, ErrorBanner, Spinner, inputClass } from "../ui";

const RANGE_DAYS = 14;

function startOfDay(offsetDays: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

function dayKey(e: CalendarEvent): string {
  if (e.allDay) return e.start;
  const d = new Date(e.start);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = todayIso();
  const prefix = key === today ? "Heute · " : "";
  return prefix + date.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
}

function timeRange(e: CalendarEvent): string {
  if (e.allDay) return "ganztägig";
  const f = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return `${f(e.start)} – ${f(e.end)}`;
}

type Draft = { title: string; allDay: boolean; date: string; startTime: string; endTime: string; endDate: string; location: string; notes: string };

export function CalendarView() {
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState<{ loading: boolean; error: string | null; events: CalendarEvent[]; calendars: string[] }>({
    loading: true,
    error: null,
    events: [],
    calendars: [],
  });
  const [reload, setReload] = useState(0);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    let active = true;
    const start = startOfDay(offset).toISOString();
    api<{ events: CalendarEvent[]; calendars: string[] }>(`/api/calendar?start=${encodeURIComponent(start)}&days=${RANGE_DAYS}`).then(
      (data) => active && setState({ loading: false, error: null, events: data.events, calendars: data.calendars }),
      (e) => active && setState({ loading: false, error: errorMessage(e), events: [], calendars: [] }),
    );
    return () => {
      active = false;
    };
  }, [offset, reload]);

  function go(delta: number) {
    setState((s) => ({ ...s, loading: true }));
    setOffset((o) => o + delta);
  }

  const groups = new Map<string, CalendarEvent[]>();
  for (const e of state.events) {
    const key = dayKey(e);
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const from = startOfDay(offset);
  const to = startOfDay(offset + RANGE_DAYS - 1);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="hud-title">Apple iCloud</p>
            <h1 className="text-xl font-semibold">Kalender</h1>
            <p className="mt-1 text-sm text-muted">
              {from.toLocaleDateString("de-DE", { day: "numeric", month: "short" })} –{" "}
              {to.toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => go(-RANGE_DAYS)} aria-label="Frühere Termine">
              <BackIcon width={18} height={18} />
            </Button>
            <Button onClick={() => go(-offset)} disabled={offset === 0}>
              Heute
            </Button>
            <Button onClick={() => go(RANGE_DAYS)} aria-label="Spätere Termine">
              <BackIcon width={18} height={18} className="rotate-180" />
            </Button>
            <Button variant="primary" onClick={() => setShowForm((v) => !v)}>
              <PlusIcon width={16} height={16} /> Termin
            </Button>
          </div>
        </header>

        {showForm && (
          <EventForm
            calendars={state.calendars}
            onCancel={() => setShowForm(false)}
            onCreated={() => {
              setShowForm(false);
              setState((s) => ({ ...s, loading: true }));
              setReload((n) => n + 1);
            }}
          />
        )}

        {state.loading && <Spinner label="Lade Termine von iCloud …" />}
        {!state.loading && state.error && <ErrorBanner message={state.error} />}
        {!state.loading && !state.error && state.events.length === 0 && (
          <EmptyState title="Keine Termine in diesem Zeitraum">Lege oben einen Termin an oder bitte Jarvis im Chat darum.</EmptyState>
        )}

        <div className="space-y-4">
          {!state.loading &&
            [...groups.entries()].map(([key, events]) => (
              <section key={key} className="hud-panel p-4">
                <h2 className="hud-title mb-3">{dayLabel(key)}</h2>
                <ul className="space-y-2">
                  {events.map((e) => (
                    <li key={e.id} className="flex gap-3 rounded-lg border border-line/60 bg-surface-2/50 px-3 py-2.5">
                      <span className="w-28 shrink-0 font-mono text-sm text-accent">{timeRange(e)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block break-words font-medium">{e.title}</span>
                        <span className="block text-xs text-muted">
                          {[e.location, e.calendar].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      </div>
    </div>
  );
}

function EventForm({ calendars, onCancel, onCreated }: { calendars: string[]; onCancel: () => void; onCreated: () => void }) {
  const today = todayIso();
  const [draft, setDraft] = useState<Draft>({
    title: "",
    allDay: false,
    date: today,
    startTime: "15:00",
    endTime: "16:00",
    endDate: today,
    location: "",
    notes: "",
  });
  const [calendar, setCalendar] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api("/api/calendar", {
        method: "POST",
        json: {
          title: draft.title,
          all_day: draft.allDay,
          start: draft.allDay ? draft.date : `${draft.date}T${draft.startTime}`,
          end: draft.allDay ? draft.endDate : `${draft.date}T${draft.endTime}`,
          location: draft.location || null,
          notes: draft.notes || null,
          calendar: calendar || null,
        },
      });
      onCreated();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="hud-panel mb-5 space-y-3 p-4">
      <div className="flex items-center gap-2">
        <CalendarIcon width={18} height={18} className="text-accent" />
        <h2 className="hud-title">Neuer Termin</h2>
      </div>
      <input
        value={draft.title}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        placeholder="Titel"
        maxLength={200}
        required
        className={inputClass}
        aria-label="Titel"
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={draft.allDay} onChange={(e) => setDraft({ ...draft, allDay: e.target.checked })} className="size-4 accent-[#3fd0ff]" />
        Ganztägig
      </label>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs text-muted">
          {draft.allDay ? "Von" : "Datum"}
          <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value, endDate: e.target.value > draft.endDate ? e.target.value : draft.endDate })} required className={`${inputClass} mt-1`} />
        </label>
        {draft.allDay ? (
          <label className="text-xs text-muted">
            Bis
            <input type="date" value={draft.endDate} min={draft.date} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} required className={`${inputClass} mt-1`} />
          </label>
        ) : (
          <>
            <label className="text-xs text-muted">
              Beginn
              <input type="time" value={draft.startTime} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} required className={`${inputClass} mt-1`} />
            </label>
            <label className="text-xs text-muted">
              Ende
              <input type="time" value={draft.endTime} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })} required className={`${inputClass} mt-1`} />
            </label>
          </>
        )}
      </div>
      <input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} placeholder="Ort (optional)" maxLength={200} className={inputClass} aria-label="Ort" />
      <textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Notiz (optional)" maxLength={2000} rows={2} className={inputClass} aria-label="Notiz" />
      {calendars.length > 1 && (
        <label className="block text-xs text-muted">
          Kalender
          <select value={calendar} onChange={(e) => setCalendar(e.target.value)} className={`${inputClass} mt-1`}>
            <option value="">Standard</option>
            {calendars.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && <ErrorBanner message={error} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>Abbrechen</Button>
        <Button type="submit" variant="primary" disabled={saving || !draft.title.trim()}>
          {saving ? "Speichert …" : "Im Kalender speichern"}
        </Button>
      </div>
    </form>
  );
}
