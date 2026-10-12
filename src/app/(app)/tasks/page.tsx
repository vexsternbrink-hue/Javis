import { TasksView } from "@/components/tasks/TasksView";

export const metadata = { title: "Aufgaben · Jarvis" };

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const { id, new: startNew } = await searchParams;
  const highlightId = typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
  return <TasksView key={highlightId ?? (startNew ? "new" : "list")} highlightId={highlightId} startNew={startNew === "1"} />;
}
