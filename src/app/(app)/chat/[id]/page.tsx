import { notFound } from "next/navigation";
import { ChatView } from "@/components/chat/ChatView";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ChatPage({ params }: PageProps<"/chat/[id]">) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  return <ChatView key={id} initialConversationId={id} />;
}
