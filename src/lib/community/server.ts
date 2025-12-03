import { supabase } from '@/lib/supabaseClient';
import { CommunitySession } from './types';
import { saveCommunitySession } from './localStorage';
import type { AuthTokens } from '@/lib/auth';

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
      (r) =>
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
