"use client";

import { useEffect, useState } from "react";
import type { Memory } from "@/lib/data/types";
import { api, errorMessage } from "@/lib/client/api";
import { EditIcon, TrashIcon } from "../icons";
import { Button, EmptyState, ErrorBanner, PageHeader, Spinner, inputClass } from "../ui";

const MAX_MEMORIES = 100;
const MAX_CHARS = 1000;

export function MemoriesView() {
  const [memories, setMemories] = useState<Memory[] | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<{ memories: Memory[] }>("/api/memories").then(
      (data) => {
        if (active) setMemories(data.memories);
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
    if (!draft.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const { memory } = await api<{ memory: Memory }>("/api/memories", { method: "POST", json: { content: draft } });
      setMemories((list) => [...(list ?? []), memory]);
      setDraft("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function update(memory: Memory, content: string) {
    setError(null);
    try {
      const { memory: updated } = await api<{ memory: Memory }>(`/api/memories/${memory.id}`, {
        method: "PATCH",
        json: { content },
      });
      setMemories((list) => list?.map((m) => (m.id === memory.id ? updated : m)) ?? null);
      setEditingId(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function remove(memory: Memory) {
    if (!window.confirm("Diese Erinnerung löschen?")) return;
    setError(null);
    try {
      await api(`/api/memories/${memory.id}`, { method: "DELETE" });
      setMemories((list) => list?.filter((m) => m.id !== memory.id) ?? null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <PageHeader title="Erinnerungen" description="Dauerhafte Infos über dich, die Jarvis bei jeder Antwort berücksichtigt." />

        <div className="mb-5 rounded-xl border border-line bg-surface p-4 text-sm text-muted">
          <p>
            <span className="font-medium text-text">Erinnerungen ≠ Chatverlauf.</span> Ein Chat gilt nur für sich. Was hier
            steht, kennt Jarvis in <em>jedem</em> Chat – z. B. deinen Namen, deine Interessen oder wie du Antworten magst.
          </p>
          <p className="mt-2">
            Jarvis kann im Chat vorschlagen, etwas zu speichern. Gespeichert wird aber nur, wenn du den Vorschlag bestätigst.
          </p>
        </div>

        <form onSubmit={create} className="rounded-xl border border-line bg-surface p-3">
          <label htmlFor="memory-new" className="sr-only">
            Neue Erinnerung
          </label>
          <textarea
            id="memory-new"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            maxLength={MAX_CHARS}
            placeholder="z. B. Ich heiße Alex und gehe in die 10. Klasse."
            className={inputClass}
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-muted">
              {memories ? `${memories.length}/${MAX_MEMORIES} Erinnerungen` : ""}
            </span>
            <Button type="submit" variant="primary" disabled={saving || !draft.trim()}>
              {saving ? "Speichert …" : "Speichern"}
            </Button>
          </div>
        </form>

        <div className="mt-5 space-y-2">
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
          {memories === null && !error && <Spinner />}
          {memories?.length === 0 && (
            <EmptyState title="Noch keine Erinnerungen">
              Erzähl Jarvis etwas über dich – oder trage es oben direkt ein.
            </EmptyState>
          )}
          <ul className="space-y-2">
            {memories?.map((memory) =>
              editingId === memory.id ? (
                <MemoryEditor key={memory.id} memory={memory} onCancel={() => setEditingId(null)} onSave={(c) => update(memory, c)} />
              ) : (
                <li key={memory.id} className="flex items-start gap-3 rounded-xl border border-line bg-surface px-3.5 py-3">
                  <p className="min-w-0 flex-1 whitespace-pre-wrap break-words">{memory.content}</p>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingId(memory.id)}
                      className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-text"
                      aria-label="Bearbeiten"
                    >
                      <EditIcon width={18} height={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(memory)}
                      className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-danger"
                      aria-label="Löschen"
                    >
                      <TrashIcon width={18} height={18} />
                    </button>
                  </div>
                </li>
              ),
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

function MemoryEditor({ memory, onCancel, onSave }: { memory: Memory; onCancel: () => void; onSave: (content: string) => Promise<void> }) {
  const [content, setContent] = useState(memory.content);
  const [saving, setSaving] = useState(false);
  return (
    <li className="rounded-xl border border-accent/50 bg-surface p-3">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          await onSave(content);
          setSaving(false);
        }}
      >
        <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} maxLength={MAX_CHARS} className={inputClass} aria-label="Erinnerung bearbeiten" />
        <div className="mt-2 flex justify-end gap-2">
          <Button onClick={onCancel}>Abbrechen</Button>
          <Button type="submit" variant="primary" disabled={saving || !content.trim()}>
            Speichern
          </Button>
        </div>
      </form>
    </li>
  );
}
