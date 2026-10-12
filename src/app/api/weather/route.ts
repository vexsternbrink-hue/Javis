import { requireApiUser } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { getSettings } from "@/lib/data/settings";
import { withDataErrors } from "@/lib/route-helpers";
import { WeatherError, getForecast } from "@/lib/integrations/weather";

export const maxDuration = 15;

/** Vorhersage für den in den Einstellungen gespeicherten Ort. */
export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  return withDataErrors(async () => {
    const settings = await getSettings(auth.supabase);
    if (settings.latitude === null || settings.longitude === null) {
      return jsonOk({ configured: false });
    }
    try {
      const forecast = await getForecast(settings.latitude, settings.longitude, 5);
      return jsonOk({ configured: true, location: settings.city, forecast });
    } catch (error) {
      if (error instanceof WeatherError) return jsonError(502, error.message);
      throw error;
    }
  });
}
