"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ClientAction, DisplayItem, DisplaySegment } from "@/lib/agent/events";
import { parseNdjson } from "@/lib/agent/events";
import { ApiError, api, errorMessage, goToLogin } from "@/lib/client/api";
import { useChatList } from "../AppShell";
import { CheckIcon, CopyIcon, DownloadIcon, EditIcon, LogoMark, SpeakerIcon, StopIcon } from "../icons";
import { CoreOrb } from "../hud/CoreOrb";
import { Button, ErrorBanner, Spinner, inputClass } from "../ui";
import { speak, voicePrefsStore } from "@/lib/voice/speech";
import { useSpeaker, useSpeechOutputSupported } from "../voice/hooks";
import { ActionCard } from "./ActionCard";
import { Composer } from "./Composer";
import { Markdown } from "./Markdown";

type ConversationResponse = {
  conversation: { id: string; title: string };
  items: DisplayItem[];
  needsContinue: boolean;
};

const SUGGESTIONS = [
  "Gib mir ein kurzes Tagesbriefing",
  "Lege eine Aufgabe an: Mathe-Hausaufgaben bis Freitag, hohe Priorität",
  "Wie wird das Wetter morgen?",
  "Wie produktiv war ich diese Woche?",
  "Lege die Gewohnheit „Lesen“ an",
  "Merke dir: Ich mag kurze Antworten mit Beispielen.",
];

function assistantText(segments: DisplaySegment[]): string {
  return segments
    .filter((s): s is { type: "text"; text: string } => s.type === "text")
    .map((s) => s.text)
    .join("\n\n")
    .trim();
}

function toMarkdownExport(title: string, items: DisplayItem[]): string {
  const lines = [`# ${title}`, "", `_Exportiert aus Jarvis am ${new Date().toLocaleString("de-DE")}_`, ""];
  for (const item of items) {
    if (item.kind === "user") {
      lines.push(`## Du (${new Date(item.createdAt).toLocaleString("de-DE")})`, "", item.text, "");
    } else {
      lines.push("## Jarvis", "");
      for (const segment of item.segments) {
        if (segment.type === "text") lines.push(segment.text, "");
        else lines.push(`> Aktion: ${segment.action.label} – ${segment.action.summary ?? segment.action.error ?? segment.action.status}`, "");
      }
    }
  }
  return lines.join("\n");
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function fetchConversation(id: string): Promise<ConversationResponse | Error> {
  try {
    return await api<ConversationResponse>(`/api/conversations/${id}`);
  } catch (e) {
    return e instanceof Error ? e : new Error(errorMessage(e));
  }
}

function updateActionIn(segments: DisplaySegment[], action: ClientAction): DisplaySegment[] {
  return segments.map((s) => (s.type === "action" && s.action.id === action.id ? { type: "action", action } : s));
}

export function ChatView({
  initialConversationId,
  initialPrompt = "",
}: {
  initialConversationId: string | null;
  initialPrompt?: string;
}) {
  const router = useRouter();
  const { refresh: refreshChatList } = useChatList();
  const [conversationId, setConversationId] = useState(initialConversationId);
  const conversationIdRef = useRef(initialConversationId);
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [loading, setLoading] = useState(Boolean(initialConversationId));
  const [notFound, setNotFound] = useState(false);
  const [live, setLive] = useState<DisplaySegment[] | null>(null);
  const [pendingUserText, setPendingUserText] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [needsContinue, setNeedsContinue] = useState(false);
  const [busyActions, setBusyActions] = useState<Set<string>>(new Set());
  const [input, setInput] = useState(initialPrompt);
  const [title, setTitle] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const liveTextRef = useRef("");
  const speaker = useSpeaker();
  const stopSpeaker = speaker.stop;
  const canSpeak = useSpeechOutputSupported();
  const voicePrefs = useSyncExternalStore(voicePrefsStore.subscribe, voicePrefsStore.getSnapshot, voicePrefsStore.getServerSnapshot);
  const autoSpeakRef = useRef(voicePrefs.autoSpeak);
  useEffect(() => {
    autoSpeakRef.current = voicePrefs.autoSpeak;
  }, [voicePrefs.autoSpeak]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const applyLoaded = useCallback((result: ConversationResponse | Error) => {
    if (result instanceof Error) {
      if (result instanceof ApiError && result.status === 404) setNotFound(true);
      else setError(result.message);
    } else {
      setItems(result.items);
      setTitle(result.conversation.title);
      setNeedsContinue(result.needsContinue);
      setNotFound(false);
    }
    setLoading(false);
  }, []);

  const load = useCallback(
    async (id: string) => applyLoaded(await fetchConversation(id)),
    [applyLoaded],
  );

  useEffect(() => {
    if (!initialConversationId) return;
    let active = true;
    fetchConversation(initialConversationId).then((result) => {
      if (active) applyLoaded(result);
    });
    return () => {
      active = false;
    };
  }, [initialConversationId, applyLoaded]);

  // Beim Verlassen laufende Antworten abbrechen
  useEffect(() => () => abortRef.current?.abort(), []);

  // Automatisch nach unten scrollen, solange der Nutzer unten ist
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [items, live, pendingUserText]);

  const stream = useCallback(
    async (body: { message: string } | { continue: true }) => {
      setError(null);
      setNotice(null);
      setNeedsContinue(false);
      setStreaming(true);
      setLive([]);
      liveTextRef.current = "";
      stopSpeaker();
      stickToBottom.current = true;
      const controller = new AbortController();
      abortRef.current = controller;
      let createdConversation = false;
      let failed = false;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, conversationId: conversationIdRef.current ?? undefined }),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          let message = `Fehler (${response.status})`;
          try {
            const data = (await response.json()) as { error?: string };
            if (data.error) message = data.error;
          } catch {
            // keine JSON-Antwort
          }
          if (response.status === 401) goToLogin();
          setError(message);
          failed = true;
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parsed = parseNdjson(buffer);
          buffer = parsed.rest;
          for (const event of parsed.events) {
            switch (event.type) {
              case "conversation":
                if (!conversationIdRef.current) {
                  conversationIdRef.current = event.conversationId;
                  createdConversation = true;
                  setConversationId(event.conversationId);
                  void refreshChatList();
                }
                break;
              case "text":
                liveTextRef.current += event.delta;
                setLive((segments) => {
                  const list = segments ?? [];
                  const last = list[list.length - 1];
                  if (last?.type === "text") {
                    return [...list.slice(0, -1), { type: "text", text: last.text + event.delta }];
                  }
                  return [...list, { type: "text", text: event.delta }];
                });
                break;
              case "segment_end":
                liveTextRef.current += "\n\n";
                setLive((segments) => {
                  const list = segments ?? [];
                  const last = list[list.length - 1];
                  // Absatz zwischen Textteilen verschiedener KI-Aufrufe
                  return last?.type === "text" ? [...list.slice(0, -1), { type: "text", text: last.text + "\n\n" }] : list;
                });
                break;
              case "action":
                setLive((segments) => [...(segments ?? []), { type: "action", action: event.action }]);
                break;
              case "notice":
                setNotice(event.message);
                break;
              case "error":
                setError(event.message);
                failed = true;
                break;
              default:
                break;
            }
          }
        }
      } catch {
        if (!controller.signal.aborted) {
          setError("Die Verbindung wurde unterbrochen. Bitte versuche es erneut.");
          failed = true;
        }
      } finally {
        abortRef.current = null;
        const id = conversationIdRef.current;
        let saved = false;
        if (id) {
          const result = await fetchConversation(id);
          applyLoaded(result);
          saved = !(result instanceof Error) && "message" in body && result.items.some((i) => i.kind === "user" && i.text === body.message);
        }
        // Wurde die Nachricht wegen eines Fehlers nicht gespeichert, zurück ins Eingabefeld legen.
        if (failed && "message" in body && !saved) setInput((current) => current || body.message);
        setLive(null);
        setPendingUserText(null);
        setStreaming(false);
        void refreshChatList();
        // Antwort automatisch vorlesen (Einstellung pro Gerät)
        if (!failed && !controller.signal.aborted && autoSpeakRef.current && liveTextRef.current.trim()) {
          speak(liveTextRef.current);
        }
        // Neuer Chat: auf die dauerhafte Adresse wechseln (überlebt ein Neuladen).
        if (createdConversation && id) router.replace(`/chat/${id}`);
      }
    },
    [applyLoaded, refreshChatList, router, stopSpeaker],
  );

  function send(override?: string) {
    const text = (override ?? input).trim();
    if (!text || streaming) return;
    setInput("");
    setPendingUserText(text);
    void stream({ message: text });
  }

  async function rename(next: string) {
    const id = conversationIdRef.current;
    if (!id) return false;
    try {
      const { conversation } = await api<{ conversation: { title: string } }>(`/api/conversations/${id}`, {
        method: "PATCH",
        json: { title: next },
      });
      setTitle(conversation.title);
      void refreshChatList();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  }

  async function decide(action: ClientAction, decision: "approve" | "reject") {
    setBusyActions((s) => new Set(s).add(action.id));
    setError(null);
    try {
      const result = await api<{ action: ClientAction; allResolved: boolean }>(`/api/actions/${action.id}`, {
        method: "POST",
        json: { decision },
      });
      setItems((list) =>
        list.map((item) => (item.kind === "assistant" ? { ...item, segments: updateActionIn(item.segments, result.action) } : item)),
      );
      if (result.allResolved) void stream({ continue: true });
    } catch (e) {
      setError(errorMessage(e));
      const id = conversationIdRef.current;
      if (id) void load(id);
    } finally {
      setBusyActions((s) => {
        const next = new Set(s);
        next.delete(action.id);
        return next;
      });
    }
  }

  const hasPending = items.some(
    (item) => item.kind === "assistant" && item.segments.some((s) => s.type === "action" && s.action.status === "pending"),
  );
  const empty = !loading && items.length === 0 && !pendingUserText && !live;

  if (notFound) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-medium">Dieser Chat existiert nicht (mehr).</p>
        <Link href="/chat" className="text-accent underline underline-offset-2">
          Neuen Chat beginnen
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {conversationId && title && (
        <ChatHeader
          title={title}
          onRename={rename}
          onExport={() => downloadText(`jarvis-chat-${new Date().toISOString().slice(0, 10)}.md`, toMarkdownExport(title, items))}
          exportDisabled={items.length === 0}
        />
      )}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-6"
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {loading && <Spinner label="Chat wird geladen …" />}

          {empty && (
            <div className="mt-[4vh] text-center">
              <CoreOrb size={170} sublabel="BEREIT" />
              <h1 className="mt-4 text-2xl font-semibold tracking-tight">Hallo! Ich bin Jarvis.</h1>
              <p className="mx-auto mt-2 max-w-md text-muted">
                Frag mich etwas oder lass mich deine Aufgaben, Notizen und Erinnerungen verwalten. Änderungen führe ich erst
                aus, wenn du sie bestätigst.
              </p>
              <div className="mx-auto mt-6 grid max-w-2xl gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setInput(s)}
                    className="hud-panel px-3.5 py-3 text-left text-sm text-muted hover:border-accent/50 hover:text-text"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {items.map((item) =>
            item.kind === "user" ? (
              <UserBubble key={`u${item.id}`} text={item.text} />
            ) : (
              <AssistantBlock
                key={`a${item.id}`}
                id={`a${item.id}`}
                segments={item.segments}
                busyActions={busyActions}
                onDecide={streaming ? undefined : decide}
                speaker={canSpeak ? speaker : null}
              />
            ),
          )}

          {pendingUserText && <UserBubble text={pendingUserText} />}
          {live && (
            <AssistantBlock segments={live} busyActions={busyActions} thinking={live.length === 0} />
          )}

          {notice && <p className="rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-muted">{notice}</p>}
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

          {needsContinue && !streaming && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm">
              <span className="text-muted">Deine Entscheidung ist gespeichert. Jarvis hat noch nicht darauf geantwortet.</span>
              <Button variant="primary" onClick={() => void stream({ continue: true })}>
                Jarvis antworten lassen
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-line bg-bg px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        {hasPending && !streaming && (
          <p className="mx-auto mb-2 max-w-3xl px-1 text-xs text-warn">
            Jarvis wartet auf deine Bestätigung. Schreibst du stattdessen weiter, wird der Vorschlag verworfen.
          </p>
        )}
        <Composer
          value={input}
          onChange={setInput}
          onSubmit={() => send()}
          onVoiceSubmit={(text) => send(text)}
          onStop={() => abortRef.current?.abort()}
          streaming={streaming}
          disabled={loading || busyActions.size > 0}
          placeholder={conversationId ? "Antworten …" : undefined}
        />
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-accent-soft px-4 py-2.5 text-[15px] leading-relaxed">
        {text}
      </div>
    </div>
  );
}

function ChatHeader({
  title,
  onRename,
  onExport,
  exportDisabled,
}: {
  title: string;
  onRename: (title: string) => Promise<boolean>;
  onExport: () => void;
  exportDisabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [saving, setSaving] = useState(false);

  if (editing) {
    return (
      <form
        className="flex items-center gap-2 border-b border-line bg-surface/60 px-4 py-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          setSaving(true);
          if (await onRename(draft.trim())) setEditing(false);
          setSaving(false);
        }}
      >
        <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={200} autoFocus className={`${inputClass} py-1.5`} aria-label="Chat-Titel" />
        <Button type="submit" variant="primary" disabled={saving || !draft.trim()}>
          Speichern
        </Button>
        <Button onClick={() => setEditing(false)}>Abbrechen</Button>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-2 border-b border-line bg-surface/40 px-4 py-2">
      <h1 className="min-w-0 flex-1 truncate text-sm font-medium text-text/90" title={title}>
        {title}
      </h1>
      <button
        type="button"
        onClick={() => {
          setDraft(title);
          setEditing(true);
        }}
        className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-text"
        aria-label="Chat umbenennen"
        title="Umbenennen"
      >
        <EditIcon width={16} height={16} />
      </button>
      <button
        type="button"
        onClick={onExport}
        disabled={exportDisabled}
        className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40"
        aria-label="Chat als Markdown exportieren"
        title="Als Markdown exportieren"
      >
        <DownloadIcon width={16} height={16} />
      </button>
    </div>
  );
}

function MessageTools({ id, text, speaker }: { id: string; text: string; speaker: ReturnType<typeof useSpeaker> | null }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  const speaking = speaker?.speakingId === id;
  return (
    <div className="flex gap-1 text-muted">
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(text).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            },
            () => {},
          );
        }}
        className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs hover:bg-surface-2 hover:text-text"
        aria-label="Antwort kopieren"
      >
        {copied ? <CheckIcon width={14} height={14} className="text-success" /> : <CopyIcon width={14} height={14} />}
        {copied ? "Kopiert" : "Kopieren"}
      </button>
      {speaker && (
        <button
          type="button"
          onClick={() => speaker.toggle(id, text)}
          className={`flex items-center gap-1 rounded-md px-1.5 py-1 text-xs hover:bg-surface-2 hover:text-text ${speaking ? "text-accent" : ""}`}
          aria-label={speaking ? "Vorlesen stoppen" : "Antwort vorlesen"}
          aria-pressed={speaking}
        >
          {speaking ? <StopIcon width={14} height={14} /> : <SpeakerIcon width={14} height={14} />}
          {speaking ? "Stopp" : "Vorlesen"}
        </button>
      )}
    </div>
  );
}

function AssistantBlock({
  id,
  segments,
  busyActions,
  onDecide,
  thinking,
  speaker = null,
}: {
  id?: string;
  segments: DisplaySegment[];
  busyActions: Set<string>;
  onDecide?: (action: ClientAction, decision: "approve" | "reject") => void;
  thinking?: boolean;
  speaker?: ReturnType<typeof useSpeaker> | null;
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-accent">
        <LogoMark width={16} height={16} />
      </div>
      <div className="min-w-0 flex-1 space-y-3 text-[15px]">
        {thinking && <Spinner label="Jarvis denkt nach …" />}
        {segments.map((segment, index) =>
          segment.type === "text" ? (
            <Markdown key={index} text={segment.text} />
          ) : (
            <ActionCard
              key={segment.action.id}
              action={segment.action}
              busy={busyActions.has(segment.action.id)}
              onDecide={onDecide ? (decision) => onDecide(segment.action, decision) : undefined}
            />
          ),
        )}
        {id && <MessageTools id={id} text={assistantText(segments)} speaker={speaker} />}
      </div>
    </div>
  );
}
