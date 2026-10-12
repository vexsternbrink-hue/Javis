import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getCurrentUser, userIsAllowed } from "@/lib/auth";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { SetupMissing } from "@/components/SetupMissing";

// Immer pro Anfrage rendern (nutzerspezifisch, liest die Sitzung).
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!getSupabaseConfig()) return <SetupMissing />;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!userIsAllowed(user)) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="max-w-sm rounded-xl border border-line bg-surface p-6 text-center">
          <h1 className="text-lg font-semibold">Kein Zugriff</h1>
          <p className="mt-2 text-sm text-muted">
            Das Konto {user.email} ist für Jarvis nicht freigeschaltet. Trage die Adresse in ALLOWED_EMAILS ein.
          </p>
          <form action="/auth/signout" method="post" className="mt-4">
            <button type="submit" className="text-sm text-accent underline underline-offset-2">
              Abmelden
            </button>
          </form>
        </div>
      </div>
    );
  }
  return <AppShell email={user.email ?? ""}>{children}</AppShell>;
}
