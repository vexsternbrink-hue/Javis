"use client";

import { useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { LogoMark } from "@/components/icons";
import { Button, ErrorBanner, inputClass } from "@/components/ui";

export function LoginForm({ linkError }: { linkError: boolean }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(
    linkError ? "Der Anmeldelink ist ungültig oder abgelaufen. Fordere bitte einen neuen an." : null,
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setState("sending");
    try {
      await api("/api/auth/magic-link", { method: "POST", json: { email } });
      setState("sent");
    } catch (e) {
      setError(errorMessage(e));
      setState("idle");
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <LogoMark className="mx-auto text-accent" width={44} height={44} />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Jarvis</h1>
          <p className="mt-1 text-sm text-muted">Dein persönlicher KI-Assistent</p>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-5">
          {state === "sent" ? (
            <div className="text-center">
              <p className="font-medium">E-Mail ist unterwegs ✉️</p>
              <p className="mt-2 text-sm text-muted">
                Öffne den Link in der E-Mail an <span className="text-text">{email}</span> – am besten auf diesem Gerät und
                in diesem Browser. Schau notfalls im Spam-Ordner nach.
              </p>
              <Button className="mt-4" variant="ghost" onClick={() => setState("idle")}>
                Andere Adresse verwenden
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
                  E-Mail-Adresse
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="du@example.com"
                />
              </div>
              {error && <ErrorBanner message={error} />}
              <Button type="submit" variant="primary" className="w-full" disabled={state === "sending" || !email}>
                {state === "sending" ? "Wird gesendet …" : "Anmeldelink senden"}
              </Button>
              <p className="text-center text-xs text-muted">Kein Passwort nötig – du bekommst einen Link per E-Mail.</p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
