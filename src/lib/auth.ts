import { supabase } from './supabaseClient';

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

export async function register(
  email: string,
  password: string,
  username: string,
): Promise<AuthTokens> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });
  if (error || !data.session) {
    throw new Error('Registrierung fehlgeschlagen');
  }
  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  };
}

export async function login(email: string, password: string): Promise<AuthTokens> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error('Login fehlgeschlagen');
  }
  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  };
}
