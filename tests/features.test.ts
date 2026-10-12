import { afterEach, describe, expect, it } from "vitest";
import { addDays, countThisWeek, currentStreak, lastDays, longestStreak, weekStart } from "@/lib/habits";
import {
  WeatherError,
  __setWeatherFetchForTests,
  describeWeatherCode,
  geocodeCity,
  getForecast,
  parseForecast,
} from "@/lib/integrations/weather";
import { splitForSpeech, toSpeakableText } from "@/lib/voice/speech";
import { FOCUS_DEFAULT, focusActions, focusStore, formatClock, remainingSeconds } from "@/lib/client/focus-store";
import {
  focusCreateSchema,
  habitCreateSchema,
  habitLogSchema,
  habitUpdateSchema,
  noteUpdateSchema,
  settingsSchema,
  taskCreateSchema,
  taskUpdateSchema,
} from "@/lib/validation";

describe("Gewohnheiten: Serien und Wochen", () => {
  it("rechnet Tage über Monats- und Jahresgrenzen", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("findet den Montag der Woche", () => {
    expect(weekStart("2026-10-12")).toBe("2026-10-12"); // Montag
    expect(weekStart("2026-10-18")).toBe("2026-10-12"); // Sonntag
    expect(weekStart("2026-10-14")).toBe("2026-10-12");
  });

  it("zählt die aktuelle Serie – heute offen bricht die Serie nicht", () => {
    const days = ["2026-10-09", "2026-10-10", "2026-10-11"];
    expect(currentStreak(days, "2026-10-12")).toBe(3);
    expect(currentStreak([...days, "2026-10-12"], "2026-10-12")).toBe(4);
    expect(currentStreak(["2026-10-09", "2026-10-10"], "2026-10-12")).toBe(0);
    expect(currentStreak([], "2026-10-12")).toBe(0);
  });

  it("findet die längste Serie und ignoriert Duplikate", () => {
    expect(longestStreak(["2026-10-01", "2026-10-02", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07"])).toBe(3);
    expect(longestStreak([])).toBe(0);
  });

  it("zählt diese Woche ab Montag", () => {
    expect(countThisWeek(["2026-10-11", "2026-10-12", "2026-10-13"], "2026-10-13")).toBe(2);
  });

  it("liefert die letzten n Tage in Reihenfolge", () => {
    expect(lastDays("2026-10-12", 3)).toEqual(["2026-10-10", "2026-10-11", "2026-10-12"]);
  });
});

const forecastPayload = {
  latitude: 52.52,
  longitude: 13.41,
  timezone: "Europe/Berlin",
  current: {
    time: "2026-10-12T14:15",
    interval: 900,
    temperature_2m: 13.26,
    apparent_temperature: 11.04,
    relative_humidity_2m: 71.4,
    weather_code: 61,
    wind_speed_10m: 12.6,
    is_day: 1,
  },
  daily: {
    time: ["2026-10-12", "2026-10-13", "2026-10-14"],
    weather_code: [61, 0, null],
    temperature_2m_max: [14.4, 16.6, 12],
    temperature_2m_min: [8.2, 7.5, 6],
    precipitation_probability_max: [80, 5, 10],
    sunrise: ["2026-10-12T07:22", "2026-10-13T07:24", "2026-10-14T07:26"],
    sunset: ["2026-10-12T18:20", "2026-10-13T18:18", "2026-10-14T18:16"],
  },
};

describe("Wetter (Open-Meteo)", () => {
  afterEach(() => __setWeatherFetchForTests(null));

  it("übersetzt WMO-Codes, nachts mit Mond", () => {
    expect(describeWeatherCode(0)).toEqual({ text: "Klar", icon: "☀️" });
    expect(describeWeatherCode(0, false).icon).toBe("🌙");
    expect(describeWeatherCode(95).text).toBe("Gewitter");
    expect(describeWeatherCode(1234).text).toBe("Unbekannt");
  });

  it("liest die Vorhersage und überspringt unvollständige Tage", () => {
    const f = parseForecast(forecastPayload);
    expect(f.current).toMatchObject({ temperature: 13.3, apparentTemperature: 11, humidity: 71, windSpeed: 13, text: "Leichter Regen", isDay: true });
    expect(f.daily).toHaveLength(2);
    expect(f.daily[0]).toMatchObject({ date: "2026-10-12", max: 14, min: 8, precipitationProbability: 80 });
    expect(f.daily[1].text).toBe("Klar");
  });

  it("lehnt kaputte Antworten ab", () => {
    expect(() => parseForecast({ foo: 1 })).toThrow(WeatherError);
  });

  it("fragt nur die feste Open-Meteo-Adresse ab", async () => {
    const urls: string[] = [];
    __setWeatherFetchForTests(async (input) => {
      urls.push(String(input));
      return new Response(JSON.stringify(forecastPayload), { status: 200 });
    });
    const f = await getForecast(52.52, 13.41, 3);
    expect(f.timezone).toBe("Europe/Berlin");
    const url = new URL(urls[0]);
    expect(url.origin).toBe("https://api.open-meteo.com");
    expect(url.searchParams.get("forecast_days")).toBe("3");
    expect(url.searchParams.get("latitude")).toBe("52.5200");
    await expect(getForecast(200, 0)).rejects.toThrow(WeatherError);
  });

  it("findet Orte und meldet fehlende Treffer als null", async () => {
    __setWeatherFetchForTests(async (input) => {
      const url = new URL(String(input));
      expect(url.origin).toBe("https://geocoding-api.open-meteo.com");
      if (url.searchParams.get("name") === "Nirgendwo") return new Response(JSON.stringify({ generationtime_ms: 1 }));
      return new Response(
        JSON.stringify({
          results: [{ name: "München", latitude: 48.137, longitude: 11.575, country: "Deutschland", admin1: "Bayern", timezone: "Europe/Berlin" }],
        }),
      );
    });
    expect(await geocodeCity("München")).toEqual({
      name: "München",
      label: "München, Bayern, Deutschland",
      latitude: 48.137,
      longitude: 11.575,
      timezone: "Europe/Berlin",
    });
    expect(await geocodeCity("Nirgendwo")).toBeNull();
    expect(await geocodeCity(" ")).toBeNull();
  });

  it("meldet Netzwerk- und HTTP-Fehler verständlich", async () => {
    __setWeatherFetchForTests(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(geocodeCity("Berlin")).rejects.toThrow("nicht erreichbar");
    __setWeatherFetchForTests(async () => new Response("nope", { status: 429 }));
    await expect(getForecast(1, 1)).rejects.toThrow("429");
  });
});

describe("Vorlesen", () => {
  it("entfernt Markdown für eine natürliche Aussprache", () => {
    const text = toSpeakableText("# Titel\n\n**Fett** und [Link](https://x.de)\n\n- Punkt eins\n- `code`\n\n```js\nlet a\n```");
    expect(text).not.toMatch(/[#*`[\]]/);
    expect(text).toContain("Fett und Link");
    expect(text).toContain("Punkt eins");
    expect(text).toContain("Codeblock ausgelassen");
  });

  it("teilt lange Texte an Satzgrenzen", () => {
    const sentence = "Das ist ein Satz mit einigen Wörtern. ";
    const chunks = splitForSpeech(sentence.repeat(20), 100);
    expect(chunks.length).toBeGreaterThan(5);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(100);
    expect(chunks.join(" ").replace(/\s+/g, " ")).toBe(sentence.repeat(20).trim().replace(/\s+/g, " "));
    expect(splitForSpeech("x".repeat(250), 100)).toHaveLength(3);
  });
});

describe("Fokus-Timer", () => {
  it("läuft über den Endzeitpunkt, pausiert und endet genau einmal", () => {
    focusActions.configure("focus", 25);
    expect(focusStore.getSnapshot().status).toBe("idle");
    focusActions.start(1_000_000);
    const running = focusStore.getSnapshot();
    expect(running.status).toBe("running");
    expect(remainingSeconds(running, 1_000_000 + 60_000)).toBe(24 * 60);

    focusActions.pause(1_000_000 + 60_000);
    expect(focusStore.getSnapshot()).toMatchObject({ status: "paused", remainingSec: 24 * 60 });
    focusActions.start(2_000_000);
    expect(focusActions.finishIfElapsed(2_000_000 + 10_000)).toBeNull();

    const done = focusActions.finishIfElapsed(2_000_000 + 24 * 60_000);
    expect(done).toMatchObject({ mode: "focus", minutes: 25 });
    // Danach Pause vorbereitet, und kein zweites Ende
    expect(focusStore.getSnapshot()).toMatchObject({ mode: "break", status: "idle", totalSec: 300 });
    expect(focusActions.finishIfElapsed(9_999_999_999)).toBeNull();
  });

  it("begrenzt die Dauer und setzt zurück", () => {
    focusActions.configure("focus", 999);
    expect(focusStore.getSnapshot().totalSec).toBe(180 * 60);
    focusActions.start(0);
    focusActions.reset();
    expect(focusStore.getSnapshot()).toMatchObject({ status: "idle", remainingSec: 180 * 60, endAt: null });
    expect(focusStore.getServerSnapshot()).toBe(FOCUS_DEFAULT);
  });

  it("formatiert die Uhr", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(25 * 60)).toBe("25:00");
    expect(formatClock(3725)).toBe("1:02:05");
  });
});

describe("Validierung neuer Eingaben", () => {
  it("Aufgaben-Priorität", () => {
    expect(taskCreateSchema.parse({ title: "A" }).priority).toBeUndefined();
    expect(taskCreateSchema.safeParse({ title: "A", priority: "urgent" }).success).toBe(false);
    expect(taskUpdateSchema.safeParse({ priority: "high" }).success).toBe(true);
  });

  it("Notizen anheften", () => {
    expect(noteUpdateSchema.safeParse({ pinned: true }).success).toBe(true);
    expect(noteUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("Einstellungen", () => {
    expect(settingsSchema.parse({ display_name: "  Vex ", city: "Berlin" })).toEqual({ display_name: "Vex", city: "Berlin" });
    expect(settingsSchema.safeParse({ display_name: "x".repeat(61) }).success).toBe(false);
  });

  it("Gewohnheiten und Fokus", () => {
    expect(habitCreateSchema.parse({ title: "Lesen" }).target_per_week).toBe(7);
    expect(habitCreateSchema.safeParse({ title: " " }).success).toBe(false);
    expect(habitUpdateSchema.safeParse({}).success).toBe(false);
    expect(habitUpdateSchema.safeParse({ archived: true }).success).toBe(true);
    expect(habitLogSchema.safeParse({ day: "2026-02-30", done: true }).success).toBe(false);
    expect(focusCreateSchema.safeParse({ minutes: 0 }).success).toBe(false);
    expect(focusCreateSchema.safeParse({ minutes: 25, label: "Mathe" }).success).toBe(true);
    expect(focusCreateSchema.safeParse({ minutes: 181 }).success).toBe(false);
  });
});
