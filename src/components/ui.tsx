import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent-strong text-white hover:bg-accent disabled:bg-accent-soft disabled:text-muted",
  secondary: "border border-line bg-surface-2 text-text hover:border-accent/60 disabled:opacity-50",
  ghost: "text-muted hover:bg-surface-2 hover:text-text disabled:opacity-50",
  danger: "border border-danger/40 bg-danger-soft text-danger hover:border-danger disabled:opacity-50",
};

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function Spinner({ label = "Lädt …" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted" role="status">
      <span className="size-4 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label}
    </span>
  );
}

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-danger/40 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="text-danger/80 hover:text-danger" aria-label="Meldung schließen">
          ✕
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-5 py-10 text-center">
      <p className="font-medium text-text">{title}</p>
      {children && <div className="mt-1.5 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {children}
    </header>
  );
}

export const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-[15px] text-text placeholder:text-muted/70 focus:border-accent focus:outline-none";
