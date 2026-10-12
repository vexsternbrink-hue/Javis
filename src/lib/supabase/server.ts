import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "./config";

/**
 * Supabase-Client für Server Components und Route Handler.
 * Er arbeitet immer mit der Sitzung des angemeldeten Nutzers – dadurch
 * greifen die Row-Level-Security-Regeln der Datenbank bei jeder Abfrage.
 */
export async function createClient() {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error("Supabase ist nicht konfiguriert (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY fehlen).");
  }
  const cookieStore = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // In Server Components dürfen keine Cookies gesetzt werden.
          // Das ist unkritisch, weil der Proxy die Sitzung auffrischt.
        }
      },
    },
  });
}

export type ServerSupabase = Awaited<ReturnType<typeof createClient>>;
