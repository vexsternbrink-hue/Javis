// Antworttypen der API (für den Browser).
import type { HabitWithLogs, Task } from "@/lib/data/types";

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
  /** Zeitpunkte erledigter Aufgaben der letzten ~14 Tage */
  completedAt: string[];
  habits: HabitWithLogs[];
  focusSessions: Array<{ minutes: number; ended_at: string }>;
  displayName: string | null;
  weatherConfigured: boolean;
  status: SystemStatus;
};

export type WeatherDay = {
  date: string;
  code: number;
  text: string;
  icon: string;
  max: number;
  min: number;
  precipitationProbability: number | null;
  sunrise: string | null;
  sunset: string | null;
};

export type WeatherResponse =
  | { configured: false }
  | {
      configured: true;
      location: string | null;
      forecast: {
        timezone: string;
        current: {
          time: string;
          temperature: number;
          apparentTemperature: number;
          humidity: number;
          windSpeed: number;
          code: number;
          text: string;
          icon: string;
          isDay: boolean;
        };
        daily: WeatherDay[];
      };
    };

export type SearchHit = {
  kind: "task" | "note" | "memory" | "conversation" | "habit";
  id: string;
  title: string;
  excerpt: string | null;
  href: string;
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
