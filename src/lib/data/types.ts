// Datenbank-Zeilentypen (vom Client und Server gemeinsam genutzt).

export type Task = {
  id: string;
  title: string;
  details: string | null;
  due_date: string | null;
  done: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Note = {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export type Memory = {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type ActionStatus = "pending" | "approved" | "executed" | "failed" | "rejected" | "cancelled";

export type AgentAction = {
  id: string;
  conversation_id: string;
  message_id: number;
  tool_use_id: string;
  tool_name: string;
  input: Record<string, unknown>;
  preview: Record<string, unknown> | null;
  requires_confirmation: boolean;
  status: ActionStatus;
  result: Record<string, unknown> | null;
  created_at: string;
  resolved_at: string | null;
};
