# Jarvis – dein persönlicher KI-Assistent

Jarvis ist eine private Web-App mit KI-Chat, gespeicherten Gesprächen, dauerhaften Erinnerungen sowie Aufgaben und Notizen. Jarvis kann deine Aufgaben und Notizen auch direkt aus dem Chat heraus lesen und – **nach deiner Bestätigung** – anlegen, ändern oder löschen.

- **Oberfläche:** Deutsch, ruhiger Dark Mode, fürs Smartphone optimiert
- **Technik:** Next.js 16 (App Router, TypeScript), Tailwind CSS 4, Supabase (Login + Datenbank), KI wahlweise **Google Gemini** (kostenloses Kontingent) oder **Anthropic Claude** (kostenpflichtig), jeweils mit Streaming
- **Hosting:** Vercel (keine zusätzliche, dauerhaft laufende Server-Anwendung)

---

## Inhalt

1. [Was Jarvis kann](#was-jarvis-kann)
2. [Voraussetzungen](#voraussetzungen)
3. [Einrichtung Schritt für Schritt](#einrichtung-schritt-für-schritt)
4. [Lokal starten](#lokal-starten)
5. [Auf Vercel veröffentlichen](#auf-vercel-veröffentlichen)
6. [Umgebungsvariablen](#umgebungsvariablen)
7. [Kosten – ehrlich erklärt](#kosten--ehrlich-erklärt)
8. [Sicherheit](#sicherheit)
9. [Tests und Prüfungen](#tests-und-prüfungen)
10. [Projektaufbau](#projektaufbau)
11. [Bekannte Einschränkungen](#bekannte-einschränkungen)
12. [Sinnvolle nächste Erweiterungen](#sinnvolle-nächste-erweiterungen)

---

## Was Jarvis kann

| Bereich | Funktionen |
|---|---|
| **Chat** | Antworten werden live gestreamt, Markdown-Darstellung (Listen, Tabellen, Code), Chats bleiben gespeichert, neue Chats anlegen, alte öffnen und löschen, Antwort stoppen |
| **Erinnerungen** | Eigener Bereich für dauerhafte Infos (Name, Interessen, Antwortstil). Hinzufügen, bearbeiten, löschen. Jarvis berücksichtigt sie in jedem Chat. Aus dem Chat heraus wird nur nach deiner Bestätigung etwas gespeichert. |
| **Aufgaben** | Anlegen, bearbeiten, abhaken, löschen, optionales Fälligkeitsdatum (mit Hinweis „heute“/„überfällig“) |
| **Notizen** | Anlegen, bearbeiten, löschen, durchsuchen |
| **Agent-Funktionen** | Jarvis nutzt serverseitige Tools: Aufgaben auflisten, Notizen suchen/lesen (automatisch) sowie Aufgaben/Notizen anlegen, ändern, löschen und Erinnerungen speichern (**nur nach Klick auf „Ausführen“**). Das Ergebnis wird im Chat angezeigt. |
| **Anmeldung** | E-Mail-Magic-Link über Supabase Auth, nur freigeschaltete E-Mail-Adressen |

**Chatverlauf ≠ Erinnerungen:** Ein Chat gilt nur für sich. Erinnerungen kennt Jarvis in jedem Chat.

---

## Voraussetzungen

- Ein **GitHub**-Konto (hast du) – dort liegt der Code.
- Ein **Vercel**-Konto (hast du) – dort läuft die App.
- Ein **Supabase**-Konto (kostenlos, [supabase.com](https://supabase.com)) – Login und Datenbank.
- Einen **KI-Schlüssel**, entweder
  - **Google Gemini** über [Google AI Studio](https://aistudio.google.com/apikey) – **kostenloses Kontingent, keine Kreditkarte** (empfohlen), oder
  - **Anthropic** ([console.anthropic.com](https://console.anthropic.com)) – ⚠️ kostet Geld, siehe [Kosten](#kosten--ehrlich-erklärt).
- Nur zum lokalen Entwickeln: [Node.js](https://nodejs.org) Version 20.9 oder neuer (empfohlen: aktuelle LTS-Version).

> 🔐 **Geheime Schlüssel gehören nie in den Chat, in GitHub oder in Screenshots.** Du trägst sie nur in `.env.local` (lokal) oder in Vercel unter „Environment Variables“ ein.

---

## Einrichtung Schritt für Schritt

### 1. Supabase-Projekt anlegen

1. Auf [supabase.com](https://supabase.com) anmelden → **New project**.
2. Name z. B. `jarvis`, ein sicheres Datenbank-Passwort wählen (gut aufbewahren), Region **Frankfurt (eu-central-1)**, Plan **Free**.
3. Warten, bis das Projekt bereit ist (ca. 1–2 Minuten).

### 2. Datenbank einrichten (Migration ausführen)

1. Im Supabase-Projekt links auf **SQL Editor** → **New query**.
2. Den kompletten Inhalt der Datei [`supabase/migrations/20261012000000_init.sql`](supabase/migrations/20261012000000_init.sql) hineinkopieren.
3. Auf **Run** klicken. Es sollte „Success. No rows returned“ erscheinen.

Damit werden alle Tabellen, Row-Level-Security-Regeln (jeder sieht nur seine eigenen Daten) und die Rate-Limit-Funktion angelegt.

> Fortgeschritten: Mit der [Supabase CLI](https://supabase.com/docs/guides/cli) geht das auch per `supabase link` und `supabase db push`.

### 3. Supabase-Schlüssel kopieren

Im Supabase-Projekt: **Project Settings → API Keys** (bzw. **Connect**):

- **Project URL** → wird zu `NEXT_PUBLIC_SUPABASE_URL`
- **Publishable key** (beginnt mit `sb_publishable_…`) → wird zu `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Diese beiden Werte sind öffentlich (sie landen auch im Browser) – der Schutz deiner Daten passiert über die RLS-Regeln aus Schritt 2. Den **Secret key / service_role key brauchst du nicht** – bitte nirgends eintragen.

### 4. Anmeldung (Auth) konfigurieren

Im Supabase-Projekt: **Authentication → URL Configuration**

- **Site URL:** deine Vercel-Adresse, z. B. `https://jarvis-deinname.vercel.app` (vor dem ersten Deployment vorerst `http://localhost:3000`)
- **Redirect URLs** – alle diese Einträge hinzufügen:
  - `http://localhost:3000/auth/confirm`
  - `https://jarvis-deinname.vercel.app/auth/confirm` (deine echte Vercel-Adresse)

Unter **Authentication → Sign In / Providers** muss **Email** aktiviert sein (Standard).

**Wichtig zum E-Mail-Versand:** Der eingebaute Mailversand von Supabase verschickt E-Mails nur an Adressen, die zu deinem Supabase-Team gehören (also z. B. die Adresse, mit der du dein Supabase-Konto angelegt hast), und nur wenige pro Stunde. Melde dich bei Jarvis am einfachsten mit genau dieser Adresse an. Für andere Adressen brauchst du einen eigenen SMTP-Dienst (Authentication → Emails → SMTP Settings; es gibt Anbieter mit kostenlosem Kontingent).

**Empfehlung nach deiner ersten Anmeldung:** Unter **Authentication → Sign In / Providers** die Option **„Allow new users to sign up“** ausschalten. Dann kann niemand mehr ein neues Konto anlegen. (Zusätzlich lässt Jarvis sowieso nur Adressen aus `ALLOWED_EMAILS` hinein.)

**Optional – Link auf einem anderen Gerät öffnen:** Standardmäßig muss der Magic-Link im selben Browser geöffnet werden, in dem du ihn angefordert hast. Wenn du das ändern möchtest: **Authentication → Emails → Magic Link** und den Link in der Vorlage ersetzen durch

```
{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email
```

### 5. KI-Schlüssel erstellen

#### Variante A (empfohlen, kostenlos): Google Gemini

1. [aistudio.google.com/apikey](https://aistudio.google.com/apikey) öffnen und mit einem Google-Konto anmelden.
2. Beim ersten Mal die Nutzungsbedingungen bestätigen.
3. **Create API key** (bzw. „API-Schlüssel erstellen“) klicken. Falls gefragt wird, ein neues Projekt anlegen lassen.
4. Den Schlüssel kopieren und **nur** in `.env.local` bzw. Vercel als `GEMINI_API_KEY` eintragen. Dazu `AI_PROVIDER=gemini`.
5. **Keine Abrechnung (Billing) aktivieren** – dann bleibt es beim kostenlosen Kontingent und es kann nichts kosten.

Gut zu wissen:
- Das kostenlose Kontingent hat Grenzen (Anfragen pro Minute und pro Tag; Google ändert die Zahlen gelegentlich). Ist es erreicht, zeigt Jarvis „Das kostenlose Gemini-Limit ist gerade erreicht“. Mehr Spielraum gibt oft `GEMINI_MODEL=gemini-flash-lite-latest`.
- **Datenschutz:** Im kostenlosen Tarif darf Google Eingaben und Antworten zur Verbesserung seiner Produkte verwenden (auch durch menschliche Prüfer). Dazu gehören auch Inhalte aus Aufgaben, Notizen und Erinnerungen, die Jarvis für eine Antwort liest. Schreib deshalb nichts sehr Persönliches hinein.
- Google setzt für die Nutzung von AI Studio in der Regel ein Mindestalter voraus (meist 18) – prüfe die Bedingungen.

#### Variante B (kostenpflichtig): Anthropic Claude

1. Auf [console.anthropic.com](https://console.anthropic.com) anmelden.
2. Unter **Billing** Guthaben aufladen (Prepaid – es wird nichts automatisch nachgekauft, solange du Auto-Reload nicht einschaltest).
3. Unter **Limits** ein niedriges monatliches Ausgabenlimit festlegen (z. B. 5 $).
4. Unter **API Keys** → **Create Key**, Name z. B. `jarvis`. Den Schlüssel (beginnt mit `sk-ant-…`) **sofort** als `ANTHROPIC_API_KEY` in `.env.local` bzw. Vercel eintragen – er wird nur einmal angezeigt. Dazu `AI_PROVIDER=anthropic`.

> Bist du unter 18? Prüfe die Nutzungsbedingungen von Anthropic – ggf. muss eine erziehungsberechtigte Person das Konto anlegen.

---

## Lokal starten

```bash
# 1. Code holen (falls noch nicht geschehen)
git clone https://github.com/vexsternbrink-hue/Javis.git
cd Javis

# 2. Abhängigkeiten installieren
npm install

# 3. Umgebungsvariablen anlegen
cp .env.example .env.local
#    → .env.local im Editor öffnen und deine Werte eintragen

# 4. Starten
npm run dev
```

Dann im Browser [http://localhost:3000](http://localhost:3000) öffnen, E-Mail eingeben, Link aus der E-Mail anklicken – fertig.

> Fehlt etwas in `.env.local`, zeigt Jarvis eine verständliche Meldung statt eines Absturzes (z. B. „Der KI-Zugang ist noch nicht eingerichtet“). Es gibt **keinen Demo-Modus mit erfundenen Antworten** – ohne API-Schlüssel antwortet Jarvis nicht.

---

## Auf Vercel veröffentlichen

1. **Code in den Hauptzweig bringen:** Vercel veröffentlicht standardmäßig den Branch `main`. Führe den Branch mit diesem Code per Pull Request in `main` zusammen (auf GitHub: „Compare & pull request“ → „Merge“).
2. Auf [vercel.com](https://vercel.com) → **Add New… → Project** → dein GitHub-Repository `Javis` **importieren**.
3. Framework wird automatisch als **Next.js** erkannt. Nichts weiter ändern.
4. Unter **Environment Variables** alle Variablen aus der Tabelle unten eintragen (mindestens alle mit ✅ markierten).
5. **Deploy** klicken und warten (ca. 1–2 Minuten).
6. Die angezeigte Adresse (z. B. `https://jarvis-deinname.vercel.app`) in Supabase eintragen: **Site URL** und **Redirect URLs** (siehe Schritt 4 oben).
7. Fertig! Auf dem Smartphone die Adresse öffnen und über **„Zum Home-Bildschirm hinzufügen“** wie eine App nutzen.

Änderst du später Umgebungsvariablen in Vercel, musst du unter **Deployments → … → Redeploy** neu veröffentlichen.

---

## Umgebungsvariablen

| Variable | Pflicht | Geheim? | Beschreibung |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | nein | Project URL aus Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✅ | nein | Publishable key aus Supabase (`sb_publishable_…`) |
| `AI_PROVIDER` | ✅ | nein | `gemini` (kostenloses Kontingent) oder `anthropic` (kostenpflichtig) |
| `GEMINI_API_KEY` | ✅ bei Gemini | **ja** | Schlüssel aus Google AI Studio – nur serverseitig verwendet |
| `GEMINI_MODEL` | – | nein | Standard `gemini-flash-latest`; mehr Gratis-Spielraum: `gemini-flash-lite-latest` |
| `ANTHROPIC_API_KEY` | ✅ bei Anthropic | **ja** | API-Schlüssel von Anthropic – nur serverseitig verwendet |
| `ANTHROPIC_MODEL` | – | nein | Standard `claude-haiku-5-5` (günstigstes aktuelles Modell). Stärker, aber teurer: `claude-sonnet-5-5`, `claude-opus-5-5` |
| `ANTHROPIC_EFFORT` | – | nein | `low`, `medium` oder `high`. Weniger Aufwand = günstiger und schneller |
| `ALLOWED_EMAILS` | ✅ | nein | Kommagetrennte Liste der E-Mail-Adressen, die Jarvis nutzen dürfen. **In Produktion Pflicht** – ist sie leer, kommt niemand hinein. |
| `AI_MAX_OUTPUT_TOKENS` | – | nein | Obergrenze für die Länge einer KI-Antwort (Standard 4000) |
| `RATE_LIMIT_CHAT_PER_MINUTE` | – | nein | KI-Anfragen pro Minute und Nutzer (Standard 10) |
| `RATE_LIMIT_CHAT_PER_DAY` | – | nein | KI-Anfragen pro Tag und Nutzer (Standard 150) |
| `RATE_LIMIT_API_PER_MINUTE` | – | nein | Sonstige API-Anfragen pro Minute (Standard 120) |
| `APP_TIMEZONE` | – | nein | Zeitzone für Datumsangaben an die KI (Standard `Europe/Berlin`) |

Eine Vorlage mit Platzhaltern liegt in [`.env.example`](.env.example).

---

## Kosten – ehrlich erklärt

**Kostenloser Betrieb kann nicht dauerhaft versprochen werden.** So setzen sich mögliche Kosten zusammen:

| Dienst | Kostet es Geld? | Was du wissen solltest |
|---|---|---|
| **Google Gemini (kostenloses Kontingent)** | Nein, solange du **keine Abrechnung aktivierst** | Begrenzte Anfragen pro Minute/Tag. Im Gratis-Tarif darf Google die Inhalte zur Produktverbesserung nutzen (siehe Datenschutz-Hinweis oben). |
| **Anthropic-API** | **Ja, pro Nutzung.** | Jede Chat-Nachricht und jedes „Fortsetzen“ nach einer Bestätigung löst 1–5 KI-Aufrufe aus (mehr, wenn Jarvis Tools benutzt). Abgerechnet wird nach Tokens (Textmenge rein + raus). Es gibt kein dauerhaft kostenloses Kontingent. |
| **Supabase Free** | Nein (im Free-Plan) | Grenzen u. a.: 500 MB Datenbank, begrenzte E-Mails pro Stunde über den eingebauten Mailversand. **Projekte im Free-Plan werden nach ca. einer Woche ohne Aktivität pausiert** – im Dashboard mit einem Klick wieder starten. |
| **Vercel Hobby** | Nein (im Hobby-Plan) | Nur für private, nicht-kommerzielle Nutzung. Feste Monatsgrenzen; im Hobby-Plan entstehen keine automatischen Zusatzkosten – bei Überschreitung kann Vercel das Projekt pausieren. |
| **GitHub** | Nein | Private Repositories sind kostenlos. |

**Grobe Beispielrechnung (ohne Gewähr, Preise können sich ändern):** Mit `claude-haiku-5-5` (laut Anthropic ca. 0,10 $ pro 1 Mio. Eingabe-Tokens und 0,50 $ pro 1 Mio. Ausgabe-Tokens) kostet eine typische Nachricht mit ~3.000 Tokens Kontext und ~300 Tokens Antwort etwa 0,0005 $ – also grob 1.000–2.000 Nachrichten pro Dollar. Mit Tools oder sehr langen Chats wird es mehr, mit `claude-opus-5-5` etwa 40-mal so teuer. Prüfe die aktuelle Preisliste unter [anthropic.com/pricing](https://www.anthropic.com/pricing).

**So hältst du die Kosten im Griff:**
- Günstiges Modell (`claude-haiku-5-5`) und `ANTHROPIC_EFFORT=low` verwenden.
- In der Anthropic-Konsole ein **monatliches Ausgabenlimit** setzen und **kein Auto-Reload** aktivieren.
- `ALLOWED_EMAILS` nur auf deine Adresse setzen und Neuregistrierungen in Supabase abschalten.
- Die eingebauten Grenzen nutzen: max. 4.000 Zeichen pro Nachricht, max. 5 KI-Aufrufe und 8 Tool-Aufrufe pro Anfrage, Rate-Limit pro Minute und Tag, begrenzte Kontextgröße und Antwortlänge.
- Lange Chats sind teurer, weil der Verlauf mitgeschickt wird – für neue Themen lieber einen neuen Chat beginnen.
- Wiederholte Gesprächsanfänge nutzen automatisches Prompt-Caching (günstiger abgerechnet).

**Komplett kostenlos?** Mit `AI_PROVIDER=gemini` und dem kostenlosen Kontingent von Google (ohne aktivierte Abrechnung) sowie den Free-Plänen von Supabase und Vercel entstehen nach heutigem Stand keine Kosten. Versprechen kann das niemand dauerhaft – die Anbieter können ihre Gratis-Angebote jederzeit ändern. Die KI ist im Code gekapselt (`src/lib/ai/`), ein Wechsel ist also mit einer Umgebungsvariable erledigt.

---

## Sicherheit

- **Anmeldung:** Magic-Link per E-Mail (Supabase Auth). Zusätzlich lässt Jarvis nur E-Mail-Adressen aus `ALLOWED_EMAILS` zu – sowohl beim Login als auch bei **jedem** API-Aufruf.
- **Datentrennung:** Row-Level-Security in der Datenbank – jeder Nutzer sieht und verändert nur seine eigenen Chats, Nachrichten, Aktionen, Erinnerungen, Aufgaben und Notizen. Der Server nutzt ausschließlich die Sitzung des angemeldeten Nutzers (kein Service-Role-Key), daher gelten die Regeln auch für alle API-Endpunkte und KI-Tools. Ein automatischer Test prüft das (siehe unten).
- **Bestätigung schreibender Aktionen:** Will die KI etwas anlegen, ändern oder löschen, wird die Aktion mit Tool-Name und **validierten** Argumenten serverseitig gespeichert (Status „wartet“) und in der Oberfläche mit genauem Inhalt angezeigt. Ausgeführt wird erst, wenn du auf „Ausführen“ klickst. Der Browser schickt dabei nur die ID und „ausführen/ablehnen“ – die Argumente kommen aus der Datenbank, wo sie nach dem Anlegen **nicht mehr verändert werden können** (Datenbankrechte). Der Statuswechsel ist atomar, d. h. jede Aktion wird höchstens einmal ausgeführt. Veraltete Vorschläge (nicht aus der neuesten KI-Nachricht oder älter als 24 h) werden verworfen. Was die KI im Text schreibt, gilt nie als Zustimmung.
- **Validierung:** Alle Eingaben und Tool-Argumente werden serverseitig mit Zod geprüft (Längen, Datumsformat, IDs) – direkt vor der Ausführung noch einmal. Die Datenbank prüft die Grenzen zusätzlich.
- **Geheimnisse:** Der Gemini- bzw. Anthropic-Schlüssel wird nur auf dem Server gelesen, nie an den Browser geschickt und nie geloggt. Logs enthalten keine Chatinhalte, nur Fehlercodes.
- **Prompt-Injection:** Inhalte aus Notizen, Aufgaben und Tool-Ergebnissen werden der KI als Daten gekennzeichnet. Wichtiger: Selbst wenn die KI sich „überreden“ lässt, kann sie ohne deinen Klick nichts verändern und sowieso nur auf deine eigenen Daten zugreifen.
- **Keine gefährlichen Tools:** Kein Zugriff auf Shell, Dateien, beliebige URLs, E-Mails, Käufe oder externe Konten.
- **Rate-Limiting:** Zähler liegen in der Datenbank (funktioniert auf Vercel mit vielen parallelen Serverless-Instanzen) – pro Nutzer und Minute bzw. Tag.
- **Weitere Schutzmaßnahmen:** Herkunftsprüfung (Origin) bei schreibenden API-Anfragen, Sicherheits-Header, Markdown ohne rohes HTML, Seiten nicht für Suchmaschinen indexierbar.

---

## Tests und Prüfungen

```bash
npm run lint        # ESLint
npm run typecheck   # TypeScript
npm run test        # Unit- und Ablauftests (Vitest)
npm run test:rls    # Datenbank-Sicherheitstest (benötigt lokal installiertes PostgreSQL)
npm run build       # Produktionsbuild
npm run check       # lint + typecheck + test + build
```

- **`npm run test`** prüft u. a. Validierung, Allowlist, Verlaufslogik, den Anthropic- und den Gemini-Adapter (inkl. Streaming mit dem echten Google-SDK gegen einen lokalen Test-Server) und den kompletten Agent-Ablauf mit einem **simulierten** KI-Anbieter (nur im Test!): lesende Tools laufen automatisch, schreibende erst nach Bestätigung, abgelehnte/verworfene Aktionen werden nicht ausgeführt, Doppel-Bestätigungen werden abgewiesen, ungültige Argumente und unbekannte Tools werden blockiert, die Tool-Schleife ist begrenzt.
- **`npm run test:rls`** startet ein temporäres PostgreSQL, spielt die echte Migration ein und prüft mit zwei Nutzern (A und B) und einem anonymen Besucher, dass niemand fremde Daten lesen, ändern, löschen oder unterschieben kann – und dass Nachrichten und Aktions-Argumente unveränderlich sind.

---

## Projektaufbau

```
src/
  app/
    (app)/            geschützte Seiten: chat, tasks, notes, memories
    api/              API-Routen (chat-Streaming, Aktionen bestätigen, CRUD)
    auth/             Magic-Link-Bestätigung und Abmelden
    login/            Anmeldeseite
  components/         Oberfläche (Sidebar, Chat, Aufgaben, Notizen, Erinnerungen)
  lib/
    ai/               KI-Anbieter (austauschbar): types.ts, gemini.ts, anthropic.ts, provider.ts, System-Prompt
    agent/            Agent-Schleife, Tools, Bestätigungslogik, Verlauf
    data/             Datenbankzugriffe für Aufgaben, Notizen, Erinnerungen
    supabase/         Supabase-Clients (Server + Proxy)
    voice/            Vorbereitung für Sprachein-/ausgabe (noch nicht aktiv)
  proxy.ts            frischt die Login-Sitzung auf und schützt Seiten
supabase/
  migrations/         SQL-Schema mit RLS
  tests/              RLS-Test
tests/                Vitest-Tests
```

**Ablauf einer Chat-Nachricht:** Browser → `POST /api/chat` → Anmeldung, Allowlist und Rate-Limit prüfen → Nachricht speichern → KI-Antwort streamen → lesende Tools sofort ausführen, schreibende als „wartet auf Bestätigung“ speichern → Klick auf „Ausführen“ → `POST /api/actions/:id` führt genau die gespeicherte Aktion aus → `POST /api/chat` (fortsetzen) gibt der KI das echte Ergebnis.

---

## Bekannte Einschränkungen

- **Keine Benachrichtigungen:** Ein Fälligkeitsdatum ist nur eine Markierung. Jarvis verschickt keine Push-Nachrichten oder E-Mails.
- **Gemini-Gratis-Limits:** Bei vielen Nachrichten kurz hintereinander oder vielen Tool-Aufrufen kann das kostenlose Kontingent erreicht werden – dann kurz warten bzw. am nächsten Tag weitermachen.
- **Kein Internetzugang der KI:** Jarvis kennt nur sein Trainingswissen, deine Daten und das aktuelle Datum. Aktuelle Nachrichten/Wetter kann er nicht abrufen.
- **Lange Chats:** Ab etwa 60.000 Zeichen Verlauf schickt Jarvis nur die neuesten Nachrichten an die KI; ältere Teile „vergisst“ er in diesem Chat. Erinnerungen bleiben immer erhalten.
- **Magic-Link:** Standardmäßig im selben Browser öffnen (siehe optionale E-Mail-Vorlage). Der eingebaute Supabase-Mailversand erlaubt nur wenige E-Mails pro Stunde.
- **Supabase Free pausiert** inaktive Projekte nach ca. einer Woche.
- **Abbrechen einer Antwort:** Ein abgebrochener, noch nicht fertiger Antworttext wird nicht gespeichert.
- **Notizsuche:** einfache Teilwortsuche, keine „intelligente“ Suche.
- **Keine Offline-Nutzung**, keine Dateien/Bilder im Chat.

---

## Sinnvolle nächste Erweiterungen

1. **Spracheingabe und Vorlesen** über die kostenlose Web Speech API des Browsers (Struktur in `src/lib/voice/` vorbereitet; Mikrofon nur auf Knopfdruck).
2. **Automatische Chat-Titel** per KI (kostet minimal zusätzliche Tokens).
3. **Bessere Notizsuche** mit Postgres-Volltextsuche (kostenlos in Supabase).
4. **Echte Erinnerungs-Benachrichtigungen** (z. B. Web-Push mit einem Vercel-Cron-Job) – erst dann gibt es echte Benachrichtigungen.
5. **Kosten-Übersicht** in der App aus den bereits gespeicherten Token-Zahlen (`messages.input_tokens/output_tokens`).
6. **Weitere KI-Anbieter** über einen neuen Adapter in `src/lib/ai/`.
7. **Externe Dienste** (Kalender, E-Mail) – nur mit derselben Bestätigungslogik und sehr vorsichtig.
