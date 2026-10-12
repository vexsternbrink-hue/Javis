import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "./config";

const PUBLIC_PATHS = ["/login", "/auth/confirm", "/api/auth/magic-link"];

/**
 * Frischt bei jeder Anfrage die Supabase-Sitzung auf (Cookies) und leitet
 * nicht angemeldete Besucher von geschützten Seiten zur Anmeldung um.
 * API-Routen prüfen die Anmeldung zusätzlich selbst.
 */
export async function updateSession(request: NextRequest) {
  // Landet ein Anmeldelink nicht auf /auth/confirm (z. B. weil Supabase auf die
  // Site URL umleitet), den Code dorthin weiterreichen.
  const params = request.nextUrl.searchParams;
  if (
    request.nextUrl.pathname !== "/auth/confirm" &&
    !request.nextUrl.pathname.startsWith("/api/") &&
    (params.has("code") || (params.has("token_hash") && params.has("type")))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/confirm";
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });
  const config = getSupabaseConfig();
  if (!config) return response;

  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Wichtig: getUser() prüft das Token beim Supabase-Auth-Server.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));
  if (!user && !isPublic && !path.startsWith("/api/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}
