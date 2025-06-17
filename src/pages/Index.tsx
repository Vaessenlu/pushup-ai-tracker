
import React, { useState, useEffect } from 'react';
import PushupTracker from '@/components/PushupTracker';
import { StatsDisplay } from '@/components/StatsDisplay';
import { SessionHistory } from '@/components/SessionHistory';
import Community from '@/components/Community';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from '@/components/ui/carousel';
import { Activity, BarChart3, History, Target, Users } from 'lucide-react';
import { saveCommunitySession, saveSessionServer } from '@/lib/community';
import { supabase } from '@/lib/supabaseClient';
import { Link } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';

export interface Session {
  id: string;
  date: Date;
  count: number;
  duration: number;
  avgTimePerRep: number;
  exercise: 'pushup' | 'squat';
  exercise_type?: 'pushup' | 'squat';
}

interface IndexProps {
  user?: User | null;
}

const Index: React.FC<IndexProps> = ({ user }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isTracking, setIsTracking] = useState(false);
  const [communityEmail, setCommunityEmail] = useState<string | null>(null);
  const [communityUsername, setCommunityUsername] = useState<string | null>(null);
  const [highscoreTrigger, setHighscoreTrigger] = useState(0);

  useEffect(() => {
    const storedEmail = localStorage.getItem('communityEmail');
    const storedUsername = localStorage.getItem('communityUsername');
    if (storedEmail) setCommunityEmail(storedEmail);
    if (storedUsername) setCommunityUsername(storedUsername);
  }, []);

  useEffect(() => {
    async function syncSession() {
      if (!user) {
        setCommunityEmail(null);
        setCommunityUsername(null);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        const u = data.session.user;
        if (u.email) {
          setCommunityEmail(u.email);
          localStorage.setItem('communityEmail', u.email);
        }
        const uname = (u.user_metadata as { username?: string }).username;
        if (uname) {
          setCommunityUsername(uname);
          localStorage.setItem('communityUsername', uname);
        } else {
          setCommunityUsername(null);
          localStorage.removeItem('communityUsername');
        }
      }
    }
    syncSession();
  }, [user]);

  useEffect(() => {
    async function load() {
      if (!user) {
        setSessions([]);
        return;
      }
      let { data, error } = await supabase
        .from('sessions')
        .select('id, count, duration, created_at, exercise_type, exercise')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error && (error.message?.includes('exercise') || error.code === '42703')) {
        const res = await supabase
          .from('sessions')
          .select('id, count, duration, created_at, exercise_type, exercise')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        data = res.data;
        error = res.error;
      }
      if (data) {
        setSessions(
          data.map((s) => ({
            id: s.id as string,
            date: new Date(s.created_at as string),
            count: s.count as number,
            duration: s.duration as number,
            avgTimePerRep:
              (s.duration as number) && (s.count as number)
                ? (s.duration as number) / (s.count as number)
                : 0,
            exercise:
              ((s as Record<string, string | number>).exercise_type as
                | 'pushup'
                | 'squat') ||
              ((s as Record<string, string | number>).exercise as 'pushup' | 'squat') ||
              'pushup',
            exercise_type:
              ((s as Record<string, string | number>).exercise_type as
                | 'pushup'
                | 'squat') ||
              ((s as Record<string, string | number>).exercise as 'pushup' | 'squat') ||
              'pushup',
          }))
        );
      }
    }
    load();
  }, [user]);


  const handleSessionComplete = async (session: Omit<Session, 'id'>) => {
    let newSession: Session = {
      ...session,
      id: Date.now().toString(),
    };
    if (user) {
      const meta = user.user_metadata as { username?: string };
      const username = communityUsername || meta.username;
      try {
        const { data } = await supabase
          .from('sessions')
          .insert({
            user_id: user.id,
            count: session.count,
            duration: session.duration,
            exercise: session.exercise,
            exercise_type: session.exercise,
            username,
          })
          .select('id')
          .single();
        if (data?.id) {
          newSession = { ...newSession, id: data.id };
        }
      } catch (e) {
        const msg = (e as { message?: string }).message || '';
        if (msg.includes('exercise')) {
          try {
            const { data } = await supabase
              .from('sessions')
              .insert({
                user_id: user.id,
                count: session.count,
                duration: session.duration,
                exercise_type: session.exercise,
                username,
              })
              .select('id')
              .single();
            if (data?.id) newSession = { ...newSession, id: data.id };
          } catch (e2) {
            console.error('Supabase insert failed', e2);
          }
        } else {
          console.error('Supabase insert failed', e);
        }
      }
    }
    setSessions(prev => [newSession, ...prev]);
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session) {
      await saveSessionServer(
        {
          access_token: sessionData.session.access_token,
          refresh_token: sessionData.session.refresh_token,
        },
        {
          date: new Date().toISOString(),
          count: newSession.count,
          exercise: newSession.exercise,
          exercise_type: newSession.exercise,
        },
        communityUsername || undefined,
      );
    } else if (communityEmail) {
      saveCommunitySession({
        email: communityEmail,
        username: communityUsername || undefined,
        date: new Date().toISOString(),
        count: newSession.count,
        exercise: newSession.exercise,
        exercise_type: newSession.exercise,
      });
    }

    // trigger highscore refresh
    setHighscoreTrigger((t) => t + 1);
  };

  const totalPushups = sessions.filter(s => s.exercise === 'pushup').reduce((sum, s) => sum + s.count, 0);
  const totalSquats = sessions.filter(s => s.exercise === 'squat').reduce((sum, s) => sum + s.count, 0);
  const totalSessions = sessions.length;
  const avgPerSession = totalSessions > 0 ? Math.round(totalPushups / totalSessions) : 0;
  const bestSession = sessions.length > 0 ? Math.max(...sessions.map(s => s.count)) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-orange-50 to-pink-50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-end mb-4 gap-2">
          {user ? (
            <>
              <Link to="/account">
                <Button variant="outline">Account</Button>
              </Link>
              <Button variant="outline" onClick={() => supabase.auth.signOut()}>
                Logout
              </Button>
            </>
          ) : (
            <Link to="/login">
              <Button variant="outline">Login / Registrieren</Button>
            </Link>
          )}
        </div>
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
          <div className="p-3 bg-gradient-to-r from-orange-500 to-pink-600 rounded-full">
              <Activity className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-orange-600 to-pink-600 bg-clip-text text-transparent">
              movementtracker
            </h1>
          </div>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Zähle deine Übungen automatisch und verfolge deine Fortschritte.
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          <Card className="p-6 bg-gradient-to-br from-orange-400 to-orange-500 text-white border-0">
            <div className="flex items-center gap-3">
              <Target className="h-8 w-8" />
              <div>
                <p className="text-blue-100 text-sm">Gesamt</p>
                <p className="text-2xl font-bold">{totalPushups}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-green-400 to-emerald-500 text-white border-0">
            <div className="flex items-center gap-3">
              <Activity className="h-8 w-8" />
              <div>
                <p className="text-green-100 text-sm">Kniebeugen</p>
                <p className="text-2xl font-bold">{totalSquats}</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-6 bg-gradient-to-br from-yellow-400 to-yellow-500 text-white border-0">
            <div className="flex items-center gap-3">
              <BarChart3 className="h-8 w-8" />
              <div>
                <p className="text-green-100 text-sm">Sessions</p>
                <p className="text-2xl font-bold">{totalSessions}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-pink-500 to-pink-600 text-white border-0">
            <div className="flex items-center gap-3">
              <Activity className="h-8 w-8" />
              <div>
                <p className="text-purple-100 text-sm">Durchschnitt</p>
                <p className="text-2xl font-bold">{avgPerSession}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-rose-400 to-red-500 text-white border-0">
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
              user={user}
            />
          </TabsContent>

          <TabsContent value="stats">
            <div className="grid md:grid-cols-2 gap-4">
              <StatsDisplay sessions={sessions} exercise="pushup" />
              <StatsDisplay sessions={sessions} exercise="squat" />
            </div>
          </TabsContent>

          <TabsContent value="history">
            <SessionHistory sessions={sessions} />
          </TabsContent>
          <TabsContent value="community">
            <Carousel className="w-full">
              <CarouselContent>
                <CarouselItem className="basis-full">
                  <Community
                    refreshTrigger={highscoreTrigger}
                    exercise="pushup"
                  />
                </CarouselItem>
                <CarouselItem className="basis-full">
                  <Community
                    refreshTrigger={highscoreTrigger}
                    exercise="squat"
                  />
                </CarouselItem>
              </CarouselContent>
              <CarouselPrevious />
              <CarouselNext />
            </Carousel>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Index;
