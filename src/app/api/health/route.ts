import { jsonOk } from "@/lib/http";
import { runHealthCheck } from "@/lib/health";

// Einrichtungs-Check: https://<deine-app>/api/health
// Bewusst ohne Anmeldung erreichbar, gibt aber keine geheimen Werte aus.
export async function GET() {
  return jsonOk(await runHealthCheck());
}
