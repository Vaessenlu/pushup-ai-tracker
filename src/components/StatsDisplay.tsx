
import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Area, AreaChart } from 'recharts';
import { Session } from '@/pages/Index';
import { TrendingUp, Clock, Zap, Target } from 'lucide-react';

interface StatsDisplayProps {
  sessions: Session[];
}

export const StatsDisplay: React.FC<StatsDisplayProps> = ({ sessions }) => {
  if (sessions.length === 0) {
    return (
      <Card className="p-8">
        <div className="text-center text-gray-500">
          <Target className="h-16 w-16 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-semibold mb-2">Noch keine Daten</h3>
          <p>Starte dein erstes Training um Statistiken zu sehen!</p>
        </div>
      </Card>
    );
  }

  // Calculate statistics
  const totalPushups = sessions.reduce((sum, session) => sum + session.count, 0);
  const totalTime = sessions.reduce((sum, session) => sum + session.duration, 0);
  const avgPerSession = Math.round(totalPushups / sessions.length);
  const bestSession = Math.max(...sessions.map(s => s.count));
  const avgTimePerRep = totalPushups > 0 ? totalTime / totalPushups : 0;

  // Prepare chart data (last 10 sessions)
  const chartData = sessions.slice(0, 10).reverse().map((session, index) => ({
    session: `#${index + 1}`,
    count: session.count,
    duration: session.duration,
    date: session.date.toLocaleDateString('de-DE'),
    avgTime: session.avgTimePerRep,
  }));

  // Weekly progress
  const weeklyData = sessions.reduce((acc, session) => {
    const week = getWeekString(session.date);
    if (!acc[week]) {
      acc[week] = { week, count: 0, sessions: 0 };
    }
    acc[week].count += session.count;
    acc[week].sessions += 1;
    return acc;
  }, {} as Record<string, { week: string; count: number; sessions: number }>);

  const weeklyChartData = Object.values(weeklyData).slice(-8);

  function getWeekString(date: Date): string {
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - date.getDay());
    return `${startOfWeek.getDate()}.${startOfWeek.getMonth() + 1}`;
  }

  return (
    <div className="space-y-6">
      {/* Key Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-6 bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-8 w-8" />
            <div>
              <p className="text-blue-100 text-sm">Durchschnitt/Session</p>
              <p className="text-2xl font-bold">{avgPerSession}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-green-500 to-green-600 text-white">
          <div className="flex items-center gap-3">
            <Target className="h-8 w-8" />
            <div>
              <p className="text-green-100 text-sm">Beste Session</p>
              <p className="text-2xl font-bold">{bestSession}</p>
            </div>
          </div>
        </div>

        <Card className="p-6 bg-gradient-to-br from-purple-500 to-purple-600 text-white">
          <div className="flex items-center gap-3">
            <Clock className="h-8 w-8" />
            <div>
              <p className="text-purple-100 text-sm">Ø Zeit/Liegestütze</p>
              <p className="text-2xl font-bold">{avgTimePerRep.toFixed(1)}s</p>
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-orange-500 to-red-500 text-white">
          <div className="flex items-center gap-3">
            <Zap className="h-8 w-8" />
            <div>
              <p className="text-orange-100 text-sm">Gesamt Zeit</p>
              <p className="text-2xl font-bold">{Math.round(totalTime / 60)}min</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Session Progress Chart */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Session Verlauf</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.1}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="session" />
              <YAxis />
              <Tooltip 
                labelFormatter={(label) => `Session ${label}`}
                formatter={(value, name) => [
                  name === 'count' ? `${value} Liegestützen` : `${value}s`,
                  name === 'count' ? 'Anzahl' : 'Dauer'
                ]}
              />
              <Area 
                type="monotone" 
                dataKey="count" 
                stroke="#3B82F6" 
                fillOpacity={1} 
                fill="url(#colorCount)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Weekly Progress */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Wöchentlicher Fortschritt</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" />
              <YAxis />
              <Tooltip 
                formatter={(value, name) => [
                  `${value} ${name === 'count' ? 'Liegestützen' : 'Sessions'}`,
                  name === 'count' ? 'Gesamt' : 'Sessions'
                ]}
              />
              <Bar dataKey="count" fill="#10B981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Leistungsmetriken</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Konsistenz</span>
              <Badge variant="outline">
                {sessions.length >= 7 ? 'Sehr gut' : sessions.length >= 3 ? 'Gut' : 'Verbesserbar'}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Verbesserung (letzte 5)</span>
              <Badge variant={getTrend(sessions.slice(0, 5)) >= 0 ? 'default' : 'destructive'}>
                {getTrend(sessions.slice(0, 5)) >= 0 ? '↗️ Aufwärts' : '↘️ Abwärts'}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Beste Woche</span>
              <span className="font-semibold">
                {weeklyChartData.length > 0 ? Math.max(...weeklyChartData.map(w => w.count)) : 0} Liegestützen
              </span>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Ziele & Empfehlungen</h3>
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-sm font-medium text-blue-900">Nächstes Ziel</p>
              <p className="text-blue-700">{bestSession + 5} Liegestützen in einer Session</p>
            </div>
            <div className="p-3 bg-green-50 rounded-lg">
              <p className="text-sm font-medium text-green-900">Empfehlung</p>
              <p className="text-green-700">
                {avgPerSession < 10 ? 'Fokus auf Ausdauer - mehr Wiederholungen' :
                 avgPerSession < 25 ? 'Steigere langsam die Intensität' :
                 'Excellente Leistung! Halte das Tempo bei'}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

function getTrend(sessions: Session[]): number {
  if (sessions.length < 2) return 0;
  const recent = sessions.slice(0, Math.min(3, sessions.length));
  const older = sessions.slice(Math.min(3, sessions.length));
  
  const recentAvg = recent.reduce((sum, s) => sum + s.count, 0) / recent.length;
  const olderAvg = older.length > 0 ? older.reduce((sum, s) => sum + s.count, 0) / older.length : recentAvg;
  
  return recentAvg - olderAvg;
}
