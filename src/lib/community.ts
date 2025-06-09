export interface CommunitySession {
  email: string;
  username?: string;
  user_id?: string;
  date: string; // ISO string
  count: number;
}

const STORAGE_KEY = 'communitySessions';

export interface ScoreEntry {
  name: string;
  count: number;
}

export interface HighscoreResult {
  scores: ScoreEntry[];
  total: number;
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

  // Also store locally so highscores include this session
  saveCommunitySession({
    email: email || '',
    username: username || undefined,
    user_id: userId,
    date: session.date,
    count: session.count,
  });

  try {
    await supabase
      .from('sessions')
      .insert({ email, username, date: session.date, count: session.count })
      .throwOnError();
  } catch (err) {
    const msg = (err as { message?: string }).message || '';
    const code = (err as { code?: string }).code;
    if (msg.includes('username')) {
      await supabase
        .from('sessions')
        .insert({ email, date: session.date, count: session.count })
        .throwOnError();
    } else if (msg.includes('email') || code === '42703') {
      try {
        await supabase
          .from('sessions')
          .insert({ user_id: userId, username, created_at: session.date, count: session.count })
          .throwOnError();
      } catch (e2) {
        const msg2 = (e2 as { message?: string }).message || '';
        if (msg2.includes('username')) {
          await supabase
            .from('sessions')
            .insert({ user_id: userId, created_at: session.date, count: session.count })
            .throwOnError();
        } else {
          throw e2;
        }
      }
    } else if (code?.startsWith('22') || /timestamp|date/i.test(msg)) {
      const onlyDate = session.date.split('T')[0];
      try {
        await supabase
          .from('sessions')
          .insert({ email, username, date: onlyDate, count: session.count })
          .throwOnError();
      } catch (e2) {
        const msg2 = (e2 as { message?: string }).message || '';
        const code2 = (e2 as { code?: string }).code;
        if (msg2.includes('username')) {
          await supabase
            .from('sessions')
            .insert({ email, date: onlyDate, count: session.count })
            .throwOnError();
        } else if (msg2.includes('email') || code2 === '42703') {
          try {
            await supabase
              .from('sessions')
              .insert({ user_id: userId, username, created_at: onlyDate, count: session.count })
              .throwOnError();
          } catch (e3) {
            const msg3 = (e3 as { message?: string }).message || '';
            if (msg3.includes('username')) {
              await supabase
                .from('sessions')
                .insert({ user_id: userId, created_at: onlyDate, count: session.count })
                .throwOnError();
            } else {
              throw e3;
            }
          }
        } else {
          throw e2;
        }
      }
    } else {
      throw err;
    }
  }
}

export async function fetchHighscores(
  period: 'day' | 'week' | 'month',
  exercise: 'pushup' | 'squat' = 'pushup',
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
    .select(
      'user_id, username, count, created_at, exercise, auth_users!inner(username,email)'
    )
    .gte('created_at', iso)
    .eq('exercise', exercise);
  if (error && (error.message?.includes('exercise') || error.code === '42703')) {
    const res = await supabase
      .from('sessions')
      .select('user_id, username, count, created_at')
      .gte('created_at', iso);
    data = res.data || null;
    error = res.error;
  }
  if (error) {
    console.warn('Falling back to local highscores', error.message);
    return computeHighscores(period, exercise);
  }

  const totals = new Map<string, { name: string; count: number }>();
  let total = 0;
  (data || []).forEach((r: {
    user_id: string;
    username?: string | null;
    count: number;
    created_at: string;
    exercise?: string | null;
    auth_users?: { username?: string | null; email?: string | null } | null;
  }) => {
    let name: string | undefined = r.username || undefined;
    if (!name && r.auth_users) {
      name = r.auth_users.username || r.auth_users.email || undefined;
    }
    if (!name) name = r.user_id as string;
    if (!name) return;
    total += r.count as number;
    const key = name.toLowerCase();
    const existing = totals.get(key);
    if (existing) existing.count += r.count as number;
    else totals.set(key, { name, count: r.count as number });
  });

  const scores = Array.from(totals.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  return { scores, total };
}


export function computeHighscores(
  period: 'day' | 'week' | 'month',
  exercise: 'pushup' | 'squat' = 'pushup'
): HighscoreResult {
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

  const totals = new Map<string, { name: string; count: number }>();
  const idToName = new Map<string, string>();
  let totalCount = 0;
  sessions.forEach(s => {
    const d = new Date(s.date);
    if (d >= start) {
      if ((s as Record<string, unknown>).exercise && (s as Record<string, unknown>).exercise !== exercise) {
        return;
      }
      const id = (s as Record<string, unknown>).user_id as string | undefined;
      let name: string | undefined =
        typeof s.username === 'string' && s.username.trim()
          ? s.username.trim()
          : undefined;
      if (!name && typeof s.email === 'string' && s.email.trim()) {
        name = s.email.trim();
      }
      if (name && id) idToName.set(id, name);
      if (!name && id && idToName.has(id)) name = idToName.get(id);
      if (!name && id) name = id;
      if (!name) return;
      const key = name.toLowerCase();
      totalCount += s.count;
      const existing = totals.get(key);
      if (existing) existing.count += s.count;
      else totals.set(key, { name, count: s.count });
    }
  });

  const scores = Array.from(totals.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return { scores, total: totalCount };
}
