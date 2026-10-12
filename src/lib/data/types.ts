// Datenbank-Zeilentypen (vom Client und Server gemeinsam genutzt).

export type Priority = "low" | "normal" | "high";

export type Task = {
  id: string;
  title: string;
  details: string | null;
  due_date: string | null;
  done: boolean;
  priority: Priority;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Note = {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
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

export type UserSettings = {
  display_name: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type Habit = {
  id: string;
  title: string;
  emoji: string | null;
  target_per_week: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

/** Gewohnheit mit den Tagen (JJJJ-MM-TT), an denen sie erledigt wurde. */
export type HabitWithLogs = Habit & { days: string[] };

export type FocusSession = {
  id: string;
  label: string | null;
  minutes: number;
  ended_at: string;
};
