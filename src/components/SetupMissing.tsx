export function SetupMissing() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md rounded-xl border border-line bg-surface p-6">
        <h1 className="text-lg font-semibold">Jarvis ist noch nicht eingerichtet</h1>
        <p className="mt-2 text-sm text-muted">
          Es fehlen die Supabase-Umgebungsvariablen <code>NEXT_PUBLIC_SUPABASE_URL</code> und{" "}
          <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>. Trage sie in <code>.env.local</code> (lokal) bzw. in den
          Vercel-Projekteinstellungen ein und starte die App neu. Details stehen in der README.
        </p>
      </div>
    </div>
  );
}
