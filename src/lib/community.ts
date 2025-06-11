import { supabase } from './supabaseClient';

export interface CommunitySession {
  email: string;
  username?: string;
  user_id?: string;
  date: string; // ISO string
  count: number;
  exercise?: 'pushup' | 'squat';
  exercise_type?: 'pushup' | 'squat';
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

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

export async function isUsernameTaken(username: string): Promise<boolean> {
  const trimmed = username.trim();
  const { data, error } = await supabase
    .from('sessions')
    .select('username')
    .ilike('username', trimmed)
    .limit(1);
  if (error) return false;
  return (
    (data?.length ?? 0) > 0 &&
    data.some(
      r =>
        typeof r.username === 'string' &&
        r.username.trim().toLowerCase() === trimmed.toLowerCase(),
    )
  );
}

export async function saveSessionServer(
  tokens: AuthTokens,
  session: Omit<CommunitySession, 'email' | 'username'>,
  providedUsername?: string,
) {
  if (tokens) {
    await supabase.auth.setSession(tokens);
  }
  const current = await supabase.auth.getSession();
  if (!current.data.session) throw new Error('Nicht eingeloggt');

  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email;
  const userId = userData.user?.id;
  const metaUsername = (userData.user?.user_metadata as { username?: string })?.username;
  const username = providedUsername || metaUsername;
  if (!email && !userId) throw new Error('Kein Benutzer gefunden');

  if (providedUsername && providedUsername !== metaUsername) {
    if (await isUsernameTaken(providedUsername)) {
      throw new Error('Benutzername bereits vergeben');
    }
    await supabase.auth.updateUser({ data: { username: providedUsername } });
  }

  const insertData: Record<string, unknown> = {
    user_id: userId,
    username,
    created_at: session.date,
    count: session.count,
  };
  if (session.exercise) {
    insertData.exercise = session.exercise;
    insertData.exercise_type = session.exercise;
  }

  let { error } = await supabase.from('sessions').insert(insertData);
  if (error) {
    const base = { count: session.count };
    const variants: Record<string, unknown>[] = [
      { user_id: userId, username, created_at: session.date, exercise_type: session.exercise, ...base },
      { user_id: userId, created_at: session.date, exercise_type: session.exercise, ...base },
      { user_id: userId, exercise_type: session.exercise, ...base },
      { username, created_at: session.date, exercise_type: session.exercise, ...base },
      { username, exercise_type: session.exercise, ...base },
      { exercise_type: session.exercise, ...base },
      base,
    ];
    for (const variant of variants) {
      const res = await supabase.from('sessions').insert(variant);
      if (!res.error) {
        error = undefined;
        break;
      }
      error = res.error;
    }
    if (error) throw error;
  }

  saveCommunitySession({
    email: email || '',
    username: username || undefined,
    user_id: userId,
    date: session.date,
    count: session.count,
    exercise: session.exercise,
    exercise_type: session.exercise,
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
): Promise<AuthTokens> {
  if (await isUsernameTaken(username)) {
    throw new Error('Benutzername bereits vergeben');
  }
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });
  if (error || !data.session) {
    throw new Error('Registrierung fehlgeschlagen');
  }
  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  };
}

export async function login(
  email: string,
  password: string,
): Promise<AuthTokens> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error('Login fehlgeschlagen');
  }
  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  };
}

export async function fetchHighscores(
  period: 'day' | 'week' | 'month',
  exercise?: 'pushup' | 'squat'
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
  let query = supabase
    .from('sessions')
    .select('user_id, username, count, created_at, exercise_type, exercise')
    .gte('created_at', iso);
  if (exercise) query = query.or(
    `exercise.eq.${exercise},exercise_type.eq.${exercise}`
  );
  let { data, error } = await query;

  if (error) {
    const msg = error.message || '';
    const code = error.code;

    // Fallback: wenn Spalte fehlt oder Query-Fehler
    if (
      msg.includes('username') ||
      msg.includes('created_at') ||
      msg.includes('exercise') ||
      code === '42703'
    ) {
      let fallbackQuery = supabase
        .from('sessions')
        .select('user_id, count, created_at')
        .gte('created_at', iso);
      if (exercise)
        fallbackQuery = fallbackQuery.or(
          `exercise.eq.${exercise},exercise_type.eq.${exercise}`
        );
      const fallback = await fallbackQuery;
      data = fallback.data;
      error = fallback.error;
    }

    if (error) throw new Error('Fehler beim Laden der Highscores');
  }

  const totals = new Map<string, { name: string; count: number }>();
  let totalCount = 0;

  (data || []).forEach(r => {
    const uid = (r as Record<string, unknown>).user_id as string | undefined;
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
