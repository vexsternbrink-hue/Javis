"use client";

import { useEffect, useState } from "react";

/** Live-Uhr in der Zeitzone des Geräts. */
export function Clock({ className = "" }: { className?: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
  if (!now) return <div className={className} aria-hidden="true">&nbsp;</div>;
  return (
    <div className={className}>
      <div className="text-xs text-muted">
        {now.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
      </div>
      <div className="glow-text font-mono text-2xl font-semibold tabular-nums tracking-wider text-accent">
        {now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </div>
    </div>
  );
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return "Gute Nacht";
  if (h < 11) return "Guten Morgen";
  if (h < 18) return "Guten Tag";
  return "Guten Abend";
}
