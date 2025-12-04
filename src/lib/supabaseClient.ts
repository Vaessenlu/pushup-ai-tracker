import { createClient } from '@supabase/supabase-js';

const OVERRIDE_URL_KEY = 'supabase_override_url';
const OVERRIDE_ANON_KEY = 'supabase_override_anon_key';

// Read credentials from build-time env, runtime globals, or optional browser overrides
const runtimeEnv =
  (globalThis as unknown as { env?: Record<string, string> }).env ||
  (typeof process !== 'undefined' ? process.env : {});

const readOverride = () => {
  if (typeof localStorage === 'undefined') return null;
  const url = localStorage.getItem(OVERRIDE_URL_KEY);
  const anon = localStorage.getItem(OVERRIDE_ANON_KEY);
  if (!url || !anon) return null;
  return { url, anonKey: anon };
};

const overrides = readOverride();

const supabaseUrl =
  overrides?.url ||
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
  runtimeEnv.VITE_SUPABASE_URL ||
  runtimeEnv.NEXT_PUBLIC_SUPABASE_URL ||
  runtimeEnv.SUPABASE_URL;
const supabaseKey =
  overrides?.anonKey ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  runtimeEnv.VITE_SUPABASE_ANON_KEY ||
  runtimeEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  runtimeEnv.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Supabase URL und Key fehlen. Bitte in der .env als VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY oder NEXT_PUBLIC_* hinterlegen oder im Supabase-Setup-Formular eintragen.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export function setSupabaseOverride(url: string, anonKey: string) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(OVERRIDE_URL_KEY, url);
  localStorage.setItem(OVERRIDE_ANON_KEY, anonKey);
}

export function clearSupabaseOverride() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(OVERRIDE_URL_KEY);
  localStorage.removeItem(OVERRIDE_ANON_KEY);
}

export function getSupabaseConfigMeta() {
  const host = (() => {
    try {
      return new URL(supabaseUrl).host;
    } catch (e) {
      return supabaseUrl;
    }
  })();

  return {
    url: supabaseUrl,
    anonKey: supabaseKey,
    host,
    hasBrowserOverride: Boolean(overrides),
  };
}
