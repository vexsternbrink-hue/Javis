import "server-only";
import type { ServerSupabase } from "../supabase/server";
import type { UserSettings } from "./types";
import { dbError } from "./errors";

const COLUMNS = "display_name, city, latitude, longitude";

export const EMPTY_SETTINGS: UserSettings = { display_name: null, city: null, latitude: null, longitude: null };

export async function getSettings(sb: ServerSupabase): Promise<UserSettings> {
  const { data, error } = await sb.from("user_settings").select(COLUMNS).maybeSingle();
  if (error) dbError("Laden der Einstellungen", error);
  return (data as UserSettings | null) ?? EMPTY_SETTINGS;
}

export async function saveSettings(sb: ServerSupabase, settings: UserSettings): Promise<UserSettings> {
  const { data, error } = await sb
    .from("user_settings")
    .upsert(settings, { onConflict: "user_id" })
    .select(COLUMNS)
    .single();
  if (error) dbError("Speichern der Einstellungen", error);
  return data as UserSettings;
}
