import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { computeHighscores, ScoreEntry } from '@/lib/community';
import { Users } from 'lucide-react';

interface CommunityProps {
  email: string | null;
  onRegister: (email: string) => void;
}

export const Community: React.FC<CommunityProps> = ({ email, onRegister }) => {
  const [regEmail, setRegEmail] = useState('');
  const [daily, setDaily] = useState<ScoreEntry[]>([]);
  const [weekly, setWeekly] = useState<ScoreEntry[]>([]);
  const [monthly, setMonthly] = useState<ScoreEntry[]>([]);

  useEffect(() => {
    setDaily(computeHighscores('day'));
    setWeekly(computeHighscores('week'));
    setMonthly(computeHighscores('month'));
  }, [email]);

  if (!email) {
    return (
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Community beitreten</h3>
        </div>
        <div className="flex gap-2">
          <Input
            value={regEmail}
            onChange={(e) => setRegEmail(e.target.value)}
            placeholder="E-Mail"
          />
          <Button
            onClick={() => {
              if (regEmail) {
                onRegister(regEmail);
                setRegEmail('');
              }
            }}
          >
            Registrieren
          </Button>
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
