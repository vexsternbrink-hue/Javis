import { requireApiUser } from "@/lib/auth";
import { parseJsonBody } from "@/lib/http";
import { chatRequestSchema } from "@/lib/validation";
import { runAgent } from "@/lib/agent/run";
import type { ChatEvent } from "@/lib/agent/events";

// Streaming-Antworten können etwas dauern (mehrere KI-Aufrufe in der Tool-Schleife).
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await requireApiUser(request, "chat");
  if (auth instanceof Response) return auth;

  const body = await parseJsonBody(request, chatRequestSchema);
  if (body instanceof Response) return body;

  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ChatEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };
      await runAgent({
        sb: auth.supabase,
        conversationId: body.conversationId,
        mode: "continue" in body ? { type: "continue" } : { type: "message", text: body.message },
        emit,
        signal: request.signal,
      });
      if (!closed) {
        closed = true;
        try {
          controller.close();
        } catch {
          // Verbindung wurde bereits vom Browser geschlossen
        }
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
