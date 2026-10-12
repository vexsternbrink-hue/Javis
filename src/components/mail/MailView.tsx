"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import type { MailDetail, MailSummary } from "@/lib/client/types";
import { BackIcon, MailIcon, SearchIcon } from "../icons";
import { Button, EmptyState, ErrorBanner, Spinner, inputClass } from "../ui";

type ListState = { loading: boolean; error: string | null; unreadCount: number | null; mails: MailSummary[] };

function formatMailDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("de-DE", { day: "numeric", month: "short" });
}

export function MailView({ initialUid }: { initialUid: number | null }) {
  const [list, setList] = useState<ListState>({ loading: true, error: null, unreadCount: null, mails: [] });
  const [query, setQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selected, setSelected] = useState<number | null>(initialUid);
  const [detail, setDetail] = useState<{ loading: boolean; error: string | null; mail: MailDetail | null }>({
    loading: false,
    error: null,
    mail: null,
  });
  const [reload, setReload] = useState(0);
  const [activeQuery, setActiveQuery] = useState("");

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ limit: "30" });
    if (activeQuery) params.set("q", activeQuery);
    else if (unreadOnly) params.set("unread", "1");
    api<{ unreadCount: number | null; mails: MailSummary[] }>(`/api/mail?${params}`).then(
      (data) => active && setList({ loading: false, error: null, unreadCount: data.unreadCount, mails: data.mails }),
      (e) => active && setList({ loading: false, error: errorMessage(e), unreadCount: null, mails: [] }),
    );
    return () => {
      active = false;
    };
  }, [activeQuery, unreadOnly, reload]);

  useEffect(() => {
    if (selected === null) return;
    let active = true;
    api<{ mail: MailDetail }>(`/api/mail/${selected}`).then(
      (data) => active && setDetail({ loading: false, error: null, mail: data.mail }),
      (e) => active && setDetail({ loading: false, error: errorMessage(e), mail: null }),
    );
    return () => {
      active = false;
    };
  }, [selected]);

  function open(uid: number) {
    setDetail({ loading: true, error: null, mail: null });
    setSelected(uid);
  }

  function refresh(next: () => void) {
    setList((l) => ({ ...l, loading: true }));
    next();
  }

  return (
    <div className="flex h-full">
      <section className={`flex w-full flex-col border-accent/15 md:w-96 md:shrink-0 md:border-r ${selected !== null ? "hidden md:flex" : "flex"}`}>
        <div className="space-y-3 border-b border-accent/15 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="hud-title">GMX · nur lesen</p>
              <h1 className="text-xl font-semibold">Posteingang</h1>
            </div>
            {list.unreadCount !== null && (
              <span className="hud-chip text-accent">
                <span className="status-dot" /> {list.unreadCount} ungelesen
              </span>
            )}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              refresh(() => setActiveQuery(query.trim()));
            }}
          >
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Absender, Betreff oder Text …"
              className={inputClass}
              aria-label="E-Mails durchsuchen"
              maxLength={100}
            />
            <Button type="submit" aria-label="Suchen">
              <SearchIcon width={18} height={18} />
            </Button>
          </form>
          <div className="flex items-center gap-1 text-sm">
            <button
              type="button"
              onClick={() => refresh(() => { setUnreadOnly(false); setActiveQuery(""); setQuery(""); })}
              className={`rounded-lg px-3 py-1.5 ${!unreadOnly && !activeQuery ? "bg-surface-2 text-text" : "text-muted hover:text-text"}`}
            >
              Neueste
            </button>
            <button
              type="button"
              onClick={() => refresh(() => { setUnreadOnly(true); setActiveQuery(""); setQuery(""); })}
              className={`rounded-lg px-3 py-1.5 ${unreadOnly && !activeQuery ? "bg-surface-2 text-text" : "text-muted hover:text-text"}`}
            >
              Ungelesen
            </button>
            <button type="button" onClick={() => refresh(() => setReload((n) => n + 1))} className="ml-auto rounded-lg px-3 py-1.5 text-muted hover:text-text">
              Aktualisieren
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {list.loading && <div className="p-3"><Spinner label="Verbinde mit GMX …" /></div>}
          {!list.loading && list.error && <div className="p-2"><ErrorBanner message={list.error} /></div>}
          {!list.loading && !list.error && list.mails.length === 0 && (
            <div className="p-2">
              <EmptyState title={activeQuery ? "Keine Treffer" : "Keine E-Mails"} />
            </div>
          )}
          <ul>
            {!list.loading &&
              list.mails.map((m) => (
                <li key={m.uid}>
                  <button
                    type="button"
                    onClick={() => open(m.uid)}
                    className={`flex w-full gap-2 rounded-lg px-3 py-2.5 text-left ${selected === m.uid ? "bg-accent-soft/70" : "hover:bg-surface-2"}`}
                  >
                    <span className={`status-dot mt-2 shrink-0 ${m.unread ? "text-accent" : "text-transparent shadow-none"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className={`min-w-0 flex-1 truncate text-sm ${m.unread ? "font-semibold" : ""}`}>{m.from}</span>
                        <span className="shrink-0 text-xs text-muted">{formatMailDate(m.date)}</span>
                      </span>
                      <span className={`block truncate text-sm ${m.unread ? "" : "text-muted"}`}>{m.subject}</span>
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </div>
        <p className="border-t border-accent/15 px-4 py-2 text-xs text-muted">
          Mails werden direkt von GMX geladen. Nur wenn du Jarvis im Chat nach Mails fragst, gehen Inhalte an den KI-Anbieter.
        </p>
      </section>

      <section className={`min-w-0 flex-1 flex-col ${selected !== null ? "flex" : "hidden md:flex"}`}>
        {selected === null ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted">
            <MailIcon width={36} height={36} className="text-accent/60" />
            Wähle links eine E-Mail aus.
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 border-b border-accent/15 px-3 py-2.5">
              <button type="button" onClick={() => setSelected(null)} className="rounded-lg p-2 text-muted hover:bg-surface-2 md:hidden" aria-label="Zurück">
                <BackIcon />
              </button>
              {detail.mail && (
                <Link
                  href={`/chat?prompt=${encodeURIComponent(`Fasse die E-Mail mit der UID ${detail.mail.uid} („${detail.mail.subject}“) kurz zusammen.`)}`}
                  className="ml-auto rounded-lg border border-accent/40 px-3 py-1.5 text-sm text-accent hover:bg-accent-soft"
                >
                  Mit Jarvis zusammenfassen
                </Link>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {detail.loading && <Spinner label="Lade E-Mail …" />}
              {detail.error && <ErrorBanner message={detail.error} />}
              {detail.mail && (
                <article className="hud-panel p-5">
                  <h2 className="text-lg font-semibold">{detail.mail.subject}</h2>
                  <dl className="mt-3 grid grid-cols-[4rem_1fr] gap-y-1 text-sm">
                    <dt className="text-muted">Von</dt>
                    <dd className="break-words">{detail.mail.from}{detail.mail.fromAddress ? ` <${detail.mail.fromAddress}>` : ""}</dd>
                    <dt className="text-muted">An</dt>
                    <dd className="break-words">{detail.mail.to}</dd>
                    <dt className="text-muted">Datum</dt>
                    <dd>{detail.mail.date ? new Date(detail.mail.date).toLocaleString("de-DE") : "–"}</dd>
                  </dl>
                  <div className="mt-4 whitespace-pre-wrap break-words border-t border-line pt-4 text-[15px] leading-relaxed">
                    {detail.mail.text}
                  </div>
                  {detail.mail.truncated && <p className="mt-3 text-xs text-muted">Die E-Mail wurde gekürzt angezeigt.</p>}
                </article>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
