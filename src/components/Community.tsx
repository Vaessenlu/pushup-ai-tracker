import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  fetchHighscores,
  register,
  login,
  ScoreEntry,
  HighscoreResult,
} from '@/lib/community';
import { supabase } from '@/lib/supabaseClient';
import { Users } from 'lucide-react';

interface CommunityProps {
  email: string | null;
  token: string | null;
  onAuth: (email: string, token: string, username: string) => void;
  refreshTrigger: number;
}

export const Community: React.FC<CommunityProps> = ({ email, token: propToken, onAuth, refreshTrigger }) => {
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [token, setToken] = useState<string | null>(propToken);
  const [daily, setDaily] = useState<ScoreEntry[]>([]);
  const [weekly, setWeekly] = useState<ScoreEntry[]>([]);
  const [monthly, setMonthly] = useState<ScoreEntry[]>([]);
  const [dailyTotal, setDailyTotal] = useState(0);
  const [weeklyTotal, setWeeklyTotal] = useState(0);
  const [monthlyTotal, setMonthlyTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setToken(propToken);
  }, [propToken]);

  useEffect(() => {
    fetchHighscores('day').then((res) => {
      setDaily(res.scores);
      setDailyTotal(res.total);
    });
    fetchHighscores('week').then((res) => {
      setWeekly(res.scores);
      setWeeklyTotal(res.total);
    });
    fetchHighscores('month').then((res) => {
      setMonthly(res.scores);
      setMonthlyTotal(res.total);
    });
  }, [token, refreshTrigger]);

  const renderTable = (title: string, scores: ScoreEntry[], total: number) => (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      {scores.length === 0 ? (
        <p className="text-gray-500">Noch keine Daten</p>
      ) : (
        <>
          <div className="space-y-1 mb-2">
            {scores.map((s, i) => (
              <div key={s.name} className="flex justify-between">
                <span>
                  {i + 1}. {s.name}
                </span>
                <span>{s.count}</span>
              </div>
            ))}
          </div>
          <div className="text-right font-semibold">Summe: {total}</div>
        </>
      )}
    </Card>
  );

  return (
    <div className="space-y-4">
      {renderTable('Tages-Highscore', daily, dailyTotal)}
      {renderTable('Wochen-Highscore', weekly, weeklyTotal)}
      {renderTable('Monats-Highscore', monthly, monthlyTotal)}
      {!token && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            <h3 className="text-lg font-semibold">Community Login</h3>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <h4 className="font-medium">Login</h4>
              <Input
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                placeholder="E-Mail"
              />
              <Input
                type="password"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                placeholder="Passwort"
              />
              <Button
                onClick={async () => {
                  if (loginEmail && loginPassword) {
                    try {
                      const t = await login(loginEmail, loginPassword);
                      const { data } = await supabase.auth.getUser();
                      const uname =
                        (data.user?.user_metadata as { username?: string })?.username || '';
                      setToken(t);
                      onAuth(loginEmail, t, uname);
                      setError(null);
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  } else {
                    setError('Bitte E-Mail und Passwort eingeben');
                  }
                }}
              >
                Login
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              <h4 className="font-medium">Registrieren</h4>
              <Input
                value={regUsername}
                onChange={e => setRegUsername(e.target.value)}
                placeholder="Benutzername"
              />
              <Input
                value={regEmail}
                onChange={e => setRegEmail(e.target.value)}
                placeholder="E-Mail"
              />
              <Input
                type="password"
                value={regPassword}
                onChange={e => setRegPassword(e.target.value)}
                placeholder="Passwort"
              />
              <Button
                onClick={async () => {
                  if (regEmail && regPassword && regUsername) {
                    try {
                      const t = await register(regEmail, regPassword, regUsername);
                      setToken(t);
                      onAuth(regEmail, t, regUsername);
                      setError(null);
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  } else {
                    setError('Bitte alle Felder ausfüllen');
                  }
                }}
              >
                Registrieren
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default Community;
