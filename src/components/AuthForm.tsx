import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { isUsernameTaken } from '@/lib/community';

export default function AuthForm({ onAuth }: { onAuth: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [needsUsername, setNeedsUsername] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    if (!email || !password || (!isLogin && !username)) {
      setError('Bitte alle Felder ausfüllen');
      return;
    }

    if (needsUsername) {
      if (!username) {
        setError('Bitte Benutzernamen eingeben');
        return;
      }
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
      return;
    }

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
      <Button onClick={handleSubmit} className="w-full">
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
