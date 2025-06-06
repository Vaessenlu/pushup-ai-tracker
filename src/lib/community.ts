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

import { supabase } from './supabaseClient';

// --- Server API (via Supabase) ---

export async function register(email: string, password: string): Promise<string> {
  const { data, error } = await supabase.auth.signUp({ email, password });
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

export async function saveSessionServer(token: string, session: Omit<CommunitySession, 'email'>) {
  // ensure current session
  const current = await supabase.auth.getSession();
  if (!current.data.session) throw new Error('Nicht eingeloggt');

  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email;
  if (!email) throw new Error('Kein Benutzer gefunden');

  await supabase.from('sessions').insert({
    email,
    date: session.date,
    count: session.count,
  });
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

  const { data, error } = await supabase
    .from('sessions')
    .select('email, count, date')
    .gte('date', start.toISOString());
  if (error) throw new Error('Fehler beim Laden der Highscores');

  const totals: Record<string, number> = {};
  (data || []).forEach(r => {
    totals[r.email as string] = (totals[r.email as string] || 0) + (r.count as number);
  });

  return Object.entries(totals)
    .map(([email, count]) => ({ email, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
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
