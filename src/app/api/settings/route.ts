import { requireApiUser } from "@/lib/auth";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/http";
import { settingsSchema } from "@/lib/validation";
import { getSettings, saveSettings } from "@/lib/data/settings";
import { withDataErrors } from "@/lib/route-helpers";
import { WeatherError, geocodeCity } from "@/lib/integrations/weather";

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  return withDataErrors(async () => jsonOk({ settings: await getSettings(auth.supabase) }));
}

export async function PUT(request: Request) {
  const auth = await requireApiUser(request);
  if (auth instanceof Response) return auth;
  const body = await parseJsonBody(request, settingsSchema);
  if (body instanceof Response) return body;

  return withDataErrors(async () => {
    const current = await getSettings(auth.supabase);
    const displayName = body.display_name?.trim() || null;
    const cityInput = body.city?.trim() || null;

    let place = { city: current.city, latitude: current.latitude, longitude: current.longitude };
    if (!cityInput) {
      place = { city: null, latitude: null, longitude: null };
    } else if (cityInput !== current.city || current.latitude === null) {
      // Ort über Open-Meteo auflösen (nur der eingegebene Ortsname wird übertragen).
      try {
        const hit = await geocodeCity(cityInput);
        if (!hit) return jsonError(400, `Den Ort „${cityInput}“ habe ich nicht gefunden. Versuch es z. B. mit „Berlin“ oder einer PLZ-Stadt.`);
        place = { city: hit.label.slice(0, 120), latitude: hit.latitude, longitude: hit.longitude };
      } catch (error) {
        if (error instanceof WeatherError) return jsonError(502, error.message);
        throw error;
      }
    }

    const settings = await saveSettings(auth.supabase, { display_name: displayName, ...place });
    return jsonOk({ settings });
  });
}
