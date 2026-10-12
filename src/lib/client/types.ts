// Antworttypen der API (für den Browser).
import type { Task } from "@/lib/data/types";

export type ServiceState = "configured" | "missing" | "not_owner" | "ok";

export type SystemStatus = {
  ai: { provider: string; model: string; configured: boolean };
  database: "ok";
  mail: ServiceState;
  calendar: ServiceState;
};

export type DashboardData = {
  tasks: Task[];
  openTaskCount: number;
  recentConversations: Array<{ id: string; title: string; updated_at: string }>;
  noteCount: number;
  memoryCount: number;
  status: SystemStatus;
};

export type MailSummary = {
  uid: number;
  from: string;
  fromAddress: string | null;
  subject: string;
  date: string | null;
  unread: boolean;
};

export type MailDetail = MailSummary & { to: string; text: string; truncated: boolean };

export type CalendarEvent = {
  id: string;
  calendar: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  notes: string | null;
};
