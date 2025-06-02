
import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Session } from '@/pages/Index';
import { Calendar, Clock, Target, Trash2, Trophy } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

interface SessionHistoryProps {
  sessions: Session[];
}

export const SessionHistory: React.FC<SessionHistoryProps> = ({ sessions }) => {
  if (sessions.length === 0) {
    return (
      <Card className="p-8">
        <div className="text-center text-gray-500">
          <Calendar className="h-16 w-16 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-semibold mb-2">Keine Sessions vorhanden</h3>
          <p>Starte dein erstes Training um deinen Verlauf zu verfolgen!</p>
        </div>
      </Card>
    );
  }

  const bestSession = Math.max(...sessions.map(s => s.count));

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}min ${secs}s` : `${secs}s`;
  };

  const getPerformanceBadge = (count: number) => {
    const percentage = (count / bestSession) * 100;
    if (percentage >= 90) return { variant: 'default' as const, text: 'Exzellent', color: 'bg-yellow-500' };
    if (percentage >= 75) return { variant: 'default' as const, text: 'Sehr gut', color: 'bg-green-500' };
    if (percentage >= 50) return { variant: 'secondary' as const, text: 'Gut', color: 'bg-blue-500' };
    return { variant: 'outline' as const, text: 'Aufbau', color: 'bg-gray-500' };
  };

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white">
          <div className="flex items-center gap-3">
            <Calendar className="h-6 w-6" />
            <div>
              <p className="text-blue-100 text-sm">Gesamt Sessions</p>
              <p className="text-xl font-bold">{sessions.length}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-gradient-to-r from-green-500 to-green-600 text-white">
          <div className="flex items-center gap-3">
            <Trophy className="h-6 w-6" />
            <div>
              <p className="text-green-100 text-sm">Beste Session</p>
              <p className="text-xl font-bold">{bestSession} Liegestützen</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-gradient-to-r from-purple-500 to-purple-600 text-white">
          <div className="flex items-center gap-3">
            <Clock className="h-6 w-6" />
            <div>
              <p className="text-purple-100 text-sm">Letzte Session</p>
              <p className="text-xl font-bold">
                {sessions.length > 0 ? formatDistanceToNow(sessions[0].date, { 
                  addSuffix: true, 
                  locale: de 
                }) : 'Nie'}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Session List */}
      <div className="space-y-3">
        {sessions.map((session, index) => {
          const performance = getPerformanceBadge(session.count);
          const isPersonalRecord = session.count === bestSession;
          
          return (
            <Card key={session.id} className="p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {/* Session Number */}
                  <div className="flex-shrink-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold ${performance.color}`}>
                      #{sessions.length - index}
                    </div>
                  </div>

                  {/* Session Details */}
                  <div className="flex-grow">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-lg font-semibold">{session.count} Liegestützen</h3>
                      {isPersonalRecord && (
                        <Badge className="bg-yellow-500 hover:bg-yellow-600">
                          <Trophy className="h-3 w-3 mr-1" />
                          PR
                        </Badge>
                      )}
                      <Badge variant={performance.variant}>
                        {performance.text}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-6 text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {session.date.toLocaleDateString('de-DE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric'
                        })}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {formatDuration(session.duration)}
                      </div>
                      <div className="flex items-center gap-1">
                        <Target className="h-4 w-4" />
                        {session.avgTimePerRep.toFixed(1)}s/Rep
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <div className="text-right text-sm text-gray-500">
                    {formatDistanceToNow(session.date, { 
                      addSuffix: true,
                      locale: de 
                    })}
                  </div>
                  <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mt-3">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Fortschritt zum Rekord</span>
                  <span>{Math.round((session.count / bestSession) * 100)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full transition-all duration-300 ${performance.color}`}
                    style={{ width: `${(session.count / bestSession) * 100}%` }}
                  />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Load More Button (if needed for many sessions) */}
      {sessions.length > 10 && (
        <Card className="p-4">
          <Button variant="outline" className="w-full">
            Weitere Sessions laden ({sessions.length - 10} verbleibend)
          </Button>
        </Card>
      )}
    </div>
  );
};
