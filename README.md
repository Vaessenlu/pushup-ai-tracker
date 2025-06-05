# Push-Up AI Tracker

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

## How can I deploy this project?

Build the project and serve the files in the `dist` directory on any web server.
You can also host it using the Node.js server described below.

## Eigenen Server hosten und Daten dauerhaft speichern

benötigen Sie einen kleinen Node.js‐Server, der die gebaute React‑App ausliefert
und eingehende Ergebnisse in einer Datenbank speichert.

### 1. Frontend bauen

Führen Sie im Projektverzeichnis folgende Befehle aus, um die Produktionsdateien
im Ordner `dist` zu erstellen:

```bash
npm install
npm run build
```

### 2. Node.js‑Server erstellen

Erstellen Sie z. B. einen Ordner `server` und initialisieren Sie dort ein neues
Projekt. Installieren Sie Express und eine Datenbankbibliothek (hier SQLite als
einfaches Beispiel):

```bash
mkdir server
cd server
npm init -y
npm install express sqlite3 cors
```

Legen Sie anschließend eine Datei `index.js` an und füllen Sie sie etwa wie
folgt:


```javascript
import express from 'express';
import sqlite3 from 'sqlite3';
import path from 'path';

const app = express();
const db = new sqlite3.Database('db.sqlite');

db.run('CREATE TABLE IF NOT EXISTS sessions (email TEXT, date TEXT, count INTEGER)');

app.use(express.json());
app.use(express.static(path.join('..', 'dist')));

app.post('/api/session', (req, res) => {
  const { email, date, count } = req.body;
  db.run('INSERT INTO sessions (email, date, count) VALUES (?, ?, ?)', [email, date, count], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.sendStatus(200);
  });
});

app.listen(3000, () => console.log('Server läuft auf http://localhost:3000'));
```

Damit wird das gebaute Frontend ausgeliefert und die API `/api/session`
speichert Ergebnisse in der Datenbank `db.sqlite`.

### 3. Verbindung aus dem Frontend herstellen

Passen Sie die Funktionen zum Speichern der Community‑Sessions so an, dass sie
einen `fetch`‑Aufruf an Ihren Server senden, statt in `localStorage`
zu schreiben.

### 4. Deployment

Kopieren Sie den Inhalt des `dist`‑Ordners und den `server`‑Ordner auf Ihren
Server oder hosten Sie beides auf Plattformen wie Vercel, Netlify oder einem
eigenen VPS. Starten Sie den Node‑Server und rufen Sie anschließend Ihre Domain
im Browser auf. Die Daten werden jetzt permanent in der Datenbank gespeichert.


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
