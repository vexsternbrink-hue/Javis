"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Conversation } from "@/lib/data/types";
import { api, errorMessage } from "@/lib/client/api";
import type { SystemStatus } from "@/lib/client/types";
import {
  CalendarIcon,
  ChatIcon,
  CloseIcon,
  GridIcon,
  LogoMark,
  LogoutIcon,
  MailIcon,
  MemoryIcon,
  MenuIcon,
  NoteIcon,
  PlusIcon,
  TaskIcon,
  TrashIcon,
} from "./icons";
import { Clock } from "./hud/Clock";

type ChatListContextValue = {
  refresh: () => Promise<void>;
};

const ChatListContext = createContext<ChatListContextValue>({ refresh: async () => {} });

export function useChatList() {
  return useContext(ChatListContext);
}

const NAV = [
  { href: "/", label: "Übersicht", icon: GridIcon },
  { href: "/chat", label: "Chat", icon: ChatIcon },
  { href: "/tasks", label: "Aufgaben", icon: TaskIcon },
  { href: "/notes", label: "Notizen", icon: NoteIcon },
  { href: "/memories", label: "Erinnerungen", icon: MemoryIcon },
  { href: "/mail", label: "Posteingang", icon: MailIcon },
  { href: "/calendar", label: "Kalender", icon: CalendarIcon },
];

function SystemChip({ status }: { status: SystemStatus | null }) {
  if (!status) return <span className="hud-chip text-muted">SYSTEM · …</span>;
  const ready = status.ai.configured;
  return (
    <span className={`hud-chip ${ready ? "text-success" : "text-warn"}`} title="Echter Einrichtungsstatus">
      <span className="status-dot" />
      <span className="text-text/90">SYSTEM</span>
      {ready ? "BEREIT" : "KI NICHT EINGERICHTET"}
    </span>
  );
}

export function AppShell({ email, children }: { email: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ conversations: Conversation[] }>("/api/conversations");
      setConversations(data.conversations);
      setListError(null);
    } catch (error) {
      setListError(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    // Chatliste und Systemstatus einmal beim Start laden
    let active = true;
    api<{ status: SystemStatus }>("/api/status").then(
      (data) => active && setStatus(data.status),
      () => {},
    );
    api<{ conversations: Conversation[] }>("/api/conversations").then(
      (data) => {
        if (active) setConversations(data.conversations);
      },
      (error) => {
        if (active) setListError(errorMessage(error));
      },
    );
    return () => {
      active = false;
    };
  }, []);

  // Schublade auf dem Smartphone nach Navigation schließen
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  async function deleteConversation(conversation: Conversation) {
    if (!window.confirm(`Chat „${conversation.title}“ wirklich löschen? Das kann nicht rückgängig gemacht werden.`)) return;
    try {
      await api(`/api/conversations/${conversation.id}`, { method: "DELETE" });
      setConversations((list) => list?.filter((c) => c.id !== conversation.id) ?? null);
      if (pathname === `/chat/${conversation.id}`) router.push("/chat");
    } catch (error) {
      window.alert(errorMessage(error));
    }
  }

  const activeSection = NAV.find((n) =>
    n.href === "/" ? pathname === "/" : pathname === n.href || pathname.startsWith(n.href + "/"),
  )?.href;

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-4 pb-4 pt-4">
        <span className="flex size-10 items-center justify-center rounded-full border border-accent/40 bg-accent-soft/60 shadow-[0_0_18px_-4px_rgba(63,208,255,0.8)]">
          <LogoMark className="text-accent" width={24} height={24} />
        </span>
        <span>
          <span className="glow-text block text-lg font-semibold tracking-[0.3em] text-accent">JARVIS</span>
          <span className="block text-[0.6rem] tracking-[0.3em] text-muted">COMMAND CENTER</span>
        </span>
        <button
          type="button"
          className="ml-auto rounded-lg p-2 text-muted hover:bg-surface-2 md:hidden"
          onClick={() => setOpen(false)}
          aria-label="Menü schließen"
        >
          <CloseIcon />
        </button>
      </div>

      <nav className="px-2" aria-label="Hauptnavigation">
        {NAV.map(({ href, label, icon: NavIcon }) => (
          <Link
            key={href}
            href={href}
            className={`flex min-h-10 items-center gap-3 rounded-lg border px-3 py-2 text-[15px] ${
              activeSection === href
                ? "border-accent/40 bg-accent-soft/70 text-text shadow-[inset_3px_0_0_0_rgba(63,208,255,0.9)]"
                : "border-transparent text-muted hover:bg-surface-2 hover:text-text"
            }`}
          >
            <NavIcon className={activeSection === href ? "text-accent" : ""} />
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-4 flex items-center justify-between px-4">
        <span className="hud-title">Gespräche</span>
        <Link
          href="/chat"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-accent hover:bg-surface-2"
          onClick={() => setOpen(false)}
        >
          <PlusIcon width={14} height={14} /> Neuer Chat
        </Link>
      </div>

      <div className="mt-1 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {listError && <p className="px-3 py-2 text-sm text-danger">{listError}</p>}
        {conversations === null && !listError && <p className="px-3 py-2 text-sm text-muted">Lädt …</p>}
        {conversations?.length === 0 && (
          <p className="px-3 py-2 text-sm text-muted">Noch keine Chats. Schreib Jarvis einfach eine Nachricht.</p>
        )}
        <ul>
          {conversations?.map((c) => {
            const active = pathname === `/chat/${c.id}`;
            return (
              <li key={c.id} className="group relative">
                <Link
                  href={`/chat/${c.id}`}
                  className={`block truncate rounded-lg py-2 pl-3 pr-10 text-sm ${
                    active ? "bg-surface-2 text-text" : "text-muted hover:bg-surface-2 hover:text-text"
                  }`}
                  title={c.title}
                >
                  {c.title}
                </Link>
                <button
                  type="button"
                  onClick={() => deleteConversation(c)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted opacity-100 hover:text-danger md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
                  aria-label={`Chat „${c.title}“ löschen`}
                >
                  <TrashIcon width={16} height={16} />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-t border-line px-3 py-3">
        <p className="truncate px-1 text-xs text-muted" title={email}>
          {email}
        </p>
        <form action="/auth/signout" method="post" className="mt-1.5">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted hover:bg-surface-2 hover:text-text"
          >
            <LogoutIcon width={18} height={18} /> Abmelden
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <ChatListContext.Provider value={{ refresh }}>
      <div className="flex h-dvh overflow-hidden">
        {/* Sidebar Desktop */}
        <aside className="hidden w-72 shrink-0 border-r border-accent/15 bg-surface/80 backdrop-blur md:block">{sidebar}</aside>

        {/* Sidebar Smartphone (Schublade) */}
        {open && (
          <div className="fixed inset-0 z-40 md:hidden">
            <button type="button" className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} aria-label="Menü schließen" />
            <aside className="absolute inset-y-0 left-0 w-[84%] max-w-80 border-r border-line bg-surface pt-[env(safe-area-inset-top)]">
              {sidebar}
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="hidden items-center gap-4 border-b border-accent/15 bg-surface/60 px-6 py-2.5 backdrop-blur md:flex">
            <SystemChip status={status} />
            <Clock className="ml-auto text-right [&>div:last-child]:text-lg" />
          </header>
          <header className="flex items-center gap-2 border-b border-accent/15 bg-surface/90 px-2 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
            <button
              type="button"
              className="rounded-lg p-2.5 text-muted hover:bg-surface-2"
              onClick={() => setOpen(true)}
              aria-label="Menü öffnen"
            >
              <MenuIcon />
            </button>
            <span className="flex items-center gap-2 py-3 font-semibold tracking-[0.25em] text-accent">
              <LogoMark className="text-accent" width={22} height={22} /> JARVIS
            </span>
            <Link href="/chat" className="ml-auto rounded-lg p-2.5 text-muted hover:bg-surface-2" aria-label="Neuer Chat">
              <PlusIcon />
            </Link>
          </header>
          <main className="min-h-0 flex-1">{children}</main>
        </div>
      </div>
    </ChatListContext.Provider>
  );
}
