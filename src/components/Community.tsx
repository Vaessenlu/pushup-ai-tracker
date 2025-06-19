import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { fetchHighscores, ScoreEntry, HighscoreResult } from '@/lib/community';


interface CommunityProps {
  refreshTrigger: number;
  exercise: 'pushup' | 'squat';
}

export const Community: React.FC<CommunityProps> = ({ refreshTrigger, exercise }) => {
  const [daily, setDaily] = useState<ScoreEntry[]>([]);
  const [weekly, setWeekly] = useState<ScoreEntry[]>([]);
  const [monthly, setMonthly] = useState<ScoreEntry[]>([]);
  const [dailyTotal, setDailyTotal] = useState(0);
  const [weeklyTotal, setWeeklyTotal] = useState(0);
  const [monthlyTotal, setMonthlyTotal] = useState(0);

  useEffect(() => {
    fetchHighscores('day', exercise)
      .then((res) => {
        setDaily(res.scores);
        setDailyTotal(res.total);
      })
      .catch((err) => {
        console.error('Failed to load daily highscores', err);
        setDaily([]);
        setDailyTotal(0);
      });

    fetchHighscores('week', exercise)
      .then((res) => {
        setWeekly(res.scores);
        setWeeklyTotal(res.total);
      })
      .catch((err) => {
        console.error('Failed to load weekly highscores', err);
        setWeekly([]);
        setWeeklyTotal(0);
      });

    fetchHighscores('month', exercise)
      .then((res) => {
        setMonthly(res.scores);
        setMonthlyTotal(res.total);
      })
      .catch((err) => {
        console.error('Failed to load monthly highscores', err);
        setMonthly([]);
        setMonthlyTotal(0);
      });
  }, [refreshTrigger, exercise]);

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
      <h2 className="text-xl font-bold text-center">
        {exercise === 'pushup' ? 'Liegestütze' : 'Kniebeugen'}
      </h2>
      {renderTable('Tages-Highscore', daily, dailyTotal)}
      {renderTable('Wochen-Highscore', weekly, weeklyTotal)}
      {renderTable('Monats-Highscore', monthly, monthlyTotal)}
    </div>
  );
};

export default Community;
