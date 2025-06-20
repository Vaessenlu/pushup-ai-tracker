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
  if (exercise) query = query.eq('exercise_type', exercise);
  let data;
  let error: { message?: string; code?: string } | null = null;
  try {
    ({ data, error } = await query);
  } catch (err) {
    console.error('Error fetching highscores', err);
    error = { message: (err as Error).message, code: '' };
  }

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
      if (exercise) {
        if (msg.includes('exercise_type')) {
          fallbackQuery = fallbackQuery.eq('exercise', exercise);
        } else {
          fallbackQuery = fallbackQuery.eq('exercise_type', exercise);
        }
      }
      try {
        const fallback = await fallbackQuery;
        data = fallback.data;
        error = fallback.error;
      } catch (e) {
        console.error('Fallback highscore query failed', e);
        data = null;
        error = { message: (e as Error).message, code: '' };
      }
    }

    if (error) {
      // No read access? fall back to local sessions
      const local = loadCommunitySessions().filter(s => {
        const d = new Date(s.date);
        return d >= start &&
          (!exercise || s.exercise === exercise || s.exercise_type === exercise);
      });
      if (local.length === 0) {
        return { scores: [], total: 0 };
      }

      const totals = new Map<string, { name: string; count: number }>();
      let totalCount = 0;

      local.forEach(r => {
        const username = r.username?.trim() || undefined;
        const key = (r.user_id || username || r.email || 'unknown').toLowerCase();
        const displayName = username || r.email || 'Unbekannt';
        totalCount += r.count;
        const existing = totals.get(key);
        if (existing) {
          existing.count += r.count;
          if (username) existing.name = username;
        } else {
          totals.set(key, { name: displayName, count: r.count });
        }
      });

      const scores = Array.from(totals.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      return { scores, total: totalCount };
    }
  }

  const totals = new Map<string, { name: string; count: number }>();
  let totalCount = 0;

  const idsToLookup = Array.from(
    new Set(
      (data || [])
        .filter(r => (r as Record<string, unknown>).user_id && !(r as Record<string, unknown>).username)
        .map(r => (r as Record<string, unknown>).user_id as string),
    ),
  );

  const nameMap: Record<string, string> = {};
  if (idsToLookup.length) {
    try {
      const { data: nameRows } = await supabase
        .from('sessions')
        .select('user_id, username, created_at')
        .not('username', 'is', null)
        .in('user_id', idsToLookup)
        .order('created_at', { ascending: false });
      (nameRows || []).forEach(row => {
        const uid = (row as Record<string, unknown>).user_id as string | undefined;
        const uname = (row as Record<string, unknown>).username as string | undefined;
        if (uid && typeof uname === 'string' && uname.trim() && !nameMap[uid.toLowerCase()]) {
          nameMap[uid.toLowerCase()] = uname.trim();
        }
      });
    } catch (e) {
      console.error('Failed to lookup usernames', e);
    }
  }

  (data || []).forEach(r => {
    const uid = (r as Record<string, unknown>).user_id as string | undefined;
    let username =
      typeof r.username === 'string' && r.username.trim()
        ? r.username.trim()
        : undefined;
    if (!username && uid) {
      const lookup = nameMap[uid.toLowerCase()];
      if (lookup) username = lookup;
    }

    const key = (uid || username || 'unknown').toLowerCase();
    const displayName = username || 'Unbekannt';
    totalCount += r.count as number;
    const existing = totals.get(key);
    if (existing) {
      existing.count += r.count as number;
      if (username) existing.name = username;
    } else {
      totals.set(key, { name: displayName, count: r.count as number });
    }
  });

  const scores = Array.from(totals.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return { scores, total: totalCount };
}
