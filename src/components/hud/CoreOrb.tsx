// Animierter Jarvis-Kern (rein dekorativ, kein Bedienelement).
export function CoreOrb({ size = 260, label = "JARVIS", sublabel = "KI-KERN" }: { size?: number; label?: string; sublabel?: string }) {
  return (
    <div className="relative mx-auto select-none" style={{ width: size, height: size }} aria-hidden="true">
      <div className="absolute inset-[18%] rounded-full bg-[radial-gradient(circle_at_50%_45%,rgba(63,208,255,0.35),rgba(13,44,69,0.35)_55%,transparent_70%)] blur-sm animate-pulse-soft" />
      <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full">
        <defs>
          <radialGradient id="orbFill" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#3fd0ff" stopOpacity="0.28" />
            <stop offset="60%" stopColor="#0d2c45" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#050b14" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g className="origin-center animate-spin-slower" style={{ transformBox: "fill-box" }}>
          <circle cx="100" cy="100" r="96" fill="none" stroke="#3fd0ff" strokeOpacity="0.18" strokeWidth="1" strokeDasharray="2 6" />
        </g>
        <g className="origin-center animate-spin-slow" style={{ transformBox: "fill-box" }}>
          <circle cx="100" cy="100" r="84" fill="none" stroke="#3fd0ff" strokeOpacity="0.45" strokeWidth="1.2" strokeDasharray="60 20 10 20" />
          <circle cx="184" cy="100" r="2.6" fill="#3fd0ff" />
        </g>
        <g className="origin-center animate-spin-reverse" style={{ transformBox: "fill-box" }}>
          <ellipse cx="100" cy="100" rx="78" ry="30" fill="none" stroke="#3fd0ff" strokeOpacity="0.35" strokeWidth="1" />
          <ellipse cx="100" cy="100" rx="30" ry="78" fill="none" stroke="#3fd0ff" strokeOpacity="0.2" strokeWidth="1" />
          <circle cx="22" cy="100" r="2" fill="#a78bfa" />
        </g>
        <circle cx="100" cy="100" r="62" fill="url(#orbFill)" stroke="#3fd0ff" strokeOpacity="0.55" strokeWidth="1" />
        {/* Längen- und Breitengrade */}
        <g fill="none" stroke="#3fd0ff" strokeOpacity="0.16" strokeWidth="0.8">
          <ellipse cx="100" cy="100" rx="62" ry="22" />
          <ellipse cx="100" cy="100" rx="62" ry="44" />
          <ellipse cx="100" cy="100" rx="22" ry="62" />
          <ellipse cx="100" cy="100" rx="44" ry="62" />
          <line x1="38" y1="100" x2="162" y2="100" />
          <line x1="100" y1="38" x2="100" y2="162" />
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="glow-text pl-[0.35em] font-semibold tracking-[0.35em] text-accent" style={{ fontSize: size * 0.105 }}>
          {label}
        </span>
        <span className="mt-1 pl-[0.4em] tracking-[0.4em] text-muted" style={{ fontSize: Math.max(9, size * 0.04) }}>
          {sublabel}
        </span>
      </div>
    </div>
  );
}
