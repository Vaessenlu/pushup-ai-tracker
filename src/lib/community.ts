export interface CommunitySession {
  email: string;
  date: string; // ISO string
  count: number;
}

const STORAGE_KEY = 'communitySessions';

export interface ScoreEntry {
  email: string;
  count: number;
}

export function loadCommunitySessions(): CommunitySession[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveCommunitySession(session: CommunitySession) {
  const sessions = loadCommunitySessions();
  sessions.push(session);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

// --- Server API ---
const API_URL = '/api';

export async function register(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_URL}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error('Registrierung fehlgeschlagen');
  const data = await res.json();
  return data.token as string;
}

export async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error('Login fehlgeschlagen');
  const data = await res.json();
  return data.token as string;
}

export async function saveSessionServer(token: string, session: Omit<CommunitySession, 'email'>) {
  await fetch(`${API_URL}/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(session),
  });
}

export async function fetchHighscores(period: 'day' | 'week' | 'month'): Promise<ScoreEntry[]> {
  const res = await fetch(`${API_URL}/highscore/${period}`);
  if (!res.ok) throw new Error('Fehler beim Laden der Highscores');
  return res.json();
}

export function computeHighscores(period: 'day' | 'week' | 'month'): ScoreEntry[] {
  const sessions = loadCommunitySessions();
  const now = new Date();
  let start: Date;
  if (period === 'day') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (period === 'week') {
    const day = (now.getDay() + 6) % 7; // Monday = 0
    start = new Date(now);
    start.setDate(now.getDate() - day);
    start.setHours(0, 0, 0, 0);
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const totals: Record<string, number> = {};
  sessions.forEach(s => {
    const d = new Date(s.date);
    if (d >= start) {
      totals[s.email] = (totals[s.email] || 0) + s.count;
    }
  });

  return Object.entries(totals)
    .map(([email, count]) => ({ email, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}
