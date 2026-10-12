"use client";

import { useEffect, useState } from "react";
import type { HabitWithLogs } from "@/lib/data/types";
import { api, errorMessage } from "@/lib/client/api";
import { todayIso, weekdayShort } from "@/lib/client/dates";
import { countThisWeek, currentStreak, lastDays, longestStreak } from "@/lib/habits";
import { CheckIcon, EditIcon, FlameIcon, PlusIcon, TrashIcon } from "../icons";
import { Button, EmptyState, ErrorBanner, PageHeader, Spinner, inputClass } from "../ui";

const SUGGESTED = [
  { title: "Lesen", emoji: "📚" },
  { title: "Sport", emoji: "🏃" },
  { title: "Wasser trinken", emoji: "💧" },
  { title: "Vokabeln lernen", emoji: "🗣️" },
  { title: "Meditieren", emoji: "🧘" },
  { title: "Früh schlafen", emoji: "😴" },
];

export function HabitsView() {
  const [habits, setHabits] = useState<HabitWithLogs[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const today = todayIso();

  useEffect(() => {
    let active = true;
    api<{ habits: HabitWithLogs[] }>("/api/habits").then(
      (data) => active && setHabits(data.habits),
      (e) => active && setError(errorMessage(e)),
    );
    return () => {
      active = false;
    };
  }, []);

  async function toggleDay(habit: HabitWithLogs, day: string) {
    const key = `${habit.id}:${day}`;
    if (busy.has(key)) return;
    const done = !habit.days.includes(day);
    // Sofort anzeigen, bei Fehler zurücknehmen
    const apply = (isDone: boolean) =>
      setHabits((list) =>
        list?.map((h) =>
          h.id === habit.id ? { ...h, days: isDone ? [...h.days.filter((d) => d !== day), day] : h.days.filter((d) => d !== day) } : h,
        ) ?? null,
      );
    apply(done);
    setBusy((s) => new Set(s).add(key));
    setError(null);
    try {
      await api(`/api/habits/${habit.id}/log`, { method: "POST", json: { day, done } });
    } catch (e) {
      apply(!done);
      setError(errorMessage(e));
    } finally {
      setBusy((s) => {
        const next = new Set(s);
        next.delete(key);
        return next;
      });
    }
  }

  async function create(values: { title: string; emoji: string; target_per_week: number }) {
    setError(null);
    try {
      const { habit } = await api<{ habit: HabitWithLogs }>("/api/habits", {
        method: "POST",
        json: { title: values.title, emoji: values.emoji || null, target_per_week: values.target_per_week },
      });
      setHabits((list) => [...(list ?? []), habit]);
      setShowForm(false);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  }

  async function update(habit: HabitWithLogs, values: { title: string; emoji: string; target_per_week: number }) {
    setError(null);
    try {
      const { habit: updated } = await api<{ habit: HabitWithLogs }>(`/api/habits/${habit.id}`, {
        method: "PATCH",
        json: { title: values.title, emoji: values.emoji || null, target_per_week: values.target_per_week },
      });
      setHabits((list) => list?.map((h) => (h.id === habit.id ? { ...updated, days: h.days } : h)) ?? null);
      setEditingId(null);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  }

  async function remove(habit: HabitWithLogs) {
    if (!window.confirm(`Gewohnheit „${habit.title}“ samt allen Einträgen löschen?`)) return;
    setError(null);
    try {
      await api(`/api/habits/${habit.id}`, { method: "DELETE" });
      setHabits((list) => list?.filter((h) => h.id !== habit.id) ?? null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const doneToday = habits?.filter((h) => h.days.includes(today)).length ?? 0;
  const total = habits?.length ?? 0;
  const pct = total ? Math.round((doneToday / total) * 100) : 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <PageHeader title="Gewohnheiten" description="Hake täglich ab, was du geschafft hast – Serien zeigen deinen Fortschritt.">
          <Button variant="primary" onClick={() => setShowForm((v) => !v)}>
            <PlusIcon width={16} height={16} /> Neue Gewohnheit
          </Button>
        </PageHeader>

        {habits && total > 0 && (
          <section className="hud-panel mb-5 flex flex-wrap items-center gap-5 p-4">
            <ProgressRing value={pct} />
            <div className="min-w-40 flex-1">
              <p className="hud-title">Heute</p>
              <p className="mt-1 text-lg font-semibold">
                {doneToday} von {total} erledigt
              </p>
              <p className="text-sm text-muted">
                {doneToday === total ? "Alles geschafft – stark! 🎉" : `Noch ${total - doneToday} offen für heute.`}
              </p>
            </div>
            <div className="flex w-full items-center justify-between border-t border-line/60 pt-3 sm:block sm:w-auto sm:border-0 sm:pt-0 sm:text-right">
              <p className="hud-title">Beste aktuelle Serie</p>
              <p className="glow-text flex items-center justify-end gap-1.5 text-2xl font-semibold text-warn sm:mt-1">
                <FlameIcon width={22} height={22} />
                {Math.max(0, ...habits.map((h) => currentStreak(h.days, today)))}
              </p>
            </div>
          </section>
        )}

        {showForm && <HabitForm onCancel={() => setShowForm(false)} onSave={create} />}
        {error && (
          <div className="mb-3">
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          </div>
        )}
        {habits === null && !error && <Spinner />}

        {habits && total === 0 && !showForm && (
          <EmptyState title="Noch keine Gewohnheiten">
            <p>Starte mit einer Idee oder lege eine eigene an. Jarvis kann im Chat auch Gewohnheiten für dich abhaken.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTED.map((s) => (
                <Button key={s.title} onClick={() => void create({ title: s.title, emoji: s.emoji, target_per_week: 7 })}>
                  {s.emoji} {s.title}
                </Button>
              ))}
            </div>
          </EmptyState>
        )}

        <ul className="space-y-3">
          {habits?.map((habit) =>
            editingId === habit.id ? (
              <li key={habit.id}>
                <HabitForm initial={habit} onCancel={() => setEditingId(null)} onSave={(v) => update(habit, v)} />
              </li>
            ) : (
              <HabitCard
                key={habit.id}
                habit={habit}
                today={today}
                busy={busy}
                onToggle={(day) => void toggleDay(habit, day)}
                onEdit={() => setEditingId(habit.id)}
                onDelete={() => void remove(habit)}
              />
            ),
          )}
        </ul>
      </div>
    </div>
  );
}

function ProgressRing({ value, size = 64 }: { value: number; size?: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={`${value} Prozent erledigt`}>
      <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" className="text-line" strokeWidth="6" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke="#3fd0ff"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${(value / 100) * c} ${c}`}
        transform="rotate(-90 32 32)"
        style={{ filter: "drop-shadow(0 0 6px rgba(63,208,255,0.6))", transition: "stroke-dasharray 0.4s" }}
      />
      <text x="32" y="37" textAnchor="middle" className="fill-text text-[14px] font-semibold">
        {value}%
      </text>
    </svg>
  );
}

function HabitCard({
  habit,
  today,
  busy,
  onToggle,
  onEdit,
  onDelete,
}: {
  habit: HabitWithLogs;
  today: string;
  busy: Set<string>;
  onToggle: (day: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const days = lastDays(today, 14);
  const set = new Set(habit.days);
  const streak = currentStreak(habit.days, today);
  const best = longestStreak(habit.days);
  const week = countThisWeek(habit.days, today);
  const doneToday = set.has(today);

  return (
    <li className="hud-panel p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => onToggle(today)}
          disabled={busy.has(`${habit.id}:${today}`)}
          className={`flex size-12 shrink-0 items-center justify-center rounded-xl border text-2xl transition ${
            doneToday
              ? "border-success/60 bg-success/15 shadow-[0_0_18px_-4px_rgba(62,230,168,0.7)]"
              : "border-line bg-surface-2 hover:border-accent/60"
          }`}
          aria-label={doneToday ? `„${habit.title}“ für heute zurücknehmen` : `„${habit.title}“ für heute abhaken`}
          aria-pressed={doneToday}
        >
          {doneToday ? <CheckIcon className="text-success" width={26} height={26} /> : <span aria-hidden="true">{habit.emoji || "⭐"}</span>}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {habit.emoji && doneToday ? `${habit.emoji} ` : ""}
            {habit.title}
          </p>
          <p className="text-xs text-muted">
            Diese Woche {week}/{habit.target_per_week} · Rekord {best} {best === 1 ? "Tag" : "Tage"}
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-warn/30 bg-warn/10 px-3 py-1 text-sm font-semibold text-warn" title="Aktuelle Serie">
          <FlameIcon width={16} height={16} /> {streak}
        </div>
        <div className="flex gap-1">
          <button type="button" onClick={onEdit} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-text" aria-label="Bearbeiten">
            <EditIcon width={18} height={18} />
          </button>
          <button type="button" onClick={onDelete} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-danger" aria-label="Löschen">
            <TrashIcon width={18} height={18} />
          </button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1.5 sm:grid-cols-14">
        {days.map((day) => {
          const done = set.has(day);
          const isToday = day === today;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onToggle(day)}
              disabled={busy.has(`${habit.id}:${day}`)}
              title={day}
              aria-label={`${day}: ${done ? "erledigt" : "nicht erledigt"}`}
              aria-pressed={done}
              className={`flex flex-col items-center rounded-lg border py-1.5 text-[0.65rem] transition ${
                done ? "border-accent/60 bg-accent/20 text-text shadow-[0_0_10px_-3px_rgba(63,208,255,0.8)]" : "border-line/70 bg-surface-2/40 text-muted hover:border-accent/40"
              } ${isToday ? "ring-1 ring-accent/60" : ""}`}
            >
              <span>{weekdayShort(day)}</span>
              <span className="font-mono text-xs">{Number(day.slice(8))}</span>
            </button>
          );
        })}
      </div>
    </li>
  );
}

function HabitForm({
  initial,
  onCancel,
  onSave,
}: {
  initial?: HabitWithLogs;
  onCancel: () => void;
  onSave: (values: { title: string; emoji: string; target_per_week: number }) => Promise<boolean>;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "");
  const [target, setTarget] = useState(initial?.target_per_week ?? 7);
  const [saving, setSaving] = useState(false);

  return (
    <form
      className="hud-panel mb-4 space-y-3 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        await onSave({ title, emoji, target_per_week: target });
        setSaving(false);
      }}
    >
      <p className="hud-title">{initial ? "Gewohnheit bearbeiten" : "Neue Gewohnheit"}</p>
      <div className="flex gap-2">
        <input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          placeholder="🙂"
          maxLength={8}
          className={`${inputClass} w-16 text-center`}
          aria-label="Symbol (optional)"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="z. B. 20 Minuten lesen"
          maxLength={100}
          required
          className={inputClass}
          aria-label="Name"
        />
      </div>
      <label className="flex flex-wrap items-center gap-3 text-sm text-muted">
        Ziel pro Woche
        <input type="range" min={1} max={7} value={target} onChange={(e) => setTarget(Number(e.target.value))} className="flex-1 accent-[#3fd0ff]" />
        <span className="w-24 text-right text-text">{target === 7 ? "täglich" : `${target}× pro Woche`}</span>
      </label>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>Abbrechen</Button>
        <Button type="submit" variant="primary" disabled={saving || !title.trim()}>
          {saving ? "Speichert …" : "Speichern"}
        </Button>
      </div>
    </form>
  );
}
