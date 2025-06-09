import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const url = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!url || !serviceKey) {
  console.log('Supabase service credentials missing. Skipping schema check.');
  process.exit(0);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

async function columnExists(column) {
  const { data, error } = await supabase
    .from('information_schema.columns')
    .select('column_name')
    .match({ table_schema: 'public', table_name: 'sessions', column_name: column })
    .maybeSingle();
  if (error) {
    console.error('Schema check failed', error.message);
    return false;
  }
  return !!data;
}

async function ensureColumn(name, type) {
  if (await columnExists(name)) return;
  console.log(`Adding column ${name}`);
  const { error } = await supabase.rpc('execute_sql', { sql: `ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS ${name} ${type};` });
  if (error) console.error(`Failed to add column ${name}`, error.message);
}

(async () => {
  await ensureColumn('email', 'text');
  await ensureColumn('username', 'text');
  await ensureColumn('user_id', 'uuid');
  await ensureColumn('exercise', 'text');
  await ensureColumn('duration', 'integer');
  await ensureColumn('created_at', 'timestamp with time zone DEFAULT now()');
})();
