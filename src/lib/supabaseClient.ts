import { createClient } from '@supabase/supabase-js';

// Read credentials from build-time env or optionally from a runtime global
const runtimeEnv = (globalThis as unknown as { env?: Record<string, string> }).env || {};
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
  runtimeEnv.VITE_SUPABASE_URL ||
  runtimeEnv.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  runtimeEnv.VITE_SUPABASE_ANON_KEY ||
  runtimeEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Supabase URL und Key fehlen. Bitte in der .env als VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY oder NEXT_PUBLIC_* hinterlegen.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);

