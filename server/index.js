import express from 'express';
import sqlite3 from 'sqlite3';
import path from 'path';
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const db = new sqlite3.Database('db.sqlite');
const SECRET = 'secret';

db.serialize(() => {
  db.run('CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, password TEXT)');
  db.run('CREATE TABLE IF NOT EXISTS sessions (email TEXT, date TEXT, count INTEGER)');
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'dist')));

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.sendStatus(401);
  const token = auth.split(' ')[1];
  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) return res.sendStatus(401);
    req.user = decoded.email;
    next();
  });
}

app.post('/api/register', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
  const hash = bcrypt.hashSync(password, 10);
  db.run('INSERT INTO users (email, password) VALUES (?, ?)', [email, hash], err => {
    if (err) return res.status(500).json({ error: err.message });
    const token = jwt.sign({ email }, SECRET);
    res.json({ token });
  });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  db.get('SELECT password FROM users WHERE email = ?', [email], (err, row) => {
    if (err || !row) return res.status(401).json({ error: 'Invalid credentials' });
    if (!bcrypt.compareSync(password, row.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ email }, SECRET);
    res.json({ token });
  });
});

app.post('/api/session', authMiddleware, (req, res) => {
  const { date, count } = req.body;
  const email = req.user;
  db.run('INSERT INTO sessions (email, date, count) VALUES (?, ?, ?)', [email, date, count], err => {
    if (err) return res.status(500).json({ error: err.message });
    res.sendStatus(200);
  });
});

app.get('/api/highscore/:period', (req, res) => {
  const { period } = req.params;
  const now = new Date();
  let start;
  if (period === 'day') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (period === 'week') {
    const day = (now.getDay() + 6) % 7;
    start = new Date(now);
    start.setDate(now.getDate() - day);
    start.setHours(0, 0, 0, 0);
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  db.all('SELECT email, count FROM sessions WHERE date >= ?', [start.toISOString()], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const totals = {};
    rows.forEach(r => {
      totals[r.email] = (totals[r.email] || 0) + r.count;
    });
    const scores = Object.entries(totals)
      .map(([email, count]) => ({ email, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    res.json(scores);
  });
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));
