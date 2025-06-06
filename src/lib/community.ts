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
  // ensure current session
  const current = await supabase.auth.getSession();
  if (!current.data.session) throw new Error('Nicht eingeloggt');

  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email;
  const userId = userData.user?.id;
  const username = (userData.user?.user_metadata as { username?: string })?.username;
  if (!email && !userId) throw new Error('Kein Benutzer gefunden');

  await supabase
    .from('sessions')
    .insert({ email, username, date: session.date, count: session.count })
    .catch(async err => {
      const msg = (err as { message?: string }).message || '';
      const code = (err as { code?: string }).code;
      if (msg.includes('username')) {
        await supabase.from('sessions').insert({
          email,
          date: session.date,
          count: session.count,
        });
      } else if (msg.includes('email') || code === '42703') {
        try {
          await supabase
            .from('sessions')
            .insert({ user_id: userId, username, created_at: session.date, count: session.count });
        } catch (e2) {
          const msg2 = (e2 as { message?: string }).message || '';
          if (msg2.includes('username')) {
            await supabase
              .from('sessions')
              .insert({ user_id: userId, created_at: session.date, count: session.count });
          } else {
            throw e2;
          }
        }
      } else if (code?.startsWith('22') || /timestamp|date/i.test(msg)) {
        const onlyDate = session.date.split('T')[0];
        try {
          await supabase.from('sessions').insert({
            email,
            username,
            date: onlyDate,
            count: session.count,
          });
        } catch (e2) {
          const msg2 = (e2 as { message?: string }).message || '';
          const code2 = (e2 as { code?: string }).code;
          if (msg2.includes('username')) {
            await supabase.from('sessions').insert({
              email,
              date: onlyDate,
              count: session.count,
            });
          } else if (msg2.includes('email') || code2 === '42703') {
            try {
              await supabase
                .from('sessions')
                .insert({ user_id: userId, username, created_at: onlyDate, count: session.count });
            } catch (e3) {
              const msg3 = (e3 as { message?: string }).message || '';
              if (msg3.includes('username')) {
                await supabase
                  .from('sessions')
                  .insert({ user_id: userId, created_at: onlyDate, count: session.count });
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

  const iso = start.toISOString();
  let { data, error } = await supabase
    .from('sessions')
    .select('email, username, count, date')
    .gte('date', iso);
  if (error) {
    const msg = error.message || '';
    const code = error.code;
    if (msg.includes('email') || code === '42703') {
      let fb = await supabase
        .from('sessions')
        .select('user_id, username, count, created_at')
        .gte('created_at', iso);
      if (fb.error && fb.error.code === '42703') {
        fb = await supabase
          .from('sessions')
          .select('user_id, count, created_at')
          .gte('created_at', iso);
        data = fb.data?.map(r => ({ email: r.user_id, count: r.count, date: r.created_at }));
      } else {
        data = fb.data?.map(r => ({ email: r.user_id, username: r.username, count: r.count, date: r.created_at }));
      }
      error = fb.error;
    } else if (msg.includes('username')) {
      const fallback = await supabase
        .from('sessions')
        .select('email, count, date')
        .gte('date', iso);
      data = fallback.data;
      error = fallback.error;
    } else if (code?.startsWith('22') || /timestamp|date/i.test(msg)) {
      const fallback = await supabase
        .from('sessions')
        .select('email, username, count, date')
        .gte('date', iso.split('T')[0]);
      if (fallback.error) {
        const fb2 = await supabase
          .from('sessions')
          .select('email, count, date')
          .gte('date', iso.split('T')[0]);
        data = fb2.data;
        error = fb2.error;
      } else {
        data = fallback.data;
        error = null;
      }
    }
  }
  if (error) throw new Error('Fehler beim Laden der Highscores');

  const totals: Record<string, number> = {};
  (data || []).forEach(r => {
    const name = (r.username as string) || (r.email as string);
    totals[name] = (totals[name] || 0) + (r.count as number);
  });

  return Object.entries(totals)
    .map(([name, count]) => ({ name, count }))
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
      const name = s.username || s.email;
      totals[name] = (totals[name] || 0) + s.count;
    }
  });

  return Object.entries(totals)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}
