"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/client/api";
import { focusActions } from "@/lib/client/focus-store";
import type { SearchHit } from "@/lib/client/types";
import {
  ArrowRightIcon,
  BoltIcon,
  CalendarIcon,
  ChatIcon,
  DownloadIcon,
  FlameIcon,
  GridIcon,
  MailIcon,
  MemoryIcon,
  NoteIcon,
  SearchIcon,
  SettingsIcon,
  TaskIcon,
  TimerIcon,
} from "./icons";

type Command = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  keywords?: string;
  run: () => void;
};

const KIND_LABEL: Record<SearchHit["kind"], string> = {
  task: "Aufgabe",
  note: "Notiz",
  memory: "Erinnerung",
  conversation: "Chat",
  habit: "Gewohnheit",
};

const KIND_ICON: Record<SearchHit["kind"], ReactNode> = {
  task: <TaskIcon width={18} height={18} />,
  note: <NoteIcon width={18} height={18} />,
  memory: <MemoryIcon width={18} height={18} />,
  conversation: <ChatIcon width={18} height={18} />,
  habit: <FlameIcon width={18} height={18} />,
};

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <PaletteDialog onClose={onClose} />;
}

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Serverseitige Suche (verzögert, damit nicht jeder Tastendruck eine Anfrage auslöst)
  const term = query.trim();
  useEffect(() => {
    if (term.length < 2) return;
    let active = true;
    const timer = setTimeout(() => {
      setSearching(true);
      api<{ results: SearchHit[] }>(`/api/search?q=${encodeURIComponent(term)}`).then(
        (data) => {
          if (!active) return;
          setHits(data.results);
          setSearching(false);
        },
        () => {
          if (!active) return;
          setHits([]);
          setSearching(false);
        },
      );
    }, 220);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [term]);

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => {
      onClose();
      router.push(href);
    };
    const prompt = (text: string) => go(`/chat?prompt=${encodeURIComponent(text)}`);
    return [
      { id: "nav-home", group: "Navigation", label: "Übersicht", icon: <GridIcon width={18} height={18} />, keywords: "dashboard start home command center", run: go("/") },
      { id: "nav-chat", group: "Navigation", label: "Neuer Chat", icon: <ChatIcon width={18} height={18} />, keywords: "jarvis fragen ki", run: go("/chat") },
      { id: "nav-tasks", group: "Navigation", label: "Aufgaben", icon: <TaskIcon width={18} height={18} />, keywords: "todo", run: go("/tasks") },
      { id: "nav-notes", group: "Navigation", label: "Notizen", icon: <NoteIcon width={18} height={18} />, run: go("/notes") },
      { id: "nav-habits", group: "Navigation", label: "Gewohnheiten", icon: <FlameIcon width={18} height={18} />, keywords: "habits serie streak", run: go("/habits") },
      { id: "nav-focus", group: "Navigation", label: "Fokus-Timer", icon: <TimerIcon width={18} height={18} />, keywords: "pomodoro konzentration", run: go("/focus") },
      { id: "nav-memories", group: "Navigation", label: "Erinnerungen", icon: <MemoryIcon width={18} height={18} />, keywords: "gedächtnis", run: go("/memories") },
      { id: "nav-mail", group: "Navigation", label: "Posteingang", icon: <MailIcon width={18} height={18} />, keywords: "gmx email mail", run: go("/mail") },
      { id: "nav-calendar", group: "Navigation", label: "Kalender", icon: <CalendarIcon width={18} height={18} />, keywords: "termine icloud apple", run: go("/calendar") },
      { id: "nav-settings", group: "Navigation", label: "Einstellungen", icon: <SettingsIcon width={18} height={18} />, keywords: "name wetter ort stimme vorlesen export", run: go("/settings") },
      { id: "act-task", group: "Aktionen", label: "Neue Aufgabe anlegen", icon: <TaskIcon width={18} height={18} />, run: go("/tasks?new=1") },
      { id: "act-note", group: "Aktionen", label: "Neue Notiz schreiben", icon: <NoteIcon width={18} height={18} />, run: go("/notes?new=1") },
      {
        id: "act-focus",
        group: "Aktionen",
        label: "Fokus starten (25 Minuten)",
        icon: <TimerIcon width={18} height={18} />,
        keywords: "pomodoro timer",
        run: () => {
          focusActions.configure("focus", 25);
          focusActions.start();
          onClose();
          router.push("/focus");
        },
      },
      { id: "act-brief", group: "Aktionen", label: "Tagesbriefing", hint: "Jarvis fasst deinen Tag zusammen", icon: <BoltIcon width={18} height={18} />, keywords: "heute zusammenfassung", run: prompt("Gib mir ein kurzes Tagesbriefing: Was steht heute an (Aufgaben, Termine, Gewohnheiten) und wie ist das Wetter?") },
      { id: "act-week", group: "Aktionen", label: "Wochenrückblick", hint: "Echte Zahlen aus deiner Aktivität", icon: <BoltIcon width={18} height={18} />, keywords: "statistik produktiv", run: prompt("Wie produktiv war ich in den letzten 7 Tagen? Nutze meine echte Aktivitätsstatistik.") },
      {
        id: "act-export",
        group: "Aktionen",
        label: "Alle meine Daten exportieren",
        hint: "JSON-Datei",
        icon: <DownloadIcon width={18} height={18} />,
        keywords: "backup download sicherung",
        run: () => {
          onClose();
          // Download über einen temporären Link (die Antwort ist eine Datei, keine Seite)
          const link = document.createElement("a");
          link.href = "/api/export";
          link.download = "";
          document.body.appendChild(link);
          link.click();
          link.remove();
        },
      },
    ];
  }, [onClose, router]);

  const lower = term.toLowerCase();
  const filtered = lower
    ? commands.filter((c) => `${c.label} ${c.keywords ?? ""} ${c.hint ?? ""}`.toLowerCase().includes(lower))
    : commands;

  const items: Command[] = [...filtered];
  if (term) {
    items.unshift({
      id: "ask",
      group: "Jarvis",
      label: `Jarvis fragen: „${term.length > 60 ? `${term.slice(0, 60)}…` : term}“`,
      icon: <ChatIcon width={18} height={18} />,
      run: () => {
        onClose();
        router.push(`/chat?prompt=${encodeURIComponent(term)}`);
      },
    });
  }
  if (term.length >= 2) {
    for (const hit of hits) {
      items.push({
        id: `hit-${hit.kind}-${hit.id}`,
        group: "Treffer in deinen Daten",
        label: hit.title,
        hint: hit.excerpt ?? KIND_LABEL[hit.kind],
        icon: KIND_ICON[hit.kind],
        run: () => {
          onClose();
          router.push(hit.href);
        },
      });
    }
  }

  const activeIndex = Math.min(active, Math.max(items.length - 1, 0));

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (items.length ? (Math.min(i, items.length - 1) + 1) % items.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (items.length ? (Math.min(i, items.length - 1) - 1 + items.length) % items.length : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      items[activeIndex]?.run();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 pt-[10vh]" role="dialog" aria-modal="true" aria-label="Befehlspalette">
      <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-label="Schließen" />
      <div className="hud-panel relative flex max-h-[75vh] w-full max-w-xl flex-col overflow-hidden" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <SearchIcon className="shrink-0 text-accent" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
              if (e.target.value.trim().length < 2) setHits([]);
            }}
            placeholder="Suchen, springen oder Jarvis fragen …"
            className="min-w-0 flex-1 bg-transparent text-base placeholder:text-muted/70 focus:outline-none"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={items[activeIndex] ? `${listId}-${activeIndex}` : undefined}
            maxLength={100}
          />
          <kbd className="hidden rounded border border-line px-1.5 py-0.5 text-[0.65rem] text-muted sm:inline">ESC</kbd>
        </div>
        <ul ref={listRef} id={listId} role="listbox" className="min-h-0 flex-1 overflow-y-auto p-2">
          {items.length === 0 && !searching && <li className="px-3 py-6 text-center text-sm text-muted">Keine Treffer.</li>}
          {items.map((item, index) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <li key={item.id} role="presentation">
                {header && <p className="hud-title px-3 pb-1 pt-3 text-[0.62rem]">{header}</p>}
                <div
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  data-index={index}
                  onMouseMove={() => setActive(index)}
                  onClick={() => item.run()}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${
                    index === activeIndex ? "bg-accent-soft/80 text-text shadow-[inset_2px_0_0_0_rgba(63,208,255,0.9)]" : "text-muted"
                  }`}
                >
                  <span className={index === activeIndex ? "text-accent" : ""}>{item.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-text">{item.label}</span>
                    {item.hint && <span className="block truncate text-xs text-muted">{item.hint}</span>}
                  </span>
                  {index === activeIndex && <ArrowRightIcon width={16} height={16} className="shrink-0 text-accent" />}
                </div>
              </li>
            );
          })}
          {searching && <li className="px-3 py-2 text-xs text-muted">Durchsuche deine Daten …</li>}
        </ul>
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-2 text-[0.68rem] text-muted">
          <span>↑↓ auswählen</span>
          <span>Enter öffnen</span>
          <span>Strg/⌘ + K öffnen/schließen</span>
        </div>
      </div>
    </div>
  );
}
