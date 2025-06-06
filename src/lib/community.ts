export interface CommunitySession {
  email: string;
  username?: string;
  date: string; // ISO string
  count: number;
}

const STORAGE_KEY = 'communitySessions';

export interface ScoreEntry {
  name: string;
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

import { supabase } from './supabaseClient';

// --- Server API (via Supabase) ---

export async function register(
  email: string,
  password: string,
  username: string,
): Promise<string> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });
  if (error || !data.session) {
    throw new Error('Registrierung fehlgeschlagen');
  }
  return data.session.access_token;
}

export async function login(email: string, password: string): Promise<string> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error('Login fehlgeschlagen');
  }
  return data.session.access_token;
}

export async function saveSessionServer(
  token: string,
  session: Omit<CommunitySession, 'email' | 'username'>,
) {
  const current = await supabase.auth.getSession();
  if (!current.data.session) throw new Error('Nicht eingeloggt');

  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email;
  const userId = userData.user?.id;
  const username = (userData.user?.user_metadata as { username?: string })?.username;
  if (!email && !userId) throw new Error('Kein Benutzer gefunden');

  const base = { count: session.count } as Record<string, unknown>;
  const attempts: Record<string, unknown>[] = [
    { email, username, date: session.date, ...base },
    { email, date: session.date, ...base },
    { user_id: userId, username, created_at: session.date, ...base },
    { user_id: userId, created_at: session.date, ...base },
  ];

  const dateOnly = session.date.split('T')[0];

  for (const values of attempts) {
    let { error } = await supabase.from('sessions').insert(values);
    if (!error) return;
    if (error.code?.startsWith('22') || /timestamp|date/i.test(error.message || '')) {
      const vals = { ...values } as Record<string, unknown>;
      if (vals.date) vals.date = dateOnly;
      if (vals.created_at) vals.created_at = dateOnly;
      ({ error } = await supabase.from('sessions').insert(vals));
      if (!error) return;
    }
  }
  throw new Error('Speichern fehlgeschlagen');
}

export async function fetchHighscores(period: 'day' | 'week' | 'month'): Promise<ScoreEntry[]> {
  const now = new Date();
  let start: Date;
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

  const iso = start.toISOString();
  const dateOnly = iso.split('T')[0];

  const attempts = [
    { sel: 'email, username, count, date', col: 'date', map: (r: any) => ({ name: r.username || r.email, count: r.count }) },
    { sel: 'email, count, date', col: 'date', map: (r: any) => ({ name: r.email, count: r.count }) },
    { sel: 'user_id, username, count, created_at', col: 'created_at', map: (r: any) => ({ name: r.username || r.user_id, count: r.count }) },
    { sel: 'user_id, count, created_at', col: 'created_at', map: (r: any) => ({ name: r.user_id, count: r.count }) },
  ];

  for (const a of attempts) {
    let { data, error } = await supabase.from('sessions').select(a.sel).gte(a.col, iso);
    if (error && (error.code?.startsWith('22') || /timestamp|date/i.test(error.message || ''))) {
      ({ data, error } = await supabase.from('sessions').select(a.sel).gte(a.col, dateOnly));
    }
    if (!error) {
      const totals: Record<string, number> = {};
      (data || []).forEach(r => { totals[a.map(r).name] = (totals[a.map(r).name] || 0) + a.map(r).count; });
      return Object.entries(totals).map(([name, count]) => ({ name, count })).sort((x, y) => y.count - x.count).slice(0, 10);
    }
  }

  throw new Error('Fehler beim Laden der Highscores');
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
      const name = s.username || s.email;
      totals[name] = (totals[name] || 0) + s.count;
    }
  });

  return Object.entries(totals)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}
