import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function AuthForm({ onAuth }: { onAuth: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    const { error } = isLogin
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });

    if (error) setError(error.message);
    else onAuth();
  };

  return (
    <div className="space-y-4 max-w-sm mx-auto mt-20 p-6 bg-white rounded shadow">
      <Input placeholder="E-Mail" value={email} onChange={e => setEmail(e.target.value)} />
      <Input type="password" placeholder="Passwort" value={password} onChange={e => setPassword(e.target.value)} />
      <Button onClick={handleSubmit} className="w-full">
        {isLogin ? 'Einloggen' : 'Registrieren'}
      </Button>
      <button onClick={() => setIsLogin(!isLogin)} className="text-sm underline">
        {isLogin ? 'Noch kein Konto? Registrieren' : 'Bereits registriert? Login'}
      </button>
      {error && <div className="text-red-500 text-sm">{error}</div>}
    </div>
  );
}
