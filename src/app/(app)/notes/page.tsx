import { NotesView } from "@/components/notes/NotesView";

export const metadata = { title: "Notizen · Jarvis" };

export default async function NotesPage({ searchParams }: PageProps<"/notes">) {
  const { id, new: startNew } = await searchParams;
  const initialId = typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
  const isNew = startNew === "1";
  return <NotesView key={initialId ?? (isNew ? "new" : "list")} initialId={initialId} startNew={isNew} />;
}
