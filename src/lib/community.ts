import { supabase } from './supabaseClient';

export interface CommunitySession {
  email: string;
  username?: string;
  user_id?: string;
  date: string; // ISO string
  count: number;
  exercise?: 'pushup' | 'squat';
}

const STORAGE_KEY = 'communitySessions';

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

export async function saveSessionServer(
  token: string,
  session: Omit<CommunitySession, 'email' | 'username'>,
  providedUsername?: string,
) {
  if (token) {
    await supabase.auth.setSession({ access_token: token, refresh_token: token });
  }
  const current = await supabase.auth.getSession();
  if (!current.data.session) throw new Error('Nicht eingeloggt');

  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email;
  const userId = userData.user?.id;
  const metaUsername = (userData.user?.user_metadata as { username?: string })?.username;
  const username = providedUsername || metaUsername;
  if (!email && !userId) throw new Error('Kein Benutzer gefunden');

  const insertData: Record<string, unknown> = {
    user_id: userId,
    username,
    created_at: session.date,
    count: session.count,
  };
  if (session.exercise) insertData.exercise = session.exercise;

  await supabase.from('sessions').insert(insertData).throwOnError();

  saveCommunitySession({
    email: email || '',
    username: username || undefined,
    user_id: userId,
    date: session.date,
    count: session.count,
    exercise: session.exercise,
  });
}

export interface ScoreEntry {
  name: string;
  count: number;
}

export interface HighscoreResult {
  scores: ScoreEntry[];
  total: number;
}

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

export async function login(
  email: string,
  password: string,
): Promise<string> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error('Login fehlgeschlagen');
  }
  return data.session.access_token;
}

export async function fetchHighscores(
  period: 'day' | 'week' | 'month'
): Promise<HighscoreResult> {
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
  let { data, error } = await supabase
    .from('sessions')
    .select('user_id, username, count, created_at')
    .gte('created_at', iso);

  if (error) {
    const msg = error.message || '';
    const code = error.code;

    // Fallback: wenn Spalte fehlt oder Query-Fehler
    if (msg.includes('username') || msg.includes('created_at') || code === '42703') {
      const fallback = await supabase
        .from('sessions')
        .select('user_id, count, created_at')
        .gte('created_at', iso);
      data = fallback.data;
      error = fallback.error;
    }

    if (error) throw new Error('Fehler beim Laden der Highscores');
  }

  const totals = new Map<string, { name: string; count: number }>();
  let totalCount = 0;

  (data || []).forEach(r => {
    const uid = (r as any).user_id;
    const name =
      typeof r.username === 'string' && r.username.trim()
        ? r.username.trim()
        : uid || 'Unbekannt';

    const key = name.toLowerCase();
    totalCount += r.count as number;
    const existing = totals.get(key);
    if (existing) existing.count += r.count as number;
    else totals.set(key, { name, count: r.count as number });
  });

  const scores = Array.from(totals.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return { scores, total: totalCount };
}
