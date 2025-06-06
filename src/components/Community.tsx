import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchHighscores, register, login, ScoreEntry } from '@/lib/community';
import { Users } from 'lucide-react';

interface CommunityProps {
  email: string | null;
  token: string | null;
  onAuth: (email: string, token: string) => void;
}

export const Community: React.FC<CommunityProps> = ({ email, token: propToken, onAuth }) => {
  const [regEmail, setRegEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState<string | null>(propToken);
  const [daily, setDaily] = useState<ScoreEntry[]>([]);
  const [weekly, setWeekly] = useState<ScoreEntry[]>([]);
  const [monthly, setMonthly] = useState<ScoreEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setToken(propToken);
  }, [propToken]);

  useEffect(() => {
    if (token) {
      fetchHighscores('day').then(setDaily);
      fetchHighscores('week').then(setWeekly);
      fetchHighscores('month').then(setMonthly);
    }
  }, [token]);

  if (!token) {
    return (
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Community Login</h3>
        </div>
        <div className="flex flex-col gap-2">
          <Input
            value={regEmail}
            onChange={(e) => setRegEmail(e.target.value)}
            placeholder="E-Mail"
          />
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Passwort"
          />
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-2">
            <Button
              onClick={async () => {
                if (regEmail && password) {
                  try {
                    const t = await register(regEmail, password);
                    setToken(t);
                    onAuth(regEmail, t);
                    setError(null);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }
              }}
            >
              Registrieren
            </Button>
            <Button
              onClick={async () => {
                if (regEmail && password) {
                  try {
                    const t = await login(regEmail, password);
                    setToken(t);
                    onAuth(regEmail, t);
                    setError(null);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }
              }}
            >
              Login
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  const renderTable = (title: string, scores: ScoreEntry[]) => (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      {scores.length === 0 ? (
        <p className="text-gray-500">Noch keine Daten</p>
      ) : (
        <div className="space-y-1">
          {scores.map((s, i) => (
            <div key={s.email} className="flex justify-between">
              <span>
                {i + 1}. {s.email}
              </span>
              <span>{s.count}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );

  return (
    <div className="space-y-4">
      {renderTable('Tages-Highscore', daily)}
      {renderTable('Wochen-Highscore', weekly)}
      {renderTable('Monats-Highscore', monthly)}
    </div>
  );
};

export default Community;
