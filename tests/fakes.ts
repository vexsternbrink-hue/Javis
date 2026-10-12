// In-Memory-Ersatz für Datenbank und KI-Anbieter, um den Agent-Ablauf ohne
// echte Zugangsdaten zu testen. Die RLS-Regeln selbst testet scripts/test-rls.sh.
import type { AgentAction, Conversation, Task } from "@/lib/data/types";
import type { StoredActionResult, StoredMessage } from "@/lib/agent/history";
import type { NewAction } from "@/lib/agent/store";
import type { ChatProvider, ContentBlock, TurnRequest, TurnResult } from "@/lib/ai/types";
import type { TaskCreate, TaskUpdate } from "@/lib/validation";

export const db = {
  conversations: [] as Conversation[],
  messages: [] as Array<StoredMessage & { conversation_id: string }>,
  actions: [] as AgentAction[],
  tasks: [] as Task[],
  memories: [] as Array<{ id: string; content: string; created_at: string; updated_at: string }>,
  calls: { createTask: [] as TaskCreate[], deleteTask: [] as string[] },
};

let counter = 0;
const uuid = () => {
  counter++;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
};
const now = () => new Date().toISOString();

export function resetDb() {
  db.conversations = [];
  db.messages = [];
  db.actions = [];
  db.tasks = [];
  db.memories = [];
  db.calls = { createTask: [], deleteTask: [] };
  provider.script = [];
  provider.requests = [];
}

export function addTask(title: string): Task {
  const task: Task = { id: uuid(), title, details: null, due_date: null, done: false, completed_at: null, created_at: now(), updated_at: now() };
  db.tasks.push(task);
  return task;
}

// ---- Ersatz für src/lib/agent/store.ts ----
export const store = {
  async getConversation(_sb: unknown, id: string) {
    return db.conversations.find((c) => c.id === id) ?? null;
  },
  async createConversation(_sb: unknown, title: string) {
    const c = { id: uuid(), title, created_at: now(), updated_at: now() };
    db.conversations.push(c);
    return c;
  },
  async touchConversation() {},
  async loadMessages(_sb: unknown, conversationId: string) {
    return db.messages.filter((m) => m.conversation_id === conversationId).map((m) => structuredClone(m));
  },
  async insertMessage(
    _sb: unknown,
    v: { conversationId: string; role: "user" | "assistant"; content: ContentBlock[]; displayText?: string | null; memoryHash?: string | null },
  ) {
    const m = {
      id: db.messages.length + 1,
      conversation_id: v.conversationId,
      role: v.role,
      content: structuredClone(v.content),
      display_text: v.displayText ?? null,
      memory_hash: v.memoryHash ?? null,
      created_at: now(),
    };
    db.messages.push(m);
    return structuredClone(m);
  },
  async loadActionsForMessages(_sb: unknown, ids: number[]) {
    return db.actions.filter((a) => ids.includes(a.message_id)).map((a) => structuredClone(a));
  },
  async loadAction(_sb: unknown, id: string) {
    const a = db.actions.find((x) => x.id === id);
    return a ? structuredClone(a) : null;
  },
  async insertActions(_sb: unknown, actions: NewAction[]) {
    const rows = actions.map((a) => ({
      ...structuredClone(a),
      id: uuid(),
      created_at: now(),
      resolved_at: a.status === "pending" ? null : now(),
    })) as AgentAction[];
    db.actions.push(...rows);
    return structuredClone(rows);
  },
  async transitionAction(
    _sb: unknown,
    id: string,
    from: AgentAction["status"],
    to: AgentAction["status"],
    result: StoredActionResult | null = null,
  ) {
    const a = db.actions.find((x) => x.id === id && x.status === from);
    if (!a) return null;
    a.status = to;
    if (to !== "approved") {
      a.result = result as AgentAction["result"];
      a.resolved_at = now();
    }
    return structuredClone(a);
  },
  async cancelPendingActions(_sb: unknown, messageId: number) {
    for (const a of db.actions) if (a.message_id === messageId && a.status === "pending") a.status = "cancelled";
  },
  async latestMessageId(_sb: unknown, conversationId: string) {
    const list = db.messages.filter((m) => m.conversation_id === conversationId);
    return list.length ? list[list.length - 1].id : null;
  },
};

// ---- Ersatz für src/lib/data/tasks.ts ----
export const tasks = {
  async listTasks(_sb: unknown, filter: "open" | "done" | "all" = "all") {
    return db.tasks.filter((t) => (filter === "all" ? true : filter === "done" ? t.done : !t.done));
  },
  async getTask(_sb: unknown, id: string) {
    return db.tasks.find((t) => t.id === id) ?? null;
  },
  async createTask(_sb: unknown, input: TaskCreate) {
    db.calls.createTask.push(structuredClone(input));
    const task = addTask(input.title);
    task.details = input.details ?? null;
    task.due_date = input.due_date ?? null;
    return task;
  },
  async updateTask(_sb: unknown, id: string, patch: TaskUpdate) {
    const t = db.tasks.find((x) => x.id === id);
    if (!t) return null;
    Object.assign(t, patch);
    return t;
  },
  async deleteTask(_sb: unknown, id: string) {
    db.calls.deleteTask.push(id);
    const before = db.tasks.length;
    db.tasks = db.tasks.filter((t) => t.id !== id);
    return db.tasks.length < before;
  },
};

export const memories = {
  async listMemories() {
    return db.memories;
  },
  async createMemory(_sb: unknown, content: string) {
    const m = { id: uuid(), content, created_at: now(), updated_at: now() };
    db.memories.push(m);
    return m;
  },
  async updateMemory() {
    return null;
  },
  async deleteMemory() {
    return false;
  },
};

// ---- Simulierter KI-Anbieter (nur für Tests!) ----
type Scripted = Partial<TurnResult> & { content: ContentBlock[] };

export const provider = {
  script: [] as Scripted[],
  requests: [] as Array<Omit<TurnRequest, "onTextDelta" | "signal">>,
  /** Wird verwendet, wenn das Skript leer ist (z. B. für Endlosschleifen-Tests). */
  fallback: null as Scripted | null,
};

export const fakeProvider: ChatProvider = {
  id: "test",
  model: "test-model",
  async streamTurn(request) {
    provider.requests.push(structuredClone({ system: request.system, messages: request.messages, tools: request.tools, toolChoice: request.toolChoice }));
    const next = provider.script.shift() ?? provider.fallback;
    if (!next) throw new Error("Kein Skript für den simulierten Anbieter");
    for (const block of next.content) if (block.type === "text") request.onTextDelta(block.text);
    const hasTools = next.content.some((b) => b.type === "tool_call");
    return {
      content: structuredClone(next.content),
      stopReason: next.stopReason ?? (hasTools ? "tool_use" : "end"),
      usage: { inputTokens: 1, outputTokens: 1 },
    };
  },
};
