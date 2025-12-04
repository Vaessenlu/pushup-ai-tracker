import { supabase } from './supabaseClient';
import { loadCommunitySessions } from './community/localStorage';
import type { ExerciseType } from '@/types/exercise';

export interface ScoreEntry {
  name: string;
  count: number;
}

export interface HighscoreResult {
  scores: ScoreEntry[];
  total: number;
}

export async function fetchHighscores(
  period: 'day' | 'week' | 'month',
  exercise?: ExerciseType,
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
      const local = loadCommunitySessions().filter((s) => {
        const d = new Date(s.date);
        return (
          d >= start &&
          (!exercise || s.exercise === exercise || s.exercise_type === exercise)
        );
      });
      if (local.length === 0) {
        return { scores: [], total: 0 };
      }

      const totals = new Map<string, { name: string; count: number }>();
      let totalCount = 0;

      local.forEach((r) => {
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
        .filter(
          (r) =>
            (r as Record<string, unknown>).user_id &&
            !(r as Record<string, unknown>).username,
        )
        .map((r) => (r as Record<string, unknown>).user_id as string),
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
      (nameRows || []).forEach((row) => {
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

  (data || []).forEach((r) => {
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
