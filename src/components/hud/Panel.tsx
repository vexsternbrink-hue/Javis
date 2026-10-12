import Link from "next/link";
import type { ReactNode } from "react";

export function Panel({
  title,
  icon,
  action,
  className = "",
  children,
}: {
  title: string;
  icon?: ReactNode;
  action?: { href: string; label: string };
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`hud-panel flex flex-col p-4 ${className}`}>
      <header className="mb-3 flex items-center gap-2">
        {icon && <span className="text-accent">{icon}</span>}
        <h2 className="hud-title min-w-0 truncate">{title}</h2>
        {action && (
          <Link href={action.href} className="ml-auto shrink-0 whitespace-nowrap text-xs text-muted hover:text-accent">
            {action.label} ›
          </Link>
        )}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

export function PanelMessage({ children }: { children: ReactNode }) {
  return <p className="py-3 text-sm text-muted">{children}</p>;
}
