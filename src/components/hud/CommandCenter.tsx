"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { dueState, formatDate, formatDateTime, localDayOf, todayIso, weekdayShort } from "@/lib/client/dates";
import type { CalendarEvent, DashboardData, MailSummary, ServiceState, WeatherResponse } from "@/lib/client/types";
import type { HabitWithLogs } from "@/lib/data/types";
import { currentStreak, lastDays } from "@/lib/habits";
import { focusActions, formatClock } from "@/lib/client/focus-store";
import {
  ArrowRightIcon,
  BoltIcon,
  CalendarIcon,
  ChartIcon,
  ChatIcon,
  CheckIcon,
  CloudIcon,
  CoreIcon,
  DatabaseIcon,
  FlameIcon,
  MailIcon,
  MemoryIcon,
  MicIcon,
  NoteIcon,
  PauseIcon,
  PlayIcon,
  ShieldIcon,
  TaskIcon,
  TimerIcon,
} from "../icons";
import { Spinner } from "../ui";
import { useFocusTimer } from "../focus/useFocus";
import { useSpeechInput, useSpeechInputSupported } from "../voice/hooks";
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
  const [weather, setWeather] = useState<Load<Extract<WeatherResponse, { configured: true }>>>({ state: "loading" });
  const [habits, setHabits] = useState<HabitWithLogs[] | null>(null);
  const [habitError, setHabitError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [hello, setHello] = useState("Hallo");
  const micSupported = useSpeechInputSupported();
  const speech = useSpeechInput((text, final) => {
    setPrompt(text);
    if (final && text.trim()) router.push(`/chat?prompt=${encodeURIComponent(text.trim())}`);
  });

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => setHello(greeting()), 0);
    api<DashboardData>("/api/dashboard").then(
      (data) => {
        if (!active) return;
        setDash({ state: "ready", data });
        setHabits(data.habits);
        if (data.weatherConfigured) {
          api<WeatherResponse>("/api/weather").then(
            (w) => active && setWeather(w.configured ? { state: "ready", data: w } : { state: "off" }),
            (e) => active && setWeather({ state: "error", message: errorMessage(e) }),
          );
        } else setWeather({ state: "off" });
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
        setWeather({ state: "off" });
      },
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  async function toggleHabitToday(habit: HabitWithLogs) {
    const day = todayIso();
    const done = !habit.days.includes(day);
    const apply = (isDone: boolean) =>
      setHabits((list) =>
        list?.map((h) => (h.id === habit.id ? { ...h, days: isDone ? [...h.days.filter((d) => d !== day), day] : h.days.filter((d) => d !== day) } : h)) ?? null,
      );
    apply(done);
    setHabitError(null);
    try {
      await api(`/api/habits/${habit.id}/log`, { method: "POST", json: { day, done } });
    } catch (e) {
      apply(!done);
      setHabitError(errorMessage(e));
    }
  }

  function ask(event: React.FormEvent) {
    event.preventDefault();
    const text = prompt.trim();
    router.push(text ? `/chat?prompt=${encodeURIComponent(text)}` : "/chat");
  }

  const data = dash.state === "ready" ? dash.data : null;
  const today = todayIso();
  const overdue = data?.tasks.filter((t) => dueState(t.due_date, t.done, today) === "overdue") ?? [];
  const dueToday = data?.tasks.filter((t) => dueState(t.due_date, t.done, today) === "today") ?? [];
  const focusTasks = [...overdue, ...dueToday, ...(data?.tasks.filter((t) => !t.due_date || t.due_date > today) ?? [])]
    .sort((a, b) => Number(b.priority === "high") - Number(a.priority === "high"))
    .slice(0, 6);
  const week = lastDays(today, 7).map((day) => ({
    day,
    done: data?.completedAt.filter((c) => localDayOf(c) === day).length ?? 0,
    focus: data?.focusSessions.filter((f) => localDayOf(f.ended_at) === day).reduce((sum, f) => sum + f.minutes, 0) ?? 0,
  }));
  const weekDone = week.reduce((s, d) => s + d.done, 0);
  const weekFocus = week.reduce((s, d) => s + d.focus, 0);
  const maxDone = Math.max(3, ...week.map((d) => d.done));
  const habitsDoneToday = habits?.filter((h) => h.days.includes(today)).length ?? 0;

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
              <StatusRow icon={<CloudIcon width={18} height={18} />} label="Wetter" detail="Open-Meteo" state={data.weatherConfigured ? "configured" : "missing"} />
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
        <section className="hud-panel order-first flex flex-col items-center justify-center gap-4 px-4 py-6 lg:order-none lg:col-span-5">
          <div className="flex w-full flex-wrap items-start justify-between gap-3">
            <div>
              <p className="hud-title">Jarvis Command Center</p>
              <h1 className="mt-1 text-xl font-semibold">
                {hello}
                {data?.displayName ? `, ${data.displayName}` : ""}!
              </h1>
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
                placeholder={speech.listening ? "Ich höre zu …" : "Frag Jarvis etwas …"}
                maxLength={4000}
                className="min-w-0 flex-1 bg-transparent py-2 text-[15px] placeholder:text-muted/70 focus:outline-none"
              />
              {micSupported && (
                <button
                  type="button"
                  onClick={() => (speech.listening ? speech.stop() : speech.start())}
                  className={`flex size-9 shrink-0 items-center justify-center rounded-full border ${
                    speech.listening ? "animate-pulse border-danger/70 bg-danger-soft text-danger" : "border-line text-muted hover:border-accent/60 hover:text-accent"
                  }`}
                  aria-label={speech.listening ? "Aufnahme beenden" : "Per Sprache fragen"}
                  aria-pressed={speech.listening}
                >
                  <MicIcon width={18} height={18} />
                </button>
              )}
              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-full bg-accent-strong px-4 py-2 text-sm font-medium text-white hover:bg-accent"
              >
                Zum Chat <ArrowRightIcon width={16} height={16} />
              </button>
            </div>
            {speech.error && <p className="mt-2 text-center text-xs text-danger">{speech.error}</p>}
          </form>
        </section>

        {/* Wetter */}
        <Panel title="Wetter" icon={<CloudIcon width={16} height={16} />} action={{ href: "/settings", label: "Ort" }} className="lg:col-span-4">
          {weather.state === "loading" && <Spinner />}
          {weather.state === "error" && <PanelMessage>{weather.message}</PanelMessage>}
          {weather.state === "off" && (
            <PanelMessage>
              Noch kein Ort eingestellt.{" "}
              <Link href="/settings" className="text-accent underline underline-offset-2">
                Ort festlegen
              </Link>
            </PanelMessage>
          )}
          {weather.state === "ready" && <WeatherBody data={weather.data} />}
        </Panel>

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

        {/* Gewohnheiten */}
        <Panel title="Gewohnheiten heute" icon={<FlameIcon width={16} height={16} />} action={{ href: "/habits", label: "Alle" }} className="lg:col-span-4">
          {dash.state === "loading" && <Spinner />}
          {habitError && <PanelMessage>{habitError}</PanelMessage>}
          {habits && habits.length === 0 && (
            <PanelMessage>
              Noch keine Gewohnheiten.{" "}
              <Link href="/habits" className="text-accent underline underline-offset-2">
                Erste anlegen
              </Link>
            </PanelMessage>
          )}
          {habits && habits.length > 0 && (
            <>
              <div className="mb-3 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-accent shadow-[0_0_10px_rgba(63,208,255,0.8)] transition-all"
                    style={{ width: `${(habitsDoneToday / habits.length) * 100}%` }}
                  />
                </div>
                <span className="text-sm tabular-nums text-muted">
                  {habitsDoneToday}/{habits.length}
                </span>
              </div>
              <ul className="space-y-1.5">
                {habits.slice(0, 6).map((h) => {
                  const done = h.days.includes(today);
                  return (
                    <li key={h.id}>
                      <button
                        type="button"
                        onClick={() => void toggleHabitToday(h)}
                        aria-pressed={done}
                        className="flex w-full items-center gap-2.5 rounded-lg bg-surface-2/60 px-2.5 py-1.5 text-left text-sm hover:bg-surface-2"
                      >
                        <span
                          className={`flex size-5 shrink-0 items-center justify-center rounded border ${done ? "border-success bg-success/20 text-success" : "border-line"}`}
                        >
                          {done && <CheckIcon width={14} height={14} />}
                        </span>
                        <span className={`min-w-0 flex-1 truncate ${done ? "text-muted line-through" : ""}`}>
                          {h.emoji ? `${h.emoji} ` : ""}
                          {h.title}
                        </span>
                        <span className="flex shrink-0 items-center gap-1 text-xs text-warn">
                          <FlameIcon width={13} height={13} />
                          {currentStreak(h.days, today)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Panel>

        {/* Aktivität */}
        <Panel title="Aktivität · 7 Tage" icon={<ChartIcon width={16} height={16} />} className="lg:col-span-4">
          {dash.state === "loading" && <Spinner />}
          {data && (
            <>
              <div className="mb-2 grid grid-cols-2 gap-2 text-center">
                <Stat value={weekDone} label="Erledigt" tone="success" />
                <Stat value={weekFocus} label="Fokus-Min." tone="accent" href="/focus" />
              </div>
              <div className="flex h-24 items-end gap-1.5" role="img" aria-label={`Erledigte Aufgaben der letzten 7 Tage: insgesamt ${weekDone}`}>
                {week.map((d) => (
                  <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${d.done} erledigt · ${d.focus} Fokus-Min.`}>
                    <span className="text-[0.6rem] tabular-nums text-muted">{d.done || ""}</span>
                    <div
                      className={`w-full rounded-t ${d.day === today ? "bg-success shadow-[0_0_12px_-2px_rgba(62,230,168,0.8)]" : "bg-success/40"}`}
                      style={{ height: `${Math.max(3, (d.done / maxDone) * 100)}%` }}
                    />
                    <span className="text-[0.6rem] text-muted">{weekdayShort(d.day)}</span>
                  </div>
                ))}
              </div>
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

        {/* Fokus */}
        <FocusPanel />

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
              href={`/chat?prompt=${encodeURIComponent(
                "Gib mir ein kurzes Tagesbriefing: Was steht heute an (Aufgaben" +
                  (data?.status.calendar === "configured" ? ", Termine" : "") +
                  ", Gewohnheiten)" +
                  (data?.weatherConfigured ? " und wie wird das Wetter?" : "?"),
              )}`}
              icon={<BoltIcon width={18} height={18} />}
              label="Tagesbriefing"
            />
            <QuickLink
              href={`/chat?prompt=${encodeURIComponent("Wie produktiv war ich in den letzten 7 Tagen? Nutze meine echte Aktivitätsstatistik.")}`}
              icon={<ChartIcon width={18} height={18} />}
              label="Wochenrückblick"
            />
          </div>
        </Panel>

        {/* Letzte Chats */}
        <Panel title="Letzte Gespräche" icon={<ChatIcon width={16} height={16} />} action={{ href: "/chat", label: "Neuer Chat" }} className="lg:col-span-5">
          {data && data.recentConversations.length === 0 && <PanelMessage>Noch keine Gespräche.</PanelMessage>}
          {data && data.recentConversations.length > 0 && (
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {data.recentConversations.slice(0, 6).map((c) => (
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
        <Panel title="Gedächtnis" icon={<MemoryIcon width={16} height={16} />} action={{ href: "/memories", label: "Verwalten" }} className="lg:col-span-3">
          {data && (
            <div className="grid grid-cols-3 gap-2 text-center lg:grid-cols-1">
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

function Stat({
  value,
  label,
  tone,
  href,
}: {
  value: number;
  label: string;
  tone: "danger" | "warn" | "accent" | "muted" | "success";
  href?: string;
}) {
  const color = { danger: "text-danger", warn: "text-warn", accent: "text-accent", muted: "text-muted", success: "text-success" }[tone];
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

function WeatherBody({ data }: { data: Extract<WeatherResponse, { configured: true }> }) {
  const { current, daily } = data.forecast;
  return (
    <div>
      <div className="flex items-center gap-4">
        <span className="text-5xl drop-shadow-[0_0_12px_rgba(63,208,255,0.5)]" aria-hidden="true">
          {current.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="glow-text text-3xl font-semibold tabular-nums text-accent">{Math.round(current.temperature)}°</p>
          <p className="truncate text-sm">{current.text}</p>
          <p className="truncate text-xs text-muted">{data.location}</p>
        </div>
        <dl className="shrink-0 space-y-0.5 text-right text-xs text-muted">
          <div>
            gefühlt <span className="text-text">{Math.round(current.apparentTemperature)}°</span>
          </div>
          <div>
            Feuchte <span className="text-text">{current.humidity} %</span>
          </div>
          <div>
            Wind <span className="text-text">{current.windSpeed} km/h</span>
          </div>
        </dl>
      </div>
      <ul className="mt-3 grid grid-cols-4 gap-1.5 text-center">
        {daily.slice(0, 4).map((d, i) => (
          <li key={d.date} className="rounded-lg border border-line/60 bg-surface-2/50 px-1 py-1.5" title={d.text}>
            <span className="block text-[0.65rem] uppercase text-muted">{i === 0 ? "Heute" : weekdayShort(d.date)}</span>
            <span className="block text-xl" aria-hidden="true">
              {d.icon}
            </span>
            <span className="block text-xs tabular-nums">
              {d.max}° <span className="text-muted">{d.min}°</span>
            </span>
            {d.precipitationProbability !== null && <span className="block text-[0.6rem] text-accent/80">💧 {d.precipitationProbability} %</span>}
          </li>
        ))}
      </ul>
      {daily[0]?.sunrise && daily[0]?.sunset && (
        <p className="mt-3 flex justify-center gap-5 text-xs text-muted">
          <span>
            🌅 Aufgang <span className="text-text">{daily[0].sunrise.slice(11, 16)}</span>
          </span>
          <span>
            🌇 Untergang <span className="text-text">{daily[0].sunset.slice(11, 16)}</span>
          </span>
        </p>
      )}
      <p className="mt-2 text-right text-[0.6rem] text-muted">
        Wetterdaten:{" "}
        <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-accent">
          Open-Meteo.com
        </a>
      </p>
    </div>
  );
}

function FocusPanel() {
  const { state, remaining } = useFocusTimer();
  const running = state.status === "running";
  const progress = state.totalSec > 0 ? 1 - remaining / state.totalSec : 0;
  return (
    <Panel title="Fokus-Timer" icon={<TimerIcon width={16} height={16} />} action={{ href: "/focus", label: "Öffnen" }} className="lg:col-span-4">
      <div className="flex items-center gap-4">
        <div className="relative size-24 shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
            <circle cx="50" cy="50" r="42" fill="none" stroke="#17324f" strokeWidth="6" />
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke={state.mode === "focus" ? "#3fd0ff" : "#3ee6a8"}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${Math.max(0, Math.min(1, progress)) * 263.9} 263.9`}
              transform="rotate(-90 50 50)"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center font-mono text-lg font-semibold tabular-nums text-accent">
            {formatClock(remaining)}
          </span>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm">
            {state.mode === "focus" ? "Fokus" : "Pause"} · {Math.round(state.totalSec / 60)} Min.
            {state.label && <span className="block truncate text-xs text-muted">{state.label}</span>}
          </p>
          {running ? (
            <button
              type="button"
              onClick={() => focusActions.pause()}
              className="flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm hover:border-accent/60"
            >
              <PauseIcon width={16} height={16} /> Pause
            </button>
          ) : (
            <button
              type="button"
              onClick={() => focusActions.start()}
              className="flex items-center gap-1.5 rounded-lg bg-accent-strong px-3 py-1.5 text-sm font-medium text-white hover:bg-accent"
            >
              <PlayIcon width={16} height={16} /> {state.status === "paused" ? "Weiter" : "Starten"}
            </button>
          )}
        </div>
      </div>
    </Panel>
  );
}
