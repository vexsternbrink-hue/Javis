import "server-only";
import type { ServerSupabase } from "../supabase/server";
import { dbError } from "./errors";
import { toIlikePattern } from "./notes";

export type SearchHit = {
  kind: "task" | "note" | "memory" | "conversation" | "habit";
  id: string;
  title: string;
  excerpt: string | null;
  href: string;
};

function excerptAround(text: string, query: string, max = 120): string {
  const flat = text
    .replace(/[#*_`>~|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const index = flat.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0 || flat.length <= max) return flat.slice(0, max) + (flat.length > max ? "…" : "");
  const start = Math.max(0, index - 40);
  return (start > 0 ? "…" : "") + flat.slice(start, start + max) + (start + max < flat.length ? "…" : "");
}

/** Durchsucht alle eigenen Daten (RLS begrenzt auf den angemeldeten Nutzer). */
export async function searchAll(sb: ServerSupabase, query: string, perKind = 6): Promise<SearchHit[]> {
  const pattern = toIlikePattern(query);
  if (!pattern) return [];
  const plain = pattern.slice(1, -1);
  const [tasks, notes, memories, conversations, habits] = await Promise.all([
    sb
      .from("tasks")
      .select("id, title, details, done")
      .or(`title.ilike."${pattern}",details.ilike."${pattern}"`)
      .order("done", { ascending: true })
      .order("updated_at", { ascending: false })
      .limit(perKind),
    sb
      .from("notes")
      .select("id, title, content")
      .or(`title.ilike."${pattern}",content.ilike."${pattern}"`)
      .order("updated_at", { ascending: false })
      .limit(perKind),
    sb.from("memories").select("id, content").ilike("content", pattern).limit(perKind),
    sb.from("conversations").select("id, title").ilike("title", pattern).order("updated_at", { ascending: false }).limit(perKind),
    sb.from("habits").select("id, title, emoji").ilike("title", pattern).eq("archived", false).limit(perKind),
  ]);
  for (const r of [tasks, notes, memories, conversations, habits]) if (r.error) dbError("Suchen", r.error);

  return [
    ...(tasks.data ?? []).map((t) => ({
      kind: "task" as const,
      id: t.id as string,
      title: `${t.done ? "✓ " : ""}${t.title as string}`,
      excerpt: t.details ? excerptAround(t.details as string, plain) : null,
      href: `/tasks?id=${t.id}`,
    })),
    ...(notes.data ?? []).map((n) => ({
      kind: "note" as const,
      id: n.id as string,
      title: n.title as string,
      excerpt: n.content ? excerptAround(n.content as string, plain) : null,
      href: `/notes?id=${n.id}`,
    })),
    ...(memories.data ?? []).map((m) => ({
      kind: "memory" as const,
      id: m.id as string,
      title: excerptAround(m.content as string, plain, 90),
      excerpt: null,
      href: "/memories",
    })),
    ...(conversations.data ?? []).map((c) => ({
      kind: "conversation" as const,
      id: c.id as string,
      title: c.title as string,
      excerpt: null,
      href: `/chat/${c.id}`,
    })),
    ...(habits.data ?? []).map((h) => ({
      kind: "habit" as const,
      id: h.id as string,
      title: `${h.emoji ? `${h.emoji} ` : ""}${h.title as string}`,
      excerpt: null,
      href: "/habits",
    })),
  ];
}
