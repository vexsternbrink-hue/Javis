// Reine Hilfsfunktionen für Gewohnheiten (Browser und Server).
// Tage sind immer lokale Kalendertage im Format JJJJ-MM-TT.

export function addDays(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + delta));
  return date.toISOString().slice(0, 10);
}

/** Montag der Woche, in der `day` liegt. */
export function weekStart(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sonntag
  return addDays(day, -((weekday + 6) % 7));
}

/**
 * Aktuelle Serie in Tagen: zählt rückwärts ab heute. Ist heute noch nicht
 * erledigt, zählt die Serie ab gestern (der Tag ist ja noch nicht vorbei).
 */
export function currentStreak(days: Iterable<string>, today: string): number {
  const set = new Set(days);
  let cursor = set.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (set.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Längste Serie aufeinanderfolgender Tage. */
export function longestStreak(days: Iterable<string>): number {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of sorted) {
    run = prev !== null && addDays(prev, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    prev = day;
  }
  return best;
}

/** Wie oft in der aktuellen Woche (Mo–So) erledigt. */
export function countThisWeek(days: Iterable<string>, today: string): number {
  const start = weekStart(today);
  let count = 0;
  for (const day of new Set(days)) if (day >= start && day <= today) count++;
  return count;
}

/** Die letzten `n` Tage bis einschließlich heute (älteste zuerst). */
export function lastDays(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - n + 1));
}
