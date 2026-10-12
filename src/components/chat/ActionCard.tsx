"use client";

import type { ClientAction } from "@/lib/agent/events";
import { FIELD_LABELS } from "@/lib/agent/tool-meta";
import { formatDate } from "@/lib/client/dates";
import { Button } from "../ui";

const STATUS: Record<ClientAction["status"], { text: string; className: string }> = {
  pending: { text: "Wartet auf deine Bestätigung", className: "text-warn border-warn/40 bg-warn/10" },
  approved: { text: "Wird ausgeführt …", className: "text-accent border-accent/40 bg-accent-soft" },
  executed: { text: "Ausgeführt", className: "text-success border-success/40 bg-success/10" },
  failed: { text: "Fehlgeschlagen", className: "text-danger border-danger/40 bg-danger-soft" },
  rejected: { text: "Abgelehnt – nicht ausgeführt", className: "text-muted border-line bg-surface-2" },
  cancelled: { text: "Verworfen – nicht ausgeführt", className: "text-muted border-line bg-surface-2" },
};

function formatValue(key: string, value: unknown): string {
  if (value === null) return key === "due_date" ? "Datum entfernen" : "leeren";
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (key === "due_date" && typeof value === "string") return formatDate(value);
  if (key === "status") return value === "open" ? "offen" : value === "done" ? "erledigt" : "alle";
  if (typeof value === "string") return value || "(leer)";
  return JSON.stringify(value);
}

export function ActionCard({
  action,
  busy,
  onDecide,
}: {
  action: ClientAction;
  busy: boolean;
  onDecide?: (decision: "approve" | "reject") => void;
}) {
  const status = STATUS[action.status];

  if (action.kind === "read") {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-muted">
        <span className="font-medium text-text/90">{action.label}</span>
        <span aria-hidden="true">·</span>
        <span className={action.status === "failed" ? "text-danger" : ""}>
          {action.status === "failed" ? action.error ?? "Fehlgeschlagen" : action.summary ?? status.text}
        </span>
      </div>
    );
  }

  const fields = Object.entries(action.input).filter(([key, value]) => key !== "id" && value !== undefined);
  const target = action.preview && typeof action.preview.target === "object" ? (action.preview.target as Record<string, unknown>) : null;

  return (
    <div className="rounded-xl border border-line bg-surface p-3.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-text">{action.label}</span>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs ${status.className}`}>{status.text}</span>
      </div>

      {target && typeof target.title === "string" && (
        <p className="mt-2 text-muted">
          Betrifft: <span className="text-text">„{target.title}“</span>
        </p>
      )}

      {fields.length > 0 && (
        <dl className="mt-2 space-y-1.5">
          {fields.map(([key, value]) => (
            <div key={key} className="grid grid-cols-[6.5rem_1fr] gap-2">
              <dt className="text-muted">{FIELD_LABELS[key] ?? key}</dt>
              <dd className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-text">{formatValue(key, value)}</dd>
            </div>
          ))}
        </dl>
      )}

      {action.status === "executed" && action.summary && <p className="mt-2 text-success">✓ {action.summary}</p>}
      {action.status === "failed" && <p className="mt-2 text-danger">{action.error ?? "Die Aktion ist fehlgeschlagen."}</p>}

      {action.status === "pending" && onDecide && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" disabled={busy} onClick={() => onDecide("approve")}>
            Ausführen
          </Button>
          <Button disabled={busy} onClick={() => onDecide("reject")}>
            Ablehnen
          </Button>
        </div>
      )}
    </div>
  );
}
