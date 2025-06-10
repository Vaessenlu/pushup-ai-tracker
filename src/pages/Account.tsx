import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';

export default function Account() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  if (!user) {
    return (
      <div className="p-6 text-center">
        <p>Bitte einloggen.</p>
        <Link to="/login">
          <Button className="mt-4">Login</Button>
        </Link>
      </div>
    );
  }

  const username = (user.user_metadata as { username?: string })?.username || '';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-yellow-50 via-orange-50 to-pink-50">
      <Card className="p-6 space-y-4 w-80 text-center">
        <h2 className="text-2xl font-bold">Dein Konto</h2>
        <p>
          <strong>Email:</strong> {user.email}
        </p>
        <p>
          <strong>Benutzername:</strong> {username || '-'}
        </p>
        <Button onClick={() => supabase.auth.signOut()}>Logout</Button>
        <Link to="/" className="block mt-2 underline text-sm">
          Zurück
        </Link>
      </Card>
    </div>
  );
}
