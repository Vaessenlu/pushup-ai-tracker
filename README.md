# Push Up Tracker

This repository contains the code for a push-up counter webapp.
## How can I edit this code?

There are several ways of editing your application.

**Use your preferred IDE**

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Pose detection

The app uses [Mediapipe Pose](https://developers.google.com/mediapipe) for
tracking body landmarks. The library is loaded dynamically to keep the bundle
small. Connection pairs are defined locally in
`src/lib/poseConstants.ts` to avoid bundling the entire Mediapipe package.

## How can I deploy this project?


### Nutzung von Supabase

Alternativ können Sie die mitgelieferte Supabase‑Integration verwenden. Legen
eine Tabelle `sessions` an. Diese sollte die Spalten `email`, `username`, `date`
und `count` (integer) enthalten. Für `date` empfiehlt sich der Typ `timestamp with time zone`.
Fehlt die Spalte `username` oder ist `date` lediglich ein `date`‑Feld,
verwendet die App automatisch einen Fallback. Nutzt Ihre bestehende Tabelle
statt `email` eine Spalte `user_id` und `created_at`, erkennt die App dies und
fällt ebenfalls darauf zurück. Befindet sich zusätzlich eine Spalte `username`
in dieser Variante, wird auch dort der Benutzername gespeichert und in den
Highscores angezeigt. Ein Fehler "400 Bad Request" weist oft auf eine
abweichende Tabellendefinition hin – kontrolliere in diesem Fall die
Spaltennamen und -typen der Tabelle `sessions`.

Hinterlegen Sie anschließend Ihre Supabase URL und den Anon Key in einer Datei
`.env` im Projektwurzelverzeichnis:

```
VITE_SUPABASE_URL=<your-url>
VITE_SUPABASE_ANON_KEY=<your-key>
# Alternativ können auch NEXT_PUBLIC_* Variablen verwendet werden
NEXT_PUBLIC_SUPABASE_URL=<your-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-key>
```
Kopiere die Datei `.env.example` zu `.env` und fülle sie mit deinen Daten. Danach `npm run dev` oder `npm run build` ausführen.

Um sicherzustellen, dass die Tabelle `sessions` alle benötigten Spalten enthält, steht das Skript `npm run ensure-schema` bereit. Dieses verwendet einen Supabase **Service Role Key** und kann fehlende Spalten automatisch anlegen. Das Skript wird beim Start von `npm run dev` automatisch ausgeführt.

Neu ist die Spalte `exercise_type`, die den Typ der absolvierten Übung (z.B. `pushup` oder `squat`) speichert. Das Skript legt sie bei Bedarf ebenfalls an.

Speichere dazu die Variable `SUPABASE_SERVICE_ROLE_KEY` in deiner `.env` und führe anschließend `npm run dev` aus.

Bei der Registrierung musst du einen Benutzernamen angeben. Dieser wird zusammen
mit deinen Sessions gespeichert und in den Community-Highscores angezeigt.
Du meldest dich danach mit deiner E-Mail-Adresse und deinem Passwort an.
Jede E-Mail-Adresse ist genau einem Benutzernamen zugeordnet.
Die Highscores im "Community"-Tab kannst du auch ohne Login einsehen. Darunter
findest du zwei getrennte Formulare: eines zum Einloggen (E-Mail und Passwort)
und eines zur Registrierung (Benutzername, E-Mail und Passwort).

Seit dem neuesten Update werden in den Highscore-Tabellen neben den besten Nutzern auch die insgesamt absolvierten Liegestützen des Tages, der Woche und des Monats angezeigt. Über Pfeilsymbole kannst du zwischen den Highscores für Liegestütze und Kniebeugen wechseln.

Dank der Einstellung `envPrefix` in `vite.config.ts` werden sowohl `VITE_` als
auch `NEXT_PUBLIC_` Variablen automatisch vom Build übernommen.


Nach `npm run dev` oder `npm run build` wird Supabase für Registrierung, Login
und Highscore-Abfragen verwendet. Melde dich im "Community"-Tab an, damit deine
Sessions gespeichert werden. Die Highscores sind auch ohne Login sichtbar.
Stelle sicher, dass die Tabelle `sessions` öffentlich lesbar ist oder passende
Row-Level-Security-Regeln eingerichtet sind. Fehlen diese Rechte, wertet die
App lediglich deine lokal gespeicherten Sessions aus.


### 4. Deployment

Kopieren Sie den Inhalt des `dist`‑Ordners auf einen Webserver oder hosten Sie ihn
auf Plattformen wie Vercel oder Netlify. Rufen Sie anschließend Ihre Domain im
Browser auf. Die Daten werden nun dauerhaft über Supabase gespeichert.


### 5. Deployment auf Netlify

Um die Webapp als statische Seite bei **Netlify** zu hosten, legen Sie im Projekt eine Datei `netlify.toml` an (bereits enthalten) und pushen Sie das Repository zu GitHub. Erstellen Sie anschließend auf [Netlify](https://app.netlify.com/) eine neue Site und verbinden Sie Ihr Repository.

Netlify liest die Konfiguration automatisch aus `netlify.toml`. Die wichtigsten Einstellungen sind:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

Damit führt Netlify `npm install` und `npm run build` aus und veröffentlicht den Inhalt des `dist`‑Ordners. Durch den Redirect wird jede Route an `index.html` weitergeleitet, sodass das React‑Routing funktioniert.

Nach dem Deploy ist Ihre App unter der von Netlify bereitgestellten URL erreichbar.
