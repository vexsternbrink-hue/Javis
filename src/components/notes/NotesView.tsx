"use client";

import { useEffect, useState } from "react";
import type { Note } from "@/lib/data/types";
import { api, errorMessage } from "@/lib/client/api";
import { formatDateTime } from "@/lib/client/dates";
import { BackIcon, EyeIcon, EditIcon, PinIcon, PlusIcon } from "../icons";
import { Button, EmptyState, ErrorBanner, Spinner, inputClass } from "../ui";
import { Markdown } from "../chat/Markdown";

type Selection = { mode: "new" } | { mode: "edit"; id: string } | null;

export function NotesView({ initialId = null, startNew = false }: { initialId?: string | null; startNew?: boolean }) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [selection, setSelection] = useState<Selection>(
    startNew ? { mode: "new" } : initialId ? { mode: "edit", id: initialId } : null,
  );
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<{ notes: Note[] }>("/api/notes").then(
      (data) => {
        if (active) setNotes(data.notes);
      },
      (e) => {
        if (active) setError(errorMessage(e));
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const term = search.trim().toLowerCase();
  const visible = (notes ?? [])
    .filter((n) => !term || n.title.toLowerCase().includes(term) || n.content.toLowerCase().includes(term))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at));
  const selected = selection?.mode === "edit" ? notes?.find((n) => n.id === selection.id) ?? null : null;

  async function save(values: { title: string; content: string }) {
    setError(null);
    try {
      if (selection?.mode === "edit" && selected) {
        const { note } = await api<{ note: Note }>(`/api/notes/${selected.id}`, { method: "PATCH", json: values });
        setNotes((list) => [note, ...(list ?? []).filter((n) => n.id !== note.id)]);
      } else {
        const { note } = await api<{ note: Note }>("/api/notes", { method: "POST", json: values });
        setNotes((list) => [note, ...(list ?? [])]);
        setSelection({ mode: "edit", id: note.id });
      }
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  }

  async function togglePin(note: Note) {
    setError(null);
    try {
      const { note: updated } = await api<{ note: Note }>(`/api/notes/${note.id}`, { method: "PATCH", json: { pinned: !note.pinned } });
      setNotes((list) => list?.map((n) => (n.id === note.id ? updated : n)) ?? null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function remove(note: Note) {
    if (!window.confirm(`Notiz „${note.title}“ löschen?`)) return;
    setError(null);
    try {
      await api(`/api/notes/${note.id}`, { method: "DELETE" });
      setNotes((list) => list?.filter((n) => n.id !== note.id) ?? null);
      setSelection(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const editorOpen = selection !== null && (selection.mode === "new" || selected !== null);

  return (
    <div className="flex h-full">
      {/* Liste */}
      <section className={`flex w-full flex-col border-line md:w-80 md:shrink-0 md:border-r ${editorOpen ? "hidden md:flex" : "flex"}`}>
        <div className="space-y-3 border-b border-line p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold tracking-tight">Notizen</h1>
            <Button variant="primary" onClick={() => setSelection({ mode: "new" })}>
              <PlusIcon width={16} height={16} /> Neu
            </Button>
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Notizen durchsuchen …"
            className={inputClass}
            aria-label="Notizen durchsuchen"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {error && !editorOpen && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
          {notes === null && !error && <div className="p-2"><Spinner /></div>}
          {notes !== null && visible.length === 0 && (
            <div className="p-2">
              <EmptyState title={term ? "Keine Treffer" : "Noch keine Notizen"}>
                {term ? "Versuch einen anderen Suchbegriff." : "Lege eine Notiz an oder bitte Jarvis im Chat darum."}
              </EmptyState>
            </div>
          )}
          <ul>
            {visible.map((note) => (
              <li key={note.id}>
                <button
                  type="button"
                  onClick={() => setSelection({ mode: "edit", id: note.id })}
                  className={`w-full rounded-lg px-3 py-2.5 text-left ${
                    selected?.id === note.id ? "bg-surface-2" : "hover:bg-surface-2"
                  }`}
                >
                  <p className="flex items-center gap-1.5 truncate font-medium">
                    {note.pinned && <PinIcon width={14} height={14} className="shrink-0 text-accent" aria-label="Angeheftet" />}
                    <span className="truncate">{note.title}</span>
                  </p>
                  <p className="truncate text-sm text-muted">{note.content.replace(/[#*_`>~]+/g, "").trim() || "(leer)"}</p>
                  <p className="mt-0.5 text-xs text-muted/80">{formatDateTime(note.updated_at)}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Editor */}
      <section className={`min-w-0 flex-1 ${editorOpen ? "flex" : "hidden md:flex"} flex-col`}>
        {editorOpen ? (
          <NoteEditor
            key={selection?.mode === "edit" ? selection.id : "new"}
            note={selected}
            error={error}
            onDismissError={() => setError(null)}
            onBack={() => setSelection(null)}
            onSave={save}
            onDelete={selected ? () => remove(selected) : undefined}
            onTogglePin={selected ? () => togglePin(selected) : undefined}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted">
            Wähle links eine Notiz aus oder lege eine neue an.
          </div>
        )}
      </section>
    </div>
  );
}

function NoteEditor({
  note,
  error,
  onDismissError,
  onBack,
  onSave,
  onDelete,
  onTogglePin,
}: {
  note: Note | null;
  error: string | null;
  onDismissError: () => void;
  onBack: () => void;
  onSave: (values: { title: string; content: string }) => Promise<boolean>;
  onDelete?: () => void;
  onTogglePin?: () => void;
}) {
  const [title, setTitle] = useState(note?.title ?? "");
  const [content, setContent] = useState(note?.content ?? "");
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const dirty = title !== (note?.title ?? "") || content !== (note?.content ?? "");

  function back() {
    if (dirty && !window.confirm("Ungespeicherte Änderungen verwerfen?")) return;
    onBack();
  }

  return (
    <form
      className="flex h-full flex-col"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        if (await onSave({ title, content })) setSavedAt(new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }));
        setSaving(false);
      }}
    >
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <button type="button" onClick={back} className="rounded-lg p-2 text-muted hover:bg-surface-2 md:hidden" aria-label="Zurück zur Liste">
          <BackIcon />
        </button>
        <span className="text-xs text-muted">
          {dirty ? "Nicht gespeichert" : savedAt ? `Gespeichert um ${savedAt}` : note ? `Zuletzt geändert ${formatDateTime(note.updated_at)}` : "Neue Notiz"}
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={() => setPreview((p) => !p)} aria-pressed={preview} title={preview ? "Bearbeiten" : "Markdown-Vorschau"}>
            {preview ? <EditIcon width={16} height={16} /> : <EyeIcon width={16} height={16} />}
            <span className="hidden sm:inline">{preview ? "Bearbeiten" : "Vorschau"}</span>
          </Button>
          {onTogglePin && note && (
            <Button variant="ghost" onClick={onTogglePin} aria-pressed={note.pinned} title={note.pinned ? "Lösen" : "Anheften"}>
              <PinIcon width={16} height={16} className={note.pinned ? "text-accent" : ""} />
              <span className="hidden sm:inline">{note.pinned ? "Lösen" : "Anheften"}</span>
            </Button>
          )}
          {onDelete && (
            <Button variant="danger" onClick={onDelete}>
              Löschen
            </Button>
          )}
          <Button type="submit" variant="primary" disabled={saving || !title.trim() || (!dirty && Boolean(note))}>
            {saving ? "Speichert …" : "Speichern"}
          </Button>
        </div>
      </div>
      {error && (
        <div className="px-4 pt-3">
          <ErrorBanner message={error} onDismiss={onDismissError} />
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titel"
          maxLength={200}
          className="w-full bg-transparent text-xl font-semibold placeholder:text-muted/60 focus:outline-none"
          aria-label="Titel"
        />
        {preview ? (
          <div className="min-h-64 flex-1 overflow-y-auto text-[15px]">
            {content.trim() ? <Markdown text={content} /> : <p className="text-muted">(leer)</p>}
          </div>
        ) : (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Schreib hier deine Notiz … (Markdown wird unterstützt: **fett**, - Listen, # Überschriften)"
            maxLength={20000}
            className="min-h-64 w-full flex-1 resize-none bg-transparent text-[15px] leading-relaxed placeholder:text-muted/60 focus:outline-none"
            aria-label="Inhalt"
          />
        )}
        <p className="text-right text-xs text-muted">
          {content.trim() ? content.trim().split(/\s+/).length : 0} Wörter · {content.length}/20000
        </p>
      </div>
    </form>
  );
}
