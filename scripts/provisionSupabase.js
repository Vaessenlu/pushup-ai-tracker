import * as dotenv from 'dotenv';
import { resolveValue } from './supabaseConfig.js';

dotenv.config();

const accessToken = resolveValue(process.env.SUPABASE_ACCESS_TOKEN, 'accessToken');
const projectRef = resolveValue(
  process.env.SUPABASE_PROJECT_ID || process.env.SUPABASE_PROJECT_REF,
  'projectRef',
  'projectId',
);

if (!accessToken || !projectRef) {
  console.error('Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_ID/REF.');
  process.exit(1);
}

const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/db/query`;

const sql = `
-- required extensions
create extension if not exists "pgcrypto";

-- helper to run arbitrary SQL via RPC (used by scripts/ensureSchema.js)
create or replace function public.execute_sql(sql text)
returns void
language plpgsql
security definer
as $$
begin
  execute sql;
end;
$$;

-- expose helper to standard roles
grant execute on function public.execute_sql(text) to authenticated, anon;

-- session table for exercise tracking
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  username text,
  email text,
  count integer not null,
  duration integer,
  exercise_type text,
  exercise text,
  perceived_intensity text,
  device text,
  camera_fps integer,
  model_version text,
  calories numeric,
  notes text,
  created_at timestamptz default now()
);

-- helpful indexes for community leaderboards and filtering
create index if not exists sessions_created_idx on public.sessions (created_at desc);
create index if not exists sessions_exercise_type_idx on public.sessions (exercise_type);

alter table public.sessions enable row level security;

-- allow inserts for authenticated users matching their user_id or without one
create policy if not exists "Users can insert own sessions"
  on public.sessions for insert
  with check (auth.uid() = user_id or user_id is null);

-- allow owners to read their rows, plus public leaderboard access
create policy if not exists "Users can read own sessions"
  on public.sessions for select
  using (auth.uid() = user_id);

create policy if not exists "Public can read leaderboard"
  on public.sessions for select
  using (true);

grant usage on schema public to anon, authenticated;
grant select, insert on public.sessions to anon, authenticated;
`;

async function main() {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Provisioning failed', res.status, text);
    process.exit(1);
  }

  const body = await res.json();
  console.log('Provisioning completed. Response:', JSON.stringify(body, null, 2));
}

main().catch((err) => {
  console.error('Provisioning failed', err);
  process.exit(1);
});
