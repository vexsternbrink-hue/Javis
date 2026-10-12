import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Ziel des Magic-Links aus der E-Mail. Unterstützt beide Varianten von Supabase:
// ?code=... (Standard, PKCE) und ?token_hash=...&type=... (angepasste E-Mail-Vorlage).
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const redirectTo = (path: string) => {
    const target = url.clone();
    target.pathname = path;
    target.search = "";
    return target;
  };

  const supabase = await createClient();
  let ok = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  }

  if (ok) return NextResponse.redirect(redirectTo("/chat"));
  const failed = redirectTo("/login");
  failed.searchParams.set("error", "link");
  return NextResponse.redirect(failed);
}
