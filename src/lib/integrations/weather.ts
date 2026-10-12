import "server-only";
import { z } from "zod";

// Wetter über Open-Meteo (https://open-meteo.com): kostenlos für private
// Nutzung, kein API-Schlüssel, Daten unter CC BY 4.0.
// Es werden ausschließlich diese zwei festen Adressen abgefragt – weder die
// KI noch Nutzereingaben können eine andere URL bestimmen.
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const TIMEOUT_MS = 8000;

export class WeatherError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeatherError";
  }
}

let fetchImpl: typeof fetch = (...args) => fetch(...args);
/** Nur für Tests. */
export function __setWeatherFetchForTests(impl: typeof fetch | null) {
  fetchImpl = impl ?? ((...args) => fetch(...args));
}

async function getJson(url: URL): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: "application/json" } });
  } catch {
    throw new WeatherError("Der Wetterdienst ist gerade nicht erreichbar.");
  }
  if (!response.ok) throw new WeatherError(`Der Wetterdienst hat mit Fehler ${response.status} geantwortet.`);
  try {
    return await response.json();
  } catch {
    throw new WeatherError("Ungültige Antwort vom Wetterdienst.");
  }
}

// ---------------------------------------------------------------------------
// Ortssuche
// ---------------------------------------------------------------------------

export type Place = { name: string; label: string; latitude: number; longitude: number; timezone: string | null };

const geocodingSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        country: z.string().optional(),
        admin1: z.string().optional(),
        timezone: z.string().optional(),
      }),
    )
    .optional(),
});

export async function geocodeCity(query: string): Promise<Place | null> {
  const name = query.replace(/\s+/g, " ").trim().slice(0, 100);
  if (name.length < 2) return null;
  const url = new URL(GEOCODING_URL);
  url.searchParams.set("name", name);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "de");
  url.searchParams.set("format", "json");
  const parsed = geocodingSchema.safeParse(await getJson(url));
  if (!parsed.success) throw new WeatherError("Ungültige Antwort vom Wetterdienst.");
  const hit = parsed.data.results?.[0];
  if (!hit) return null;
  const extra = [hit.admin1 && hit.admin1 !== hit.name ? hit.admin1 : null, hit.country].filter(Boolean).join(", ");
  return {
    name: hit.name,
    label: extra ? `${hit.name}, ${extra}` : hit.name,
    latitude: hit.latitude,
    longitude: hit.longitude,
    timezone: hit.timezone ?? null,
  };
}

// ---------------------------------------------------------------------------
// Vorhersage
// ---------------------------------------------------------------------------

/** WMO-Wettercodes → deutsche Beschreibung + Symbol. */
const WEATHER_CODES: Record<number, [string, string]> = {
  0: ["Klar", "☀️"],
  1: ["Überwiegend klar", "🌤️"],
  2: ["Teilweise bewölkt", "⛅"],
  3: ["Bedeckt", "☁️"],
  45: ["Nebel", "🌫️"],
  48: ["Nebel mit Reif", "🌫️"],
  51: ["Leichter Nieselregen", "🌦️"],
  53: ["Nieselregen", "🌦️"],
  55: ["Starker Nieselregen", "🌧️"],
  56: ["Gefrierender Nieselregen", "🌧️"],
  57: ["Starker gefrierender Nieselregen", "🌧️"],
  61: ["Leichter Regen", "🌦️"],
  63: ["Regen", "🌧️"],
  65: ["Starker Regen", "🌧️"],
  66: ["Gefrierender Regen", "🌧️"],
  67: ["Starker gefrierender Regen", "🌧️"],
  71: ["Leichter Schneefall", "🌨️"],
  73: ["Schneefall", "🌨️"],
  75: ["Starker Schneefall", "❄️"],
  77: ["Schneegriesel", "🌨️"],
  80: ["Leichte Regenschauer", "🌦️"],
  81: ["Regenschauer", "🌧️"],
  82: ["Heftige Regenschauer", "⛈️"],
  85: ["Leichte Schneeschauer", "🌨️"],
  86: ["Starke Schneeschauer", "❄️"],
  95: ["Gewitter", "⛈️"],
  96: ["Gewitter mit Hagel", "⛈️"],
  99: ["Schweres Gewitter mit Hagel", "⛈️"],
};

export function describeWeatherCode(code: number, isDay = true): { text: string; icon: string } {
  const entry = WEATHER_CODES[code];
  if (!entry) return { text: "Unbekannt", icon: "🌡️" };
  const icon = !isDay && (code === 0 || code === 1) ? "🌙" : entry[1];
  return { text: entry[0], icon };
}

export type Forecast = {
  timezone: string;
  current: {
    time: string;
    temperature: number;
    apparentTemperature: number;
    humidity: number;
    windSpeed: number;
    code: number;
    text: string;
    icon: string;
    isDay: boolean;
  };
  daily: Array<{
    date: string;
    code: number;
    text: string;
    icon: string;
    max: number;
    min: number;
    precipitationProbability: number | null;
    sunrise: string | null;
    sunset: string | null;
  }>;
};

const num = z.number();
const forecastSchema = z.object({
  timezone: z.string(),
  current: z.object({
    time: z.string(),
    temperature_2m: num,
    apparent_temperature: num,
    relative_humidity_2m: num,
    weather_code: num,
    wind_speed_10m: num,
    is_day: num,
  }),
  daily: z.object({
    time: z.array(z.string()),
    weather_code: z.array(num.nullable()),
    temperature_2m_max: z.array(num.nullable()),
    temperature_2m_min: z.array(num.nullable()),
    precipitation_probability_max: z.array(num.nullable()).optional(),
    sunrise: z.array(z.string().nullable()).optional(),
    sunset: z.array(z.string().nullable()).optional(),
  }),
});

export function parseForecast(raw: unknown): Forecast {
  const parsed = forecastSchema.safeParse(raw);
  if (!parsed.success) throw new WeatherError("Ungültige Antwort vom Wetterdienst.");
  const { current: c, daily: d, timezone } = parsed.data;
  const isDay = c.is_day === 1;
  const now = describeWeatherCode(c.weather_code, isDay);
  const daily: Forecast["daily"] = [];
  d.time.forEach((date, i) => {
    const code = d.weather_code[i];
    const max = d.temperature_2m_max[i];
    const min = d.temperature_2m_min[i];
    if (code == null || max == null || min == null) return;
    const info = describeWeatherCode(code);
    daily.push({
      date,
      code,
      text: info.text,
      icon: info.icon,
      max: Math.round(max),
      min: Math.round(min),
      precipitationProbability: d.precipitation_probability_max?.[i] ?? null,
      sunrise: d.sunrise?.[i] ?? null,
      sunset: d.sunset?.[i] ?? null,
    });
  });
  return {
    timezone,
    current: {
      time: c.time,
      temperature: Math.round(c.temperature_2m * 10) / 10,
      apparentTemperature: Math.round(c.apparent_temperature * 10) / 10,
      humidity: Math.round(c.relative_humidity_2m),
      windSpeed: Math.round(c.wind_speed_10m),
      code: c.weather_code,
      text: now.text,
      icon: now.icon,
      isDay,
    },
    daily,
  };
}

export async function getForecast(latitude: number, longitude: number, days = 5): Promise<Forecast> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new WeatherError("Ungültiger Ort.");
  }
  const url = new URL(FORECAST_URL);
  url.searchParams.set("latitude", latitude.toFixed(4));
  url.searchParams.set("longitude", longitude.toFixed(4));
  url.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day",
  );
  url.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset",
  );
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", String(Math.min(Math.max(days, 1), 7)));
  return parseForecast(await getJson(url));
}
