"use client";

import { useEffect, useState } from "react";
import type { Task } from "@/lib/data/types";
import { api, errorMessage } from "@/lib/client/api";
import { dueState, formatDate } from "@/lib/client/dates";
import { EditIcon, TrashIcon } from "../icons";
import { Button, EmptyState, ErrorBanner, PageHeader, Spinner, inputClass } from "../ui";

type Filter = "open" | "done" | "all";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "open", label: "Offen" },
  { id: "done", label: "Erledigt" },
  { id: "all", label: "Alle" },
];

type Draft = { title: string; due_date: string; details: string };
const emptyDraft: Draft = { title: "", due_date: "", details: "" };

export function TasksView() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [showDetails, setShowDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<{ tasks: Task[] }>("/api/tasks").then(
      (data) => {
        if (active) setTasks(data.tasks);
      },
      (e) => {
        if (active) setError(errorMessage(e));
      },
    );
    return () => {
      active = false;
    };
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const { task } = await api<{ task: Task }>("/api/tasks", {
        method: "POST",
        json: { title: draft.title, due_date: draft.due_date || null, details: draft.details || null },
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

  async function patch(task: Task, changes: Partial<Pick<Task, "title" | "details" | "due_date" | "done">>) {
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

  const visible = (tasks ?? [])
    .filter((t) => (filter === "all" ? true : filter === "done" ? t.done : !t.done))
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return b.created_at.localeCompare(a.created_at);
    });
  const openCount = tasks?.filter((t) => !t.done).length ?? 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <PageHeader
          title="Aufgaben"
          description="Ein Fälligkeitsdatum ist nur eine Markierung – Jarvis verschickt keine Benachrichtigungen."
        />

        <form onSubmit={create} className="rounded-xl border border-line bg-surface p-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="task-title" className="sr-only">
              Neue Aufgabe
            </label>
            <input
              id="task-title"
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
            </button>
          ))}
        </div>

        <div className="mt-3 space-y-2">
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
          {tasks === null && !error && <Spinner />}
          {tasks !== null && visible.length === 0 && (
            <EmptyState title={filter === "done" ? "Noch nichts erledigt" : filter === "open" ? "Keine offenen Aufgaben" : "Noch keine Aufgaben"}>
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
  onToggle,
  onEdit,
  onDelete,
}: {
  task: Task;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
      <input
        type="checkbox"
        checked={task.done}
        onChange={onToggle}
        className="mt-1 size-5 shrink-0 cursor-pointer accent-[#4c8dff]"
        aria-label={task.done ? `„${task.title}“ wieder öffnen` : `„${task.title}“ abhaken`}
      />
      <div className="min-w-0 flex-1">
        <p className={`break-words ${task.done ? "text-muted line-through" : ""}`}>{task.title}</p>
        {task.details && <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-muted">{task.details}</p>}
        <DueBadge task={task} />
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
  onSave: (changes: { title: string; details: string | null; due_date: string | null }) => Promise<void>;
}) {
  const [title, setTitle] = useState(task.title);
  const [details, setDetails] = useState(task.details ?? "");
  const [due, setDue] = useState(task.due_date ?? "");
  const [saving, setSaving] = useState(false);

  return (
    <li className="rounded-xl border border-accent/50 bg-surface p-3">
      <form
        className="space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          await onSave({ title, details: details.trim() ? details : null, due_date: due || null });
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
