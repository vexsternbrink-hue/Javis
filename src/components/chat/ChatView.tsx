"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientAction, DisplayItem, DisplaySegment } from "@/lib/agent/events";
import { parseNdjson } from "@/lib/agent/events";
import { ApiError, api, errorMessage, goToLogin } from "@/lib/client/api";
import { useChatList } from "../AppShell";
import { LogoMark } from "../icons";
import { CoreOrb } from "../hud/CoreOrb";
import { Button, ErrorBanner, Spinner } from "../ui";
import { ActionCard } from "./ActionCard";
import { Composer } from "./Composer";
import { Markdown } from "./Markdown";

type ConversationResponse = {
  conversation: { id: string; title: string };
  items: DisplayItem[];
  needsContinue: boolean;
};

const SUGGESTIONS = [
  "Was steht bei meinen Aufgaben an?",
  "Lege eine Aufgabe an: Mathe-Hausaufgaben bis Freitag",
  "Merke dir: Ich mag kurze Antworten mit Beispielen.",
  "Erstelle eine Notiz mit Ideen für mein Referat",
];

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
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const applyLoaded = useCallback((result: ConversationResponse | Error) => {
    if (result instanceof Error) {
      if (result instanceof ApiError && result.status === 404) setNotFound(true);
      else setError(result.message);
    } else {
      setItems(result.items);
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
        // Neuer Chat: auf die dauerhafte Adresse wechseln (überlebt ein Neuladen).
        if (createdConversation && id) router.replace(`/chat/${id}`);
      }
    },
    [applyLoaded, refreshChatList, router],
  );

  function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setPendingUserText(text);
    void stream({ message: text });
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
              <div className="mx-auto mt-6 grid max-w-xl gap-2 sm:grid-cols-2">
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
                segments={item.segments}
                busyActions={busyActions}
                onDecide={streaming ? undefined : decide}
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
          onSubmit={send}
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

function AssistantBlock({
  segments,
  busyActions,
  onDecide,
  thinking,
}: {
  segments: DisplaySegment[];
  busyActions: Set<string>;
  onDecide?: (action: ClientAction, decision: "approve" | "reject") => void;
  thinking?: boolean;
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
      </div>
    </div>
  );
}
