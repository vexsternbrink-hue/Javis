import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { SetupMissing } from "@/components/SetupMissing";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Anmelden · Jarvis" };

// Immer pro Anfrage rendern (nutzerspezifisch, liest die Sitzung).
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (!getSupabaseConfig()) return <SetupMissing />;
  if (await getCurrentUser()) redirect("/");
  const { error } = await searchParams;
  return <LoginForm linkError={error === "link"} />;
}
