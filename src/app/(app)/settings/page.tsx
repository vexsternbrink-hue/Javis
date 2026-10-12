import { SettingsView } from "@/components/settings/SettingsView";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Einstellungen · Jarvis" };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  return <SettingsView email={user?.email ?? ""} />;
}
