"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { dueState, formatDate, formatDateTime, todayIso } from "@/lib/client/dates";
import type { CalendarEvent, DashboardData, MailSummary, ServiceState } from "@/lib/client/types";
import {
  ArrowRightIcon,
  BoltIcon,
  CalendarIcon,
  ChatIcon,
  CoreIcon,
  DatabaseIcon,
  MailIcon,
  MemoryIcon,
  NoteIcon,
  ShieldIcon,
  TaskIcon,
} from "../icons";
import { Spinner } from "../ui";
import { Clock, greeting } from "./Clock";
import { CoreOrb } from "./CoreOrb";
import { Panel, PanelMessage } from "./Panel";

type Load<T> = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; data: T } | { state: "off" };

function localMidnightIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function CommandCenter() {
  const router = useRouter();
  const [dash, setDash] = useState<Load<DashboardData>>({ state: "loading" });
  const [mail, setMail] = useState<Load<{ unreadCount: number | null; mails: MailSummary[] }>>({ state: "loading" });
  const [events, setEvents] = useState<Load<{ events: CalendarEvent[] }>>({ state: "loading" });
  const [prompt, setPrompt] = useState("");
  const [hello, setHello] = useState("Hallo");

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => setHello(greeting()), 0);
    api<DashboardData>("/api/dashboard").then(
      (data) => {
        if (!active) return;
        setDash({ state: "ready", data });
        if (data.status.mail === "configured") {
          api<{ unreadCount: number | null; mails: MailSummary[] }>("/api/mail?limit=6").then(
            (m) => active && setMail({ state: "ready", data: m }),
            (e) => active && setMail({ state: "error", message: errorMessage(e) }),
          );
        } else setMail({ state: "off" });
        if (data.status.calendar === "configured") {
          api<{ events: CalendarEvent[] }>(`/api/calendar?start=${encodeURIComponent(localMidnightIso())}&days=7`).then(
            (c) => active && setEvents({ state: "ready", data: c }),
            (e) => active && setEvents({ state: "error", message: errorMessage(e) }),
          );
        } else setEvents({ state: "off" });
      },
      (e) => {
        if (!active) return;
        setDash({ state: "error", message: errorMessage(e) });
        setMail({ state: "off" });
        setEvents({ state: "off" });
      },
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  function ask(event: React.FormEvent) {
    event.preventDefault();
    const text = prompt.trim();
    router.push(text ? `/chat?prompt=${encodeURIComponent(text)}` : "/chat");
  }

  const data = dash.state === "ready" ? dash.data : null;
  const today = todayIso();
  const overdue = data?.tasks.filter((t) => dueState(t.due_date, t.done, today) === "overdue") ?? [];
  const dueToday = data?.tasks.filter((t) => dueState(t.due_date, t.done, today) === "today") ?? [];
  const focusTasks = [...overdue, ...dueToday, ...(data?.tasks.filter((t) => !t.due_date || t.due_date > today) ?? [])].slice(0, 6);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-4 p-4 lg:grid-cols-12 lg:p-6 [&>*]:min-w-0">
        {/* Kernstatus */}
        <Panel title="Kernstatus" icon={<CoreIcon width={16} height={16} />} className="lg:col-span-3">
          {dash.state === "loading" && <Spinner />}
          {dash.state === "error" && <PanelMessage>{dash.message}</PanelMessage>}
          {data && (
            <ul className="space-y-2">
              <StatusRow
                icon={<CoreIcon width={18} height={18} />}
                label="KI-Kern"
                detail={`${data.status.ai.provider === "gemini" ? "Google Gemini" : "Anthropic Claude"} · ${data.status.ai.model}`}
                state={data.status.ai.configured ? "ok" : "missing"}
              />
              <StatusRow icon={<DatabaseIcon width={18} height={18} />} label="Datenbank" detail="Supabase" state="ok" />
              <StatusRow icon={<MailIcon width={18} height={18} />} label="Postfach" detail="GMX · nur lesen" state={data.status.mail} />
              <StatusRow icon={<CalendarIcon width={18} height={18} />} label="Kalender" detail="Apple iCloud" state={data.status.calendar} />
              <StatusRow
                icon={<ShieldIcon width={18} height={18} />}
                label="Schutz"
                detail="Änderungen nur nach Bestätigung"
                state="ok"
                okLabel="Aktiv"
              />
            </ul>
          )}
        </Panel>

        {/* Kern + Begrüßung */}
        <section className="hud-panel flex flex-col items-center justify-center gap-4 px-4 py-6 lg:col-span-5">
          <div className="flex w-full flex-wrap items-start justify-between gap-3">
            <div>
              <p className="hud-title">Jarvis Command Center</p>
              <h1 className="mt-1 text-xl font-semibold">{hello}!</h1>
            </div>
            <Clock className="text-right md:hidden" />
          </div>
          <CoreOrb size={230} />
          <form onSubmit={ask} className="w-full max-w-xl">
            <label htmlFor="ask" className="sr-only">
              Frage an Jarvis
            </label>
            <div className="flex items-center gap-2 rounded-full border border-accent/30 bg-surface/80 p-1.5 pl-5 shadow-[0_0_30px_-10px_rgba(63,208,255,0.6)] focus-within:border-accent/70">
              <input
                id="ask"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Frag Jarvis etwas …"
                maxLength={4000}
                className="min-w-0 flex-1 bg-transparent py-2 text-[15px] placeholder:text-muted/70 focus:outline-none"
              />
              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-full bg-accent-strong px-4 py-2 text-sm font-medium text-white hover:bg-accent"
              >
                Zum Chat <ArrowRightIcon width={16} height={16} />
              </button>
            </div>
          </form>
        </section>

        {/* Heute */}
        <Panel title="Heute im Fokus" icon={<TaskIcon width={16} height={16} />} action={{ href: "/tasks", label: "Alle" }} className="lg:col-span-4">
          {dash.state === "loading" && <Spinner />}
          {data && (
            <>
              <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                <Stat value={overdue.length} label="Überfällig" tone={overdue.length ? "danger" : "muted"} />
                <Stat value={dueToday.length} label="Heute" tone={dueToday.length ? "warn" : "muted"} />
                <Stat value={data.openTaskCount} label="Offen" tone="accent" />
              </div>
              {focusTasks.length === 0 ? (
                <PanelMessage>Keine offenen Aufgaben. 🎉</PanelMessage>
              ) : (
                <ul className="space-y-1.5">
                  {focusTasks.map((t) => {
                    const state = dueState(t.due_date, t.done, today);
                    return (
                      <li key={t.id} className="flex items-center gap-2 rounded-lg bg-surface-2/60 px-2.5 py-1.5 text-sm">
                        <span className={`status-dot ${state === "overdue" ? "text-danger" : state === "today" ? "text-warn" : "text-accent/60"}`} />
                        <span className="min-w-0 flex-1 truncate">{t.title}</span>
                        {t.due_date && <span className="shrink-0 text-xs text-muted">{formatDate(t.due_date)}</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </Panel>

        {/* Termine */}
        <Panel title="Termine · 7 Tage" icon={<CalendarIcon width={16} height={16} />} action={{ href: "/calendar", label: "Kalender" }} className="lg:col-span-4">
          <IntegrationBody load={events} service="Kalender" state={data?.status.calendar}>
            {(d) =>
              d.events.length === 0 ? (
                <PanelMessage>Keine Termine in den nächsten 7 Tagen.</PanelMessage>
              ) : (
                <ul className="space-y-1.5">
                  {d.events.slice(0, 7).map((e) => (
                    <li key={e.id} className="flex gap-3 rounded-lg bg-surface-2/60 px-2.5 py-1.5 text-sm">
                      <span className="w-24 shrink-0 text-xs leading-5 text-accent">{eventWhen(e)}</span>
                      <span className="min-w-0 flex-1 truncate">{e.title}</span>
                    </li>
                  ))}
                </ul>
              )
            }
          </IntegrationBody>
        </Panel>

        {/* Posteingang */}
        <Panel title="Posteingang" icon={<MailIcon width={16} height={16} />} action={{ href: "/mail", label: "Öffnen" }} className="lg:col-span-4">
          <IntegrationBody load={mail} service="Postfach" state={data?.status.mail}>
            {(d) => (
              <>
                {d.unreadCount !== null && (
                  <p className="mb-2 text-sm">
                    <span className="glow-text text-2xl font-semibold text-accent">{d.unreadCount}</span>{" "}
                    <span className="text-muted">ungelesen</span>
                  </p>
                )}
                {d.mails.length === 0 ? (
                  <PanelMessage>Der Posteingang ist leer.</PanelMessage>
                ) : (
                  <ul className="space-y-1.5">
                    {d.mails.slice(0, 5).map((m) => (
                      <li key={m.uid}>
                        <Link href={`/mail?uid=${m.uid}`} className="flex gap-2 rounded-lg bg-surface-2/60 px-2.5 py-1.5 text-sm hover:bg-surface-2">
                          {m.unread && <span className="status-dot mt-1.5 shrink-0 text-accent" />}
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate ${m.unread ? "font-medium" : "text-muted"}`}>{m.subject}</span>
                            <span className="block truncate text-xs text-muted">{m.from}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </IntegrationBody>
        </Panel>

        {/* Schnellbefehle */}
        <Panel title="Schnellbefehle" icon={<BoltIcon width={16} height={16} />} className="lg:col-span-4">
          <div className="grid gap-2">
            <QuickLink href="/chat" icon={<ChatIcon width={18} height={18} />} label="Neuer Chat" />
            <QuickLink href="/tasks" icon={<TaskIcon width={18} height={18} />} label="Aufgabe anlegen" />
            <QuickLink href="/notes" icon={<NoteIcon width={18} height={18} />} label="Notiz schreiben" />
            {data?.status.calendar === "configured" && (
              <QuickLink href="/calendar" icon={<CalendarIcon width={18} height={18} />} label="Termin anlegen" />
            )}
            {data?.status.mail === "configured" && (
              <QuickLink
                href={`/chat?prompt=${encodeURIComponent("Fasse meine ungelesenen E-Mails kurz zusammen.")}`}
                icon={<MailIcon width={18} height={18} />}
                label="Ungelesene Mails zusammenfassen"
              />
            )}
            <QuickLink
              href={`/chat?prompt=${encodeURIComponent("Was steht heute an? Schau in meine Aufgaben" + (data?.status.calendar === "configured" ? " und meinen Kalender." : "."))}`}
              icon={<BoltIcon width={18} height={18} />}
              label="Tagesbriefing"
            />
          </div>
        </Panel>

        {/* Letzte Chats */}
        <Panel title="Letzte Gespräche" icon={<ChatIcon width={16} height={16} />} action={{ href: "/chat", label: "Neuer Chat" }} className="lg:col-span-6">
          {data && data.recentConversations.length === 0 && <PanelMessage>Noch keine Gespräche.</PanelMessage>}
          {data && data.recentConversations.length > 0 && (
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {data.recentConversations.map((c) => (
                <li key={c.id}>
                  <Link href={`/chat/${c.id}`} className="block rounded-lg bg-surface-2/60 px-3 py-2 text-sm hover:bg-surface-2">
                    <span className="block truncate">{c.title}</span>
                    <span className="text-xs text-muted">{formatDateTime(c.updated_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Gedächtnis */}
        <Panel title="Gedächtnis" icon={<MemoryIcon width={16} height={16} />} action={{ href: "/memories", label: "Verwalten" }} className="lg:col-span-6">
          {data && (
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat value={data.memoryCount} label="Erinnerungen" tone="accent" href="/memories" />
              <Stat value={data.noteCount} label="Notizen" tone="accent" href="/notes" />
              <Stat value={data.openTaskCount} label="Offene Aufgaben" tone="accent" href="/tasks" />
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function eventWhen(e: CalendarEvent): string {
  if (e.allDay) {
    const [y, m, d] = e.start.split("-").map(Number);
    return `${new Date(y, m - 1, d).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "numeric" })} · ganztägig`;
  }
  const start = new Date(e.start);
  return start.toLocaleString("de-DE", { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
}

function StatusRow({
  icon,
  label,
  detail,
  state,
  okLabel = "Online",
}: {
  icon: ReactNode;
  label: string;
  detail: string;
  state: ServiceState;
  okLabel?: string;
}) {
  const view: Record<ServiceState, { text: string; tone: string }> = {
    ok: { text: okLabel, tone: "text-success" },
    configured: { text: "Verbunden", tone: "text-success" },
    missing: { text: "Einrichten", tone: "text-warn" },
    not_owner: { text: "Nur Besitzer", tone: "text-muted" },
  };
  const v = view[state];
  return (
    <li className="flex items-center gap-3 rounded-lg border border-line/60 bg-surface-2/50 px-3 py-2">
      <span className="text-accent">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block truncate text-xs text-muted">{detail}</span>
      </span>
      <span className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs ${v.tone}`}>
        <span className="status-dot" /> {v.text}
      </span>
    </li>
  );
}

function Stat({ value, label, tone, href }: { value: number; label: string; tone: "danger" | "warn" | "accent" | "muted"; href?: string }) {
  const color = { danger: "text-danger", warn: "text-warn", accent: "text-accent", muted: "text-muted" }[tone];
  const body = (
    <>
      <span className={`glow-text block text-2xl font-semibold tabular-nums ${color}`}>{value}</span>
      <span className="block truncate text-[0.62rem] uppercase tracking-wider text-muted">{label}</span>
    </>
  );
  const cls = "block rounded-lg border border-line/60 bg-surface-2/50 px-2 py-2.5";
  return href ? (
    <Link href={href} className={`${cls} hover:border-accent/50`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-lg border border-line/70 bg-surface-2/50 px-3 py-2.5 text-sm hover:border-accent/60 hover:bg-accent-soft/60"
    >
      <span className="text-accent">{icon}</span>
      <span className="flex-1">{label}</span>
      <ArrowRightIcon width={16} height={16} className="text-muted group-hover:text-accent" />
    </Link>
  );
}

function IntegrationBody<T>({
  load,
  service,
  state,
  children,
}: {
  load: Load<T>;
  service: string;
  state: ServiceState | undefined;
  children: (data: T) => ReactNode;
}) {
  if (load.state === "loading") return <Spinner />;
  if (load.state === "error") return <PanelMessage>{load.message}</PanelMessage>;
  if (load.state === "off") {
    if (state === "not_owner") return <PanelMessage>Nur für den Besitzer dieser Jarvis-Installation.</PanelMessage>;
    return (
      <PanelMessage>
        {service} ist noch nicht verbunden. Die Einrichtung steht in der README (Abschnitt „GMX &amp; Apple-Kalender“).
      </PanelMessage>
    );
  }
  return <>{children(load.data)}</>;
}
