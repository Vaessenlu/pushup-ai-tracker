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
