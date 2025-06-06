import { supabase } from './supabaseClient';

export interface ForumPost {
  id: number;
  email: string;
  content: string;
  created_at: string;
}

export async function fetchPosts(): Promise<ForumPost[]> {
  const { data, error } = await supabase
    .from('posts')
    .select('id, email, content, created_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error('Fehler beim Laden der Posts');
  return (data ?? []) as ForumPost[];
}

export async function addPost(content: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email;
  if (!email) throw new Error('Nicht eingeloggt');
  const { error } = await supabase.from('posts').insert({ email, content });
  if (error) throw new Error('Fehler beim Speichern');
}
