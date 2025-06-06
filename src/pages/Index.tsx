
import React, { useState, useEffect } from 'react';
import PushupTracker from '@/components/PushupTracker';
import { StatsDisplay } from '@/components/StatsDisplay';
import { SessionHistory } from '@/components/SessionHistory';
import Community from '@/components/Community';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity, BarChart3, History, Target, Users } from 'lucide-react';
import { saveCommunitySession, saveSessionServer } from '@/lib/community';

export interface Session {
  id: string;
  date: Date;
  count: number;
  duration: number;
  avgTimePerRep: number;
}

const Index = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isTracking, setIsTracking] = useState(false);
  const [communityEmail, setCommunityEmail] = useState<string | null>(null);
  const [communityToken, setCommunityToken] = useState<string | null>(null);

  useEffect(() => {
    const storedEmail = localStorage.getItem('communityEmail');
    const storedToken = localStorage.getItem('communityToken');
    if (storedEmail) setCommunityEmail(storedEmail);
    if (storedToken) setCommunityToken(storedToken);
  }, []);

  const handleRegister = (email: string, token: string) => {
    setCommunityEmail(email);
    setCommunityToken(token);
    localStorage.setItem('communityEmail', email);
    localStorage.setItem('communityToken', token);
  };

  const handleSessionComplete = (session: Omit<Session, 'id'>) => {
    const newSession: Session = {
      ...session,
      id: Date.now().toString(),
    };
    setSessions(prev => [newSession, ...prev]);
    if (communityToken) {
      saveSessionServer(communityToken, {
        date: new Date().toISOString(),
        count: newSession.count,
      });
    } else if (communityEmail) {
      saveCommunitySession({
        email: communityEmail,
        date: new Date().toISOString(),
        count: newSession.count,
      });
    }
  };

  const totalPushups = sessions.reduce((sum, session) => sum + session.count, 0);
  const totalSessions = sessions.length;
  const avgPerSession = totalSessions > 0 ? Math.round(totalPushups / totalSessions) : 0;
  const bestSession = sessions.length > 0 ? Math.max(...sessions.map(s => s.count)) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full">
              <Activity className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              KI Liegestützen Tracker
            </h1>
          </div>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Nutze KI-basierte Bewegungserkennung um deine Liegestützen automatisch zu zählen und deine Fortschritte zu verfolgen.
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="p-6 bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0">
            <div className="flex items-center gap-3">
              <Target className="h-8 w-8" />
              <div>
                <p className="text-blue-100 text-sm">Gesamt</p>
                <p className="text-2xl font-bold">{totalPushups}</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-6 bg-gradient-to-br from-green-500 to-green-600 text-white border-0">
            <div className="flex items-center gap-3">
              <BarChart3 className="h-8 w-8" />
              <div>
                <p className="text-green-100 text-sm">Sessions</p>
                <p className="text-2xl font-bold">{totalSessions}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0">
            <div className="flex items-center gap-3">
              <Activity className="h-8 w-8" />
              <div>
                <p className="text-purple-100 text-sm">Durchschnitt</p>
                <p className="text-2xl font-bold">{avgPerSession}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-orange-500 to-red-500 text-white border-0">
            <div className="flex items-center gap-3">
              <History className="h-8 w-8" />
              <div>
                <p className="text-orange-100 text-sm">Rekord</p>
                <p className="text-2xl font-bold">{bestSession}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="tracker" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 bg-white shadow-lg">
            <TabsTrigger value="tracker" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Tracker
            </TabsTrigger>
            <TabsTrigger value="stats" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Statistiken
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Verlauf
            </TabsTrigger>
            <TabsTrigger value="community" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Community
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tracker">
            <PushupTracker 
              onSessionComplete={handleSessionComplete}
              isTracking={isTracking}
              setIsTracking={setIsTracking}
            />
          </TabsContent>

          <TabsContent value="stats">
            <StatsDisplay sessions={sessions} />
          </TabsContent>

          <TabsContent value="history">
            <SessionHistory sessions={sessions} />
          </TabsContent>
          <TabsContent value="community">
            <Community email={communityEmail} token={communityToken} onAuth={handleRegister} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Index;
