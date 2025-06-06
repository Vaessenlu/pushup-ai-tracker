import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Supabase URL und Key fehlen. Bitte in der .env als VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY oder NEXT_PUBLIC_* hinterlegen.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);

