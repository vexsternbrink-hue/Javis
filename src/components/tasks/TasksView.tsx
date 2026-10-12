"use client";

import { useEffect, useRef, useState } from "react";
import type { Priority, Task } from "@/lib/data/types";
import { api, errorMessage } from "@/lib/client/api";
import { dueState, formatDate, localDayOf, todayIso } from "@/lib/client/dates";
import { EditIcon, TrashIcon } from "../icons";
import { Button, EmptyState, ErrorBanner, PageHeader, Spinner, inputClass } from "../ui";

type Filter = "open" | "due" | "done" | "all";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "open", label: "Offen" },
  { id: "due", label: "Fällig" },
  { id: "done", label: "Erledigt" },
  { id: "all", label: "Alle" },
];

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, normal: 1, low: 2 };
const PRIORITY_LABEL: Record<Priority, string> = { high: "Hoch", normal: "Normal", low: "Niedrig" };

type Draft = { title: string; due_date: string; details: string; priority: Priority };
const emptyDraft: Draft = { title: "", due_date: "", details: "", priority: "normal" };

export function TasksView({ highlightId = null, startNew = false }: { highlightId?: string | null; startNew?: boolean }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [highlight, setHighlight] = useState<string | null>(highlightId);
  const titleRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [showDetails, setShowDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<{ tasks: Task[] }>("/api/tasks").then(
      (data) => {
        if (!active) return;
        setTasks(data.tasks);
        // Aus der Suche geöffnete, bereits erledigte Aufgabe trotzdem zeigen
        if (highlightId && data.tasks.find((t) => t.id === highlightId)?.done) setFilter("all");
      },
      (e) => {
        if (active) setError(errorMessage(e));
      },
    );
    return () => {
      active = false;
    };
  }, [highlightId]);

  useEffect(() => {
    if (startNew) titleRef.current?.focus();
  }, [startNew]);

  // Hervorgehobene Aufgabe in den sichtbaren Bereich holen und Markierung nach kurzer Zeit entfernen
  useEffect(() => {
    if (!highlight || !tasks) return;
    document.getElementById(`task-${highlight}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    const timer = setTimeout(() => setHighlight(null), 2500);
    return () => clearTimeout(timer);
  }, [highlight, tasks]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const { task } = await api<{ task: Task }>("/api/tasks", {
        method: "POST",
        json: { title: draft.title, due_date: draft.due_date || null, details: draft.details || null, priority: draft.priority },
      });
      setTasks((list) => [task, ...(list ?? [])]);
      setDraft(emptyDraft);
      setShowDetails(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function patch(task: Task, changes: Partial<Pick<Task, "title" | "details" | "due_date" | "done" | "priority">>) {
    setError(null);
    try {
      const { task: updated } = await api<{ task: Task }>(`/api/tasks/${task.id}`, { method: "PATCH", json: changes });
      setTasks((list) => list?.map((t) => (t.id === task.id ? updated : t)) ?? null);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  }

  async function remove(task: Task) {
    if (!window.confirm(`Aufgabe „${task.title}“ löschen?`)) return;
    setError(null);
    try {
      await api(`/api/tasks/${task.id}`, { method: "DELETE" });
      setTasks((list) => list?.filter((t) => t.id !== task.id) ?? null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const today = todayIso();
  const isDue = (t: Task) => !t.done && t.due_date !== null && t.due_date <= today;
  const visible = (tasks ?? [])
    .filter((t) => (filter === "all" ? true : filter === "done" ? t.done : filter === "due" ? isDue(t) : !t.done))
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.done && b.done) return (b.completed_at ?? "").localeCompare(a.completed_at ?? "");
      if (isDue(a) !== isDue(b)) return isDue(a) ? -1 : 1;
      if (a.priority !== b.priority) return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return b.created_at.localeCompare(a.created_at);
    });
  const openCount = tasks?.filter((t) => !t.done).length ?? 0;
  const dueCount = tasks?.filter(isDue).length ?? 0;
  const doneToday = tasks?.filter((t) => t.done && t.completed_at && localDayOf(t.completed_at) === today).length ?? 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <PageHeader
          title="Aufgaben"
          description="Ein Fälligkeitsdatum ist nur eine Markierung – Jarvis verschickt keine Benachrichtigungen."
        />

        {tasks && (
          <div className="mb-4 grid grid-cols-3 gap-2 text-center">
            <Counter value={openCount} label="Offen" tone="text-accent" />
            <Counter value={dueCount} label="Fällig / überfällig" tone={dueCount ? "text-warn" : "text-muted"} />
            <Counter value={doneToday} label="Heute erledigt" tone="text-success" />
          </div>
        )}

        <form onSubmit={create} className="hud-panel p-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="task-title" className="sr-only">
              Neue Aufgabe
            </label>
            <input
              id="task-title"
              ref={titleRef}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Neue Aufgabe …"
              maxLength={300}
              className={inputClass}
            />
            <label htmlFor="task-due" className="sr-only">
              Fällig am (optional)
            </label>
            <input
              id="task-due"
              type="date"
              value={draft.due_date}
              onChange={(e) => setDraft({ ...draft, due_date: e.target.value })}
              className={`${inputClass} sm:w-44`}
              title="Fällig am (optional)"
            />
            <label htmlFor="task-priority" className="sr-only">
              Priorität
            </label>
            <select
              id="task-priority"
              value={draft.priority}
              onChange={(e) => setDraft({ ...draft, priority: e.target.value as Priority })}
              className={`${inputClass} sm:w-32`}
            >
              <option value="high">Hoch</option>
              <option value="normal">Normal</option>
              <option value="low">Niedrig</option>
            </select>
            <Button type="submit" variant="primary" disabled={saving || !draft.title.trim()}>
              {saving ? "Speichert …" : "Hinzufügen"}
            </Button>
          </div>
          {showDetails ? (
            <textarea
              value={draft.details}
              onChange={(e) => setDraft({ ...draft, details: e.target.value })}
              placeholder="Details (optional)"
              maxLength={5000}
              rows={3}
              className={`${inputClass} mt-2`}
              aria-label="Details (optional)"
            />
          ) : (
            <button type="button" className="mt-2 px-1 text-xs text-muted hover:text-text" onClick={() => setShowDetails(true)}>
              + Details hinzufügen
            </button>
          )}
        </form>

        <div className="mt-5 flex items-center gap-1" role="tablist" aria-label="Filter">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                filter === f.id ? "bg-surface-2 text-text" : "text-muted hover:text-text"
              }`}
            >
              {f.label}
              {f.id === "open" && tasks ? ` (${openCount})` : ""}
              {f.id === "due" && tasks && dueCount ? ` (${dueCount})` : ""}
            </button>
          ))}
        </div>

        <div className="mt-3 space-y-2">
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
          {tasks === null && !error && <Spinner />}
          {tasks !== null && visible.length === 0 && (
            <EmptyState
              title={
                filter === "done" ? "Noch nichts erledigt" : filter === "open" ? "Keine offenen Aufgaben" : filter === "due" ? "Nichts fällig 🎉" : "Noch keine Aufgaben"
              }
            >
              Lege oben eine Aufgabe an oder sag Jarvis im Chat, was zu tun ist.
            </EmptyState>
          )}
          <ul className="space-y-2">
            {visible.map((task) =>
              editingId === task.id ? (
                <TaskEditor
                  key={task.id}
                  task={task}
                  onCancel={() => setEditingId(null)}
                  onSave={async (changes) => {
                    if (await patch(task, changes)) setEditingId(null);
                  }}
                />
              ) : (
                <TaskRow
                  key={task.id}
                  task={task}
                  highlighted={highlight === task.id}
                  onToggle={() => patch(task, { done: !task.done })}
                  onEdit={() => setEditingId(task.id)}
                  onDelete={() => remove(task)}
                />
              ),
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Counter({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div className="hud-panel px-2 py-2.5">
      <span className={`glow-text block text-2xl font-semibold tabular-nums ${tone}`}>{value}</span>
      <span className="block truncate text-[0.62rem] uppercase tracking-wider text-muted">{label}</span>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === "normal") return null;
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide ${
        priority === "high" ? "border-danger/50 bg-danger-soft text-danger" : "border-line text-muted"
      }`}
    >
      {priority === "high" ? "▲ Hoch" : "▼ Niedrig"}
    </span>
  );
}

function DueBadge({ task }: { task: Task }) {
  if (!task.due_date) return null;
  const state = dueState(task.due_date, task.done);
  const style =
    state === "overdue" ? "text-danger" : state === "today" ? "text-warn" : "text-muted";
  const prefix = state === "overdue" ? "Überfällig · " : state === "today" ? "Heute · " : "";
  return <span className={`text-xs ${style}`}>{prefix}{formatDate(task.due_date)}</span>;
}

function TaskRow({
  task,
  highlighted,
  onToggle,
  onEdit,
  onDelete,
}: {
  task: Task;
  highlighted: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li
      id={`task-${task.id}`}
      className={`flex items-start gap-3 rounded-xl border bg-surface/80 px-3 py-2.5 transition ${
        highlighted ? "border-accent shadow-[0_0_20px_-4px_rgba(63,208,255,0.8)]" : task.priority === "high" && !task.done ? "border-danger/30" : "border-line"
      }`}
    >
      <input
        type="checkbox"
        checked={task.done}
        onChange={onToggle}
        className="mt-1 size-5 shrink-0 cursor-pointer accent-[#3fd0ff]"
        aria-label={task.done ? `„${task.title}“ wieder öffnen` : `„${task.title}“ abhaken`}
      />
      <div className="min-w-0 flex-1">
        <p className={`break-words ${task.done ? "text-muted line-through" : ""}`}>{task.title}</p>
        {task.details && <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-muted">{task.details}</p>}
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          {!task.done && <PriorityBadge priority={task.priority} />}
          <DueBadge task={task} />
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <button type="button" onClick={onEdit} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-text" aria-label="Bearbeiten">
          <EditIcon width={18} height={18} />
        </button>
        <button type="button" onClick={onDelete} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-danger" aria-label="Löschen">
          <TrashIcon width={18} height={18} />
        </button>
      </div>
    </li>
  );
}

function TaskEditor({
  task,
  onCancel,
  onSave,
}: {
  task: Task;
  onCancel: () => void;
  onSave: (changes: { title: string; details: string | null; due_date: string | null; priority: Priority }) => Promise<void>;
}) {
  const [title, setTitle] = useState(task.title);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [details, setDetails] = useState(task.details ?? "");
  const [due, setDue] = useState(task.due_date ?? "");
  const [saving, setSaving] = useState(false);

  return (
    <li id={`task-${task.id}`} className="rounded-xl border border-accent/50 bg-surface p-3">
      <form
        className="space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          await onSave({ title, details: details.trim() ? details : null, due_date: due || null, priority });
          setSaving(false);
        }}
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} className={inputClass} aria-label="Titel" />
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={3}
          maxLength={5000}
          placeholder="Details (optional)"
          className={inputClass}
          aria-label="Details"
        />
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={`${inputClass} w-44`} aria-label="Fällig am" />
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={`${inputClass} w-32`} aria-label="Priorität">
            {(["high", "normal", "low"] as const).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
          {due && (
            <Button variant="ghost" onClick={() => setDue("")}>
              Datum entfernen
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button onClick={onCancel}>Abbrechen</Button>
            <Button type="submit" variant="primary" disabled={saving || !title.trim()}>
              Speichern
            </Button>
          </div>
        </div>
      </form>
    </li>
  );
}
