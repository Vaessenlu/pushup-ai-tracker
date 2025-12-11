import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { isUsernameTaken } from '@/lib/community/server';

export default function AuthForm({ onAuth }: { onAuth: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [needsUsername, setNeedsUsername] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSupabaseError = (reason: unknown) => {
    const message =
      reason instanceof Error && reason.message
        ? reason.message
        : 'Supabase nicht erreichbar. Bitte Verbindung oder .env prüfen.';
    setError(message);
  };

  const handleSubmit = async () => {
    setError('');
    setIsSubmitting(true);
    if (!email || !password || (!isLogin && !username)) {
      setError('Bitte alle Felder ausfüllen');
      setIsSubmitting(false);
      return;
    }

    if (needsUsername) {
      if (!username) {
        setError('Bitte Benutzernamen eingeben');
        setIsSubmitting(false);
        return;
      }
      try {
        if (await isUsernameTaken(username)) {
          setError('Benutzername bereits vergeben');
          return;
        }
        const { error } = await supabase.auth.updateUser({ data: { username } });
        if (error) setError(error.message);
        else {
          setNeedsUsername(false);
          onAuth();
        }
      } catch (e) {
        handleSupabaseError(e);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error || !data.user) {
          setError(error?.message || 'Login fehlgeschlagen');
          return;
        }
        const uname = (data.user.user_metadata as { username?: string }).username;
        if (!uname) {
          setNeedsUsername(true);
          return;
        }
        onAuth();
      } else {
        if (await isUsernameTaken(username)) {
          setError('Benutzername bereits vergeben');
          return;
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username } },
        });
        if (error) setError(error.message);
        else onAuth();
      }
    } catch (e) {
      handleSupabaseError(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 max-w-sm mx-auto mt-20 p-6 bg-white rounded shadow">
      {!needsUsername && (
        <Input placeholder="E-Mail" value={email} onChange={e => setEmail(e.target.value)} />
      )}
      {(!isLogin || needsUsername) && (
        <Input
          placeholder="Benutzername"
          value={username}
          onChange={e => setUsername(e.target.value)}
        />
      )}
      {!needsUsername && (
        <Input
          type="password"
          placeholder="Passwort"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
      )}
      <Button onClick={handleSubmit} className="w-full" disabled={isSubmitting}>
        {needsUsername ? 'Speichern' : isLogin ? 'Einloggen' : 'Registrieren'}
      </Button>
      {!needsUsername && (
        <button
          onClick={() => {
            setIsLogin(!isLogin);
            setError('');
            setUsername('');
          }}
          className="text-sm underline"
        >
          {isLogin ? 'Noch kein Konto? Registrieren' : 'Bereits registriert? Login'}
        </button>
      )}
      {error && <div className="text-red-500 text-sm">{error}</div>}
    </div>
  );
}
