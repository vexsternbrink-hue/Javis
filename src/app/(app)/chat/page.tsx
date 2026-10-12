import { ChatView } from "@/components/chat/ChatView";

export default async function NewChatPage({ searchParams }: PageProps<"/chat">) {
  const { prompt } = await searchParams;
  // Vorschlag aus dem Command Center: nur vorausfüllen, nicht automatisch senden.
  const initialPrompt = typeof prompt === "string" ? prompt.slice(0, 4000) : "";
  return <ChatView key={initialPrompt} initialConversationId={null} initialPrompt={initialPrompt} />;
}
